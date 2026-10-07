import { parseCacheMaxAgeMs, withExpiry } from './cache';
import { parseAiCatalog } from './catalog';
import { parseServerCard } from './schema';
import {
  AI_CATALOG_MEDIA_TYPE,
  DEFAULT_FAILURE_TTL_MS,
  MAX_RESPONSE_BYTES,
  MAX_SERVER_CARDS,
  REQUEST_TIMEOUT_MS,
  SERVER_CARD_MEDIA_TYPE,
  type CatalogEntry,
  type ScannerOptions,
  type ScanResult,
  type ScanStatus,
  type ScanTarget,
  type ScanWarning,
} from './types';

const TIMEOUT_MESSAGE = 'Discovery request timed out.';

interface FetchedDocument {
  timedOut?: boolean;
  errorMessage?: string;
  status?: number;
  headers?: Headers;
  contentType?: string | null;
  etag?: string;
  notModified?: boolean;
  text?: string;
  tooLarge?: boolean;
}

export async function scanMcpDiscovery(target: ScanTarget, options: ScannerOptions = {}): Promise<ScanResult> {
  const now = options.now ?? Date.now;
  const fetchedAt = now();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const maxCards = options.maxCards ?? MAX_SERVER_CARDS;
  const previous = options.previous;

  const catalog = await fetchDocument(target.endpoint, AI_CATALOG_MEDIA_TYPE, previous?.catalogEtag, {
    ...options,
    timeoutMs,
    maxResponseBytes,
  });
  const base = createBaseResult(target, fetchedAt, catalog);
  let cacheTtl = catalog.headers ? parseCacheMaxAgeMs(catalog.headers.get('cache-control')) : undefined;

  if (catalog.timedOut) {
    return withExpiry({ ...base, status: 'timeout', errorMessage: TIMEOUT_MESSAGE }, cacheTtl);
  }

  if (catalog.errorMessage) {
    return withExpiry({ ...base, status: 'network-error', errorMessage: catalog.errorMessage }, cacheTtl);
  }

  if (catalog.status === 404 || catalog.status === 410) {
    return withExpiry(
      {
        ...base,
        status: 'not-found',
        errorMessage: `No AI Catalog found at ${target.endpoint}.`,
      },
      cacheTtl,
    );
  }

  if (catalog.notModified) {
    if (!previous) {
      return withExpiry(
        {
          ...base,
          status: 'network-error',
          errorMessage: 'AI Catalog returned Not Modified without a cached document.',
        },
        cacheTtl,
      );
    }

    const resolved = await resolveEntries(previous.entries, true, previous, options, timeoutMs, maxResponseBytes, maxCards);
    return finishScan(base, previous.warnings, resolved.entries, previous.catalogEtag, preferTtl(cacheTtl, resolved.cacheTtl), {
      specVersion: previous.specVersion,
      host: previous.host,
    });
  }

  if (!catalog.status || catalog.status < 200 || catalog.status >= 300) {
    return withExpiry(
      {
        ...base,
        status: 'network-error',
        errorMessage: `AI Catalog returned HTTP ${catalog.status ?? 'unknown'}.`,
      },
      cacheTtl,
    );
  }

  const warnings = [
    ...validateContentType(catalog.contentType ?? null, AI_CATALOG_MEDIA_TYPE, 'AI Catalog'),
    ...(catalog.headers ? validateCorsHeaders(catalog.headers, 'AI Catalog') : []),
  ];

  if (catalog.tooLarge) {
    return withExpiry(
      {
        ...base,
        status: 'network-error',
        warnings: [
          ...warnings,
          { code: 'body-size', message: `AI Catalog is larger than ${maxResponseBytes} bytes.` },
        ],
        errorMessage: 'AI Catalog is too large to inspect safely.',
      },
      cacheTtl,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(catalog.text ?? '');
  } catch {
    return withExpiry(
      {
        ...base,
        status: 'invalid-json',
        warnings,
        errorMessage: 'AI Catalog endpoint did not return valid JSON.',
      },
      cacheTtl,
    );
  }

  const parsed = parseAiCatalog(json, target.endpoint, maxCards);
  const catalogWarnings = [...warnings, ...parsed.warnings];
  if (!parsed.ok) {
    return withExpiry(
      {
        ...base,
        status: 'invalid-catalog',
        warnings: catalogWarnings,
        catalogEtag: catalog.etag,
        errorMessage: 'Discovery endpoint did not return an AI Catalog.',
      },
      cacheTtl,
    );
  }

  if (parsed.entries.length === 0) {
    return withExpiry(
      {
        ...base,
        status: 'not-found',
        warnings: catalogWarnings,
        catalogEtag: catalog.etag,
        specVersion: parsed.specVersion,
        host: parsed.host,
        errorMessage: 'The AI Catalog does not list any artifacts.',
      },
      cacheTtl,
    );
  }

  const resolved = await resolveEntries(parsed.entries, false, previous, options, timeoutMs, maxResponseBytes, maxCards);
  return finishScan(
    base,
    catalogWarnings,
    resolved.entries,
    catalog.etag,
    preferTtl(cacheTtl, resolved.cacheTtl),
    { specVersion: parsed.specVersion, host: parsed.host },
  );
}

async function resolveEntries(
  entries: CatalogEntry[],
  catalogNotModified: boolean,
  previous: ScanResult | undefined,
  options: ScannerOptions,
  timeoutMs: number,
  maxResponseBytes: number,
  maxCards: number,
): Promise<{ entries: CatalogEntry[]; cacheTtl?: number }> {
  const uniqueUrls = new Map<string, Promise<FetchedCard>>();
  let cacheTtl: number | undefined;
  let fetchedCards = 0;

  const resolved = await Promise.all(
    entries.map(async (entry, index) => {
      if (entry.type !== SERVER_CARD_MEDIA_TYPE) return withoutInlineData(entry);

      if (entry.inline) {
        if (catalogNotModified) {
          const prior = previous?.entries[index];
          if (prior?.inline && prior.type === SERVER_CARD_MEDIA_TYPE) return withoutInlineData(prior);
        }
        const parsed = parseServerCard(entry.inlineData);
        return withoutInlineData({
          ...entry,
          serverCard: parsed.card,
          warnings: [...entry.warnings, ...parsed.warnings],
        });
      }

      if (!entry.sourceUrl) return withoutInlineData(entry);

      if (fetchedCards >= maxCards) {
        return withoutInlineData({
          ...entry,
          warnings: [
            ...entry.warnings,
            {
              code: 'catalog',
              message: `Only the first ${maxCards} MCP Server Cards were fetched.`,
            },
          ],
        });
      }

      fetchedCards += 1;
      const sourceUrl = entry.sourceUrl;
      const existing = uniqueUrls.get(sourceUrl);
      const fetchCard =
        existing ??
        fetchServerCard(sourceUrl, previous, options, timeoutMs, maxResponseBytes).then((fetched) => {
          uniqueUrls.delete(sourceUrl);
          return fetched;
        });
      if (!existing) uniqueUrls.set(sourceUrl, fetchCard);

      const fetched = await fetchCard;
      cacheTtl = preferTtl(cacheTtl, fetched.cacheTtl);
      if (fetched.reuse) return withoutInlineData(fetched.reuse);
      return withoutInlineData({
        ...entry,
        ...fetched.patch,
        warnings: [...entry.warnings, ...(fetched.patch?.warnings ?? [])],
      });
    }),
  );

  return { entries: resolved, cacheTtl };
}

function withoutInlineData(entry: CatalogEntry): CatalogEntry {
  const { inlineData: _inlineData, ...stored } = entry;
  return stored;
}

async function fetchServerCard(
  sourceUrl: string,
  previous: ScanResult | undefined,
  options: ScannerOptions,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<FetchedCard> {
  const prior = previous?.entries.find(
    (entry) => entry.sourceUrl === sourceUrl && entry.etag && entry.serverCard && entry.type === SERVER_CARD_MEDIA_TYPE,
  );
  const fetched = await fetchDocument(sourceUrl, SERVER_CARD_MEDIA_TYPE, prior?.etag, {
    ...options,
    timeoutMs,
    maxResponseBytes,
  });
  const cacheTtl = fetched.headers ? parseCacheMaxAgeMs(fetched.headers.get('cache-control')) : undefined;
  const patch: Partial<CatalogEntry> = {
    httpStatus: fetched.status,
    contentType: fetched.contentType,
    etag: fetched.etag ?? prior?.etag,
    warnings: [],
  };

  if (fetched.timedOut) {
    return { cacheTtl, patch: failedPatch(patch, TIMEOUT_MESSAGE) };
  }

  if (fetched.errorMessage) {
    return { cacheTtl, patch: failedPatch(patch, fetched.errorMessage) };
  }

  if (fetched.notModified && prior) {
    return { cacheTtl, reuse: { ...prior, httpStatus: fetched.status, etag: patch.etag } };
  }

  if (!fetched.status || fetched.status < 200 || fetched.status >= 300) {
    return { cacheTtl, patch: failedPatch(patch, `Server Card returned HTTP ${fetched.status ?? 'unknown'}.`) };
  }

  const warnings = [
    ...validateContentType(fetched.contentType ?? null, SERVER_CARD_MEDIA_TYPE, 'Server Card'),
    ...(fetched.headers ? validateCorsHeaders(fetched.headers, 'Server Card') : []),
  ];

  if (fetched.tooLarge) {
    const message = `Server Card is larger than ${maxResponseBytes} bytes.`;
    return { cacheTtl, patch: { ...patch, errorMessage: message, warnings: [...warnings, { code: 'body-size', message }] } };
  }

  let json: unknown;
  try {
    json = JSON.parse(fetched.text ?? '');
  } catch {
    const message = 'Server Card endpoint did not return valid JSON.';
    return { cacheTtl, patch: { ...patch, errorMessage: message, warnings: [...warnings, { code: 'schema', message }] } };
  }

  const parsed = parseServerCard(json);
  return {
    cacheTtl,
    patch: { ...patch, serverCard: parsed.card, warnings: [...warnings, ...parsed.warnings] },
  };
}

function failedPatch(patch: Partial<CatalogEntry>, message: string): Partial<CatalogEntry> {
  return {
    ...patch,
    errorMessage: message,
    warnings: [{ code: 'entry', message }],
  };
}

interface FetchedCard {
  cacheTtl?: number;
  patch?: Partial<CatalogEntry>;
  reuse?: CatalogEntry;
}

function finishScan(
  base: ScanResult,
  warnings: ScanWarning[],
  entries: CatalogEntry[],
  catalogEtag: string | undefined,
  cacheTtl: number | undefined,
  meta: { specVersion?: string; host?: ScanResult['host'] },
): ScanResult {
  const warningCount = warnings.length + entries.reduce((count, entry) => count + entry.warnings.length, 0);
  const transportFailure = entries.some((entry) => isTransportFailure(entry));
  const status: ScanStatus = warningCount > 0 ? 'found-with-warnings' : 'found';
  let ttl = cacheTtl;
  if (transportFailure) ttl = Math.min(ttl ?? DEFAULT_FAILURE_TTL_MS, DEFAULT_FAILURE_TTL_MS);

  return withExpiry(
    {
      ...base,
      status,
      warnings,
      entries,
      catalogEtag,
      specVersion: meta.specVersion,
      host: meta.host,
    },
    ttl,
  );
}

function preferTtl(current: number | undefined, next: number | undefined): number | undefined {
  if (next === undefined) return current;
  if (current === undefined) return next;
  return Math.min(current, next);
}

function isTransportFailure(entry: CatalogEntry): boolean {
  if (entry.type !== SERVER_CARD_MEDIA_TYPE || entry.inline || entry.serverCard) return false;
  return entry.httpStatus === undefined || entry.httpStatus >= 500 || entry.errorMessage === TIMEOUT_MESSAGE;
}

function createBaseResult(target: ScanTarget, fetchedAt: number, catalog?: FetchedDocument): ScanResult {
  return {
    status: 'network-error',
    pageUrl: target.pageUrl,
    pageOrigin: target.pageOrigin,
    origin: target.origin,
    endpoint: target.endpoint,
    fetchedAt,
    httpStatus: catalog?.status,
    contentType: catalog?.contentType,
    entries: [],
    warnings: [],
  };
}

async function fetchDocument(
  url: string,
  mediaType: string,
  etag: string | undefined,
  options: ScannerOptions & { timeoutMs: number; maxResponseBytes: number },
): Promise<FetchedDocument> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  try {
    const headers = new Headers({
      Accept: `${mediaType}, application/json;q=0.1`,
    });
    if (etag) headers.set('If-None-Match', etag);

    const response = await fetcher(url, {
      method: 'GET',
      headers,
      credentials: 'omit',
      signal: controller.signal,
    });

    const document: FetchedDocument = {
      status: response.status,
      headers: response.headers,
      contentType: response.headers.get('content-type'),
      etag: response.headers.get('etag') ?? undefined,
      notModified: response.status === 304,
    };

    if (document.notModified) return document;

    const body = await readResponseText(response, options.maxResponseBytes);
    return { ...document, text: body.text, tooLarge: body.tooLarge };
  } catch (error) {
    if (timedOut) return { timedOut: true };
    return { errorMessage: error instanceof Error ? error.message : 'Discovery request failed.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateContentType(contentType: string | null, expected: string, resource: string): ScanWarning[] {
  const actual = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (actual === expected) return [];

  return [
    {
      code: 'content-type',
      message: contentType
        ? `${resource} Content-Type should be ${expected}, got ${contentType}.`
        : `${resource} Content-Type header is missing.`,
    },
  ];
}

function validateCorsHeaders(headers: Headers, resource: string): ScanWarning[] {
  const warnings: ScanWarning[] = [];

  if (headers.get('access-control-allow-origin')?.trim() !== '*') {
    warnings.push({
      code: 'cors',
      message: `${resource} should send Access-Control-Allow-Origin: *.`,
    });
  }

  if (!containsHeaderToken(headers.get('access-control-allow-methods'), 'GET')) {
    warnings.push({
      code: 'cors',
      message: `${resource} should include GET in Access-Control-Allow-Methods.`,
    });
  }

  const requiredAllowHeaders: Array<[token: string, label: string]> = [
    ['content-type', 'Content-Type'],
    ['if-none-match', 'If-None-Match'],
  ];
  const missingAllowHeaders = requiredAllowHeaders.filter(
    ([token]) => !containsHeaderToken(headers.get('access-control-allow-headers'), token),
  );
  if (missingAllowHeaders.length > 0) {
    warnings.push({
      code: 'cors',
      message: `${resource} should include ${missingAllowHeaders.map(([, label]) => label).join(' and ')} in Access-Control-Allow-Headers.`,
    });
  }

  if (!containsHeaderToken(headers.get('access-control-expose-headers'), 'etag')) {
    warnings.push({
      code: 'cors',
      message: `${resource} should include ETag in Access-Control-Expose-Headers.`,
    });
  }

  return warnings;
}

async function readResponseText(response: Response, maxBytes: number): Promise<{ text: string; tooLarge: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return { text, tooLarge: new TextEncoder().encode(text).byteLength > maxBytes };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { text: '', tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder().decode(buffer), tooLarge: false };
}

function containsHeaderToken(value: string | null, token: string): boolean {
  if (!value) return false;
  const parts = value.split(',').map((part) => part.trim().toLowerCase());
  return parts.includes('*') || parts.includes(token.toLowerCase());
}
