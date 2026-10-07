import {
  DEFAULT_FAILURE_TTL_MS,
  DEFAULT_SUCCESS_TTL_MS,
  type CachedScanRecord,
  type ScanResult,
} from './types';

const CACHE_KEY = 'aiCatalogCache';
const MAX_CACHE_RECORDS = 100;
const TRANSIENT_STATUSES = new Set<ScanResult['status']>(['network-error', 'timeout']);

export function parseCacheMaxAgeMs(cacheControl: string | null): number | undefined {
  if (!cacheControl) return undefined;

  if (/(?:^|,)\s*(?:no-store|no-cache)\s*(?:,|$)/i.test(cacheControl)) {
    return 0;
  }

  const match = /(?:^|,)\s*max-age\s*=\s*(\d+)\s*(?:,|$)/i.exec(cacheControl);
  const secondsText = match?.[1];
  if (!secondsText) return undefined;

  const seconds = Number.parseInt(secondsText, 10);
  if (!Number.isFinite(seconds)) return undefined;

  return seconds * 1000;
}

export function getDefaultTtlMs(result: Pick<ScanResult, 'status'>): number {
  return result.status === 'found' || result.status === 'found-with-warnings'
    ? DEFAULT_SUCCESS_TTL_MS
    : DEFAULT_FAILURE_TTL_MS;
}

export function withExpiry(result: ScanResult, ttlMs = getDefaultTtlMs(result)): ScanResult {
  return {
    ...result,
    cacheTtlMs: ttlMs,
    expiresAt: result.fetchedAt + ttlMs,
  };
}

export function isCacheFresh(record: CachedScanRecord | undefined, now = Date.now()): record is CachedScanRecord {
  return isResultFresh(record?.result, now);
}

export function isResultFresh(result: ScanResult | undefined, now = Date.now()): result is ScanResult {
  return Boolean(result?.expiresAt && result.expiresAt > now);
}

export function pruneCacheRecords(
  records: Record<string, CachedScanRecord>,
  now = Date.now(),
  maxRecords = MAX_CACHE_RECORDS,
): Record<string, CachedScanRecord> {
  const freshEntries = Object.entries(records)
    .filter(([, record]) => isCacheFresh(record, now))
    .sort(([, left], [, right]) => right.result.fetchedAt - left.result.fetchedAt)
    .slice(0, maxRecords);

  return Object.fromEntries(freshEntries);
}

export async function readStoredScan(origin: string): Promise<ScanResult | undefined> {
  const records = await readCache();
  return records[origin]?.result;
}

export async function writeCachedScan(result: ScanResult): Promise<void> {
  if (!result.origin) return;
  if (!isCacheableResult(result)) return;

  const now = Date.now();
  const records = pruneCacheRecords(await readCache(), now, MAX_CACHE_RECORDS - 1);
  const { fromCache: _fromCache, ...stored } = result;
  records[result.origin] = { result: stored };
  await browser.storage.local.set({ [CACHE_KEY]: pruneCacheRecords(records, now) });
}

async function readCache(): Promise<Record<string, CachedScanRecord>> {
  const data = await browser.storage.local.get(CACHE_KEY);
  const value = data[CACHE_KEY];
  return isRecord(value) ? (value as Record<string, CachedScanRecord>) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCacheableResult(result: ScanResult): boolean {
  if (TRANSIENT_STATUSES.has(result.status)) return false;
  if (result.cacheTtlMs !== undefined && result.cacheTtlMs <= 0) return false;
  if (result.expiresAt !== undefined && result.expiresAt <= Date.now()) return false;
  return true;
}
