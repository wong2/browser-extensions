import {
  MAX_CATALOG_ENTRIES,
  SERVER_CARD_MEDIA_TYPE,
  type CatalogEntry,
  type RemoteEndpoint,
  type CatalogHost,
  type ScanWarning,
} from './types';

const ARTIFACT_LABELS: Record<string, string> = {
  [SERVER_CARD_MEDIA_TYPE]: 'MCP Server',
  'application/a2a-agent-card+json': 'A2A Agent',
  'application/agent-card+json': 'Agent Card',
  'application/agent-skills+json': 'Agent Skill',
  'application/agent-skills+md': 'Agent Skill',
  'application/agent-skills+zip': 'Agent Skill',
  'application/agent-skills+gzip': 'Agent Skill',
  'application/agent-plugins+zip': 'Agent Plugin',
  'application/agent-plugins+gzip': 'Agent Plugin',
  'application/ai-catalog+json': 'Nested Catalog',
};

export interface CatalogParse {
  ok: boolean;
  specVersion?: string;
  host?: CatalogHost;
  entries: CatalogEntry[];
  warnings: ScanWarning[];
}

export function artifactLabel(type: string): string {
  return ARTIFACT_LABELS[type] ?? type;
}

export function identifierLabel(identifier: string | undefined): string | undefined {
  if (!identifier) return undefined;
  const tail = identifier.split(/[:/]/).filter(Boolean).pop();
  return tail || identifier;
}

export function parseAiCatalog(value: unknown, catalogUrl: string, maxEntries = MAX_CATALOG_ENTRIES): CatalogParse {
  const warnings: ScanWarning[] = [];

  if (!isPlainObject(value) || !Array.isArray(value.entries)) {
    return {
      ok: false,
      entries: [],
      warnings: [
        {
          code: 'catalog',
          message: 'AI Catalog must be a JSON object with an entries array.',
        },
      ],
    };
  }

  const specVersion = typeof value.specVersion === 'string' ? value.specVersion : undefined;
  if (!specVersion) {
    warnings.push({ code: 'catalog', message: 'AI Catalog is missing specVersion.' });
  } else if (specVersion !== '1.0') {
    warnings.push({ code: 'catalog', message: 'AI Catalog specVersion should be 1.0.' });
  }

  const host = readHost(value.host, warnings);
  const entries: CatalogEntry[] = [];

  for (const entry of value.entries) {
    if (entries.length >= maxEntries) {
      warnings.push({
        code: 'catalog',
        message: `Only the first ${maxEntries} catalog entries were inspected.`,
      });
      break;
    }

    if (!isPlainObject(entry)) {
      warnings.push({ code: 'entry', message: 'Catalog entry must be an object.' });
      continue;
    }

    const parsed = readEntry(entry, catalogUrl, warnings);
    if (parsed) entries.push(parsed);
  }

  return { ok: true, specVersion, host, entries, warnings };
}

function readHost(value: unknown, warnings: ScanWarning[]): CatalogHost | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    warnings.push({ code: 'catalog', message: 'AI Catalog host must be an object.' });
    return undefined;
  }

  const host: CatalogHost = {};
  const displayName = readString(value.displayName);
  if (!displayName) {
    warnings.push({ code: 'catalog', message: 'AI Catalog host is missing displayName.' });
  } else {
    host.displayName = displayName;
  }

  if (value.documentationUrl !== undefined) {
    if (typeof value.documentationUrl !== 'string' || !isHttpUrl(value.documentationUrl)) {
      warnings.push({ code: 'catalog', message: 'AI Catalog host documentationUrl must be an HTTP(S) URL.' });
    } else {
      host.documentationUrl = value.documentationUrl;
    }
  }

  return host.displayName || host.documentationUrl ? host : undefined;
}

function readEntry(
  entry: Record<string, unknown>,
  catalogUrl: string,
  warnings: ScanWarning[],
): CatalogEntry | undefined {
  const type = readString(entry.type);
  if (!type) {
    warnings.push({ code: 'entry', message: 'Catalog entry is missing type.' });
    return undefined;
  }

  const identifier = readString(entry.identifier);
  const entryWarnings: ScanWarning[] = [];
  if (!identifier) {
    entryWarnings.push({ code: 'entry', message: `${artifactLabel(type)} entry is missing identifier.` });
  }

  const parsed: CatalogEntry = {
    identifier,
    type,
    inline: false,
    warnings: entryWarnings,
  };

  const displayName = readString(entry.displayName);
  if (displayName) parsed.displayName = displayName;
  const description = readString(entry.description);
  if (description) parsed.description = description;
  const version = readString(entry.version);
  if (version) parsed.version = version;
  if (Array.isArray(entry.tags)) {
    const tags = entry.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    if (tags.length > 0) parsed.tags = tags.slice(0, 12);
  }

  const hasUrl = entry.url !== undefined;
  const hasData = entry.data !== undefined;
  if (hasUrl === hasData) {
    parsed.warnings.push({
      code: 'entry',
      message: `${entryLabel(identifier, type)} must include exactly one of url or data.`,
    });
    return parsed;
  }

  if (hasData) {
    parsed.inline = true;
    if (type === SERVER_CARD_MEDIA_TYPE) parsed.inlineData = entry.data;
    return parsed;
  }

  if (typeof entry.url !== 'string') {
    parsed.warnings.push({
      code: 'entry',
      message: `${entryLabel(identifier, type)} url must be a string.`,
    });
    return parsed;
  }

  const sourceUrl = resolveHttpUrl(entry.url, catalogUrl);
  if (!sourceUrl) {
    parsed.warnings.push({
      code: 'entry',
      message: `${entryLabel(identifier, type)} url must be an HTTP(S) URL without credentials.`,
    });
    return parsed;
  }

  parsed.sourceUrl = sourceUrl;
  return parsed;
}

function resolveHttpUrl(value: string, base: string): string | undefined {
  try {
    const url = new URL(value, base);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function entryLabel(identifier: string | undefined, type: string): string {
  return identifier ? `Entry ${identifier}` : `${artifactLabel(type)} entry`;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function transportLabel(type: string | undefined): string {
  if (type === 'streamable-http' || type === 'http') return 'HTTP';
  if (type === 'sse') return 'SSE';
  return type || 'Unknown transport';
}

export function requiresAuth(remote: RemoteEndpoint): boolean {
  return Boolean(remote.headers?.some((header) => header.isRequired || header.isSecret));
}
