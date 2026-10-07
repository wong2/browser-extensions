import { expect, test } from 'bun:test';
import { getDefaultTtlMs, isCacheFresh, parseCacheMaxAgeMs, pruneCacheRecords, withExpiry } from '../utils/cache';
import { DEFAULT_FAILURE_TTL_MS, DEFAULT_SUCCESS_TTL_MS, type CachedScanRecord, type ScanResult } from '../utils/types';

const baseResult: ScanResult = {
  status: 'found',
  fetchedAt: 1000,
  entries: [],
  warnings: [],
};

test('parses Cache-Control max-age directives', () => {
  expect(parseCacheMaxAgeMs('public, max-age=3600')).toBe(3600_000);
  expect(parseCacheMaxAgeMs('no-store, max-age=3600')).toBe(0);
  expect(parseCacheMaxAgeMs('private, no-cache, max-age=3600')).toBe(0);
  expect(parseCacheMaxAgeMs('no-cache')).toBe(0);
  expect(parseCacheMaxAgeMs(null)).toBeUndefined();
});

test('uses success and failure default TTLs', () => {
  expect(getDefaultTtlMs({ status: 'found' })).toBe(DEFAULT_SUCCESS_TTL_MS);
  expect(getDefaultTtlMs({ status: 'found-with-warnings' })).toBe(DEFAULT_SUCCESS_TTL_MS);
  expect(getDefaultTtlMs({ status: 'not-found' })).toBe(DEFAULT_FAILURE_TTL_MS);
  expect(getDefaultTtlMs({ status: 'timeout' })).toBe(DEFAULT_FAILURE_TTL_MS);
});

test('marks cache records fresh only before expiry', () => {
  const record: CachedScanRecord = {
    result: withExpiry(baseResult, 1000),
  };

  expect(isCacheFresh(record, 1500)).toBe(true);
  expect(isCacheFresh(record, 2000)).toBe(false);
  expect(isCacheFresh(undefined, 1500)).toBe(false);
});

test('prunes expired records and caps cache size by newest fetch time', () => {
  const records: Record<string, CachedScanRecord> = {
    expired: { result: { ...withExpiry(baseResult, 1000), origin: 'expired' } },
    newest: { result: { ...withExpiry({ ...baseResult, fetchedAt: 3000 }, 5000), origin: 'newest' } },
    older: { result: { ...withExpiry({ ...baseResult, fetchedAt: 2000 }, 5000), origin: 'older' } },
  };

  expect(pruneCacheRecords(records, 2500, 1)).toEqual({
    newest: records.newest,
  });
});
