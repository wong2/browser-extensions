import { describe, expect, test } from 'bun:test';
import {
  HISTORY_FUTURE_TOLERANCE_MS,
  HISTORY_LIMIT,
  HISTORY_MAX_TOOL_COUNT,
  HISTORY_STORAGE_KEY,
  HISTORY_TITLE_MAX_LENGTH,
  HISTORY_URL_MAX_LENGTH,
  HISTORY_WRITE_THROTTLE_MS,
  canonicalizeHistoryUrl,
  normalizeHistoryTitle,
  readHistory,
  removeHistoryEntry,
  sanitizeHistory,
  upsertHistory,
  type HistoryEntry,
} from '@/utils/history';
import {
  WEBMCP_MESSAGE,
  isClearHistoryMessage,
  isDeleteHistoryEntryMessage,
} from '@/utils/protocol';

function entry(
  url: string,
  lastDetectedAt: number,
  toolCount = 1,
  firstDetectedAt = lastDetectedAt,
  title?: string,
): HistoryEntry {
  const parsed = new URL(url);
  return {
    title: title ?? parsed.hostname,
    url: parsed.href,
    origin: parsed.origin,
    hostname: parsed.hostname,
    firstDetectedAt,
    lastDetectedAt,
    toolCount,
  };
}

describe('canonicalizeHistoryUrl', () => {
  test('normalizes HTTP URLs while retaining the query', () => {
    expect(canonicalizeHistoryUrl(
      'HTTPS://user:secret@Example.COM:443/a/../tools?mode=full#schema',
    )).toBe('https://example.com/tools?mode=full');
  });

  test('rejects non-web and malformed URLs', () => {
    expect(canonicalizeHistoryUrl('chrome://extensions')).toBe(null);
    expect(canonicalizeHistoryUrl('javascript:alert(1)')).toBe(null);
    expect(canonicalizeHistoryUrl('not a url')).toBe(null);
  });

  test('rejects an oversized canonical URL before it can consume storage quota', () => {
    const oversized = `https://example.com/?q=${'a'.repeat(HISTORY_URL_MAX_LENGTH)}`;
    expect(canonicalizeHistoryUrl(oversized)).toBe(null);
  });
});

describe('normalizeHistoryTitle', () => {
  test('keeps one compact, bounded line of page title text', () => {
    expect(normalizeHistoryTitle('  WebMCP\n\tDirectory  ')).toBe('WebMCP Directory');
    expect(normalizeHistoryTitle('x'.repeat(HISTORY_TITLE_MAX_LENGTH + 20))).toHaveLength(
      HISTORY_TITLE_MAX_LENGTH,
    );
    expect(normalizeHistoryTitle(null)).toBe('');
  });
});

describe('upsertHistory', () => {
  test('does not record supported pages with zero tools', () => {
    const update = upsertHistory(undefined, {
      pageTitle: 'Zero tools',
      pageUrl: 'https://zero.example/path#ignored',
      toolCount: 0,
      detectedAt: 100,
    });

    expect(update.changed).toBe(false);
    expect(update.entry).toBe(null);
    expect(update.entries).toEqual([]);
  });

  test('keeps an existing positive record when a later zero-tool observation is ignored', () => {
    const existing = [entry('https://existing.example/tools', 200, 3, 100)];
    const update = upsertHistory(existing, {
      pageTitle: 'Existing tools',
      pageUrl: 'https://existing.example/tools',
      toolCount: 0,
      detectedAt: 300,
    });

    expect(update).toEqual({
      entries: existing,
      changed: false,
      entry: null,
    });
  });

  test('deduplicates canonical URLs and updates count and last seen time', () => {
    const existing = [entry('https://example.com/tools?q=1', 100, 2, 50)];
    const update = upsertHistory(existing, {
      pageTitle: 'Example tools',
      pageUrl: 'https://example.com/tools?q=1#latest',
      toolCount: 4,
      detectedAt: 200,
    });

    expect(update.entries).toHaveLength(1);
    expect(update.entry).toMatchObject({
      title: 'Example tools',
      firstDetectedAt: 50,
      lastDetectedAt: 200,
      toolCount: 4,
    });
  });

  test('does not write a duplicate count within the 60 second window', () => {
    const existing = [entry('https://example.com/', 1_000, 2, 500)];
    const throttled = upsertHistory(existing, {
      pageTitle: 'example.com',
      pageUrl: 'https://example.com/#new-fragment',
      toolCount: 2,
      detectedAt: 1_000 + HISTORY_WRITE_THROTTLE_MS - 1,
    });
    const boundary = upsertHistory(existing, {
      pageTitle: 'example.com',
      pageUrl: 'https://example.com/',
      toolCount: 2,
      detectedAt: 1_000 + HISTORY_WRITE_THROTTLE_MS,
    });

    expect(throttled.changed).toBe(false);
    expect(throttled.entries).toEqual(existing);
    expect(boundary.changed).toBe(true);
    expect(boundary.entry?.lastDetectedAt).toBe(61_000);
  });

  test('updates a changed page title even inside the count throttle window', () => {
    const existing = [entry('https://example.com/', 1_000, 2, 500, 'Old title')];
    const update = upsertHistory(existing, {
      pageTitle: '  New\n title ',
      pageUrl: 'https://example.com/',
      toolCount: 2,
      detectedAt: 2_000,
    });

    expect(update.changed).toBe(true);
    expect(update.entry?.title).toBe('New title');
  });

  test('sorts newest first and caps retained history', () => {
    const existing = Array.from({ length: HISTORY_LIMIT }, (_, index) => (
      entry(`https://site-${index}.example/`, index, index + 1)
    ));
    const update = upsertHistory(existing, {
      pageTitle: 'Newest page',
      pageUrl: 'https://newest.example/',
      toolCount: 1,
      detectedAt: 10_000,
    });

    expect(update.entries).toHaveLength(HISTORY_LIMIT);
    expect(update.entries[0]?.url).toBe('https://newest.example/');
    expect(update.entries.at(-1)?.lastDetectedAt).toBe(1);
    expect(update.entries.some((candidate) => candidate.lastDetectedAt === 0)).toBe(false);
  });
});

describe('sanitizeHistory', () => {
  test('repairs metadata, drops malformed/private fields, and merges duplicates', () => {
    const sanitized = sanitizeHistory([
      {
        title: 'Old title',
        url: 'https://user:pass@example.com/tools#old',
        origin: 'https://attacker.example',
        hostname: 'attacker.example',
        firstDetectedAt: 20,
        lastDetectedAt: 10,
        toolCount: 1.9,
        description: 'must not persist',
        inputSchema: { secret: true },
      },
      {
        title: '  Example\n tools  ',
        url: 'https://example.com/tools',
        origin: 'https://example.com',
        hostname: 'example.com',
        firstDetectedAt: 5,
        lastDetectedAt: 30,
        toolCount: 3,
      },
      { url: 'file:///tmp/page', firstDetectedAt: 1, lastDetectedAt: 2, toolCount: 1 },
      null,
    ]);

    expect(sanitized.changed).toBe(true);
    expect(sanitized.entries).toEqual([{
      title: 'Example tools',
      url: 'https://example.com/tools',
      origin: 'https://example.com',
      hostname: 'example.com',
      firstDetectedAt: 5,
      lastDetectedAt: 30,
      toolCount: 3,
    }]);
    expect(JSON.stringify(sanitized.entries)).not.toContain('description');
    expect(JSON.stringify(sanitized.entries)).not.toContain('inputSchema');
  });

  test('turns non-array storage data into an empty history', () => {
    expect(sanitizeHistory({ entries: 'corrupt' })).toEqual({
      entries: [],
      changed: true,
    });
  });

  test('keeps legacy URL records and adds an empty title field for repair', () => {
    const legacy = entry('https://legacy.example/tools', 20, 2);
    const { title: _title, ...withoutTitle } = legacy;

    expect(sanitizeHistory([withoutTitle])).toEqual({
      entries: [{ ...legacy, title: '' }],
      changed: true,
    });
  });

  test('drops legacy records whose latest tool count is zero', () => {
    const positive = entry('https://tools.example/', 20, 2);
    const zero = entry('https://zero.example/', 30, 0);

    expect(sanitizeHistory([zero, positive])).toEqual({
      entries: [positive],
      changed: true,
    });
  });

  test('drops unsafe, far-future, and impossible-count records', () => {
    const now = Date.now();
    const valid = entry('https://valid.example/', now - 1_000, 2);
    const corrupt = [
      entry('https://unsafe-time.example/', Number.MAX_VALUE, 1),
      entry(
        'https://future.example/',
        now + HISTORY_FUTURE_TOLERANCE_MS * 2,
        1,
      ),
      entry('https://huge-count.example/', now, Number.MAX_VALUE),
      entry('https://fractional-count.example/', now, 1.5),
    ];

    expect(sanitizeHistory([valid, ...corrupt]).entries).toEqual([valid]);
  });

  test('accepts the configured tool-count bound and small future clock skew', () => {
    const now = Date.now();
    const bounded = entry(
      'https://bounded.example/',
      now + Math.floor(HISTORY_FUTURE_TOLERANCE_MS / 2),
      HISTORY_MAX_TOOL_COUNT,
    );

    expect(sanitizeHistory([bounded]).entries).toEqual([bounded]);
  });

  test('rejects invalid new observations instead of letting them pin history', () => {
    const existing = [entry('https://existing.example/', Date.now() - 1_000, 1)];

    for (const input of [
      { toolCount: HISTORY_MAX_TOOL_COUNT + 1, detectedAt: Date.now() },
      { toolCount: 1.5, detectedAt: Date.now() },
      { toolCount: 1, detectedAt: Number.MAX_VALUE },
      {
        toolCount: 1,
        detectedAt: Date.now() + HISTORY_FUTURE_TOLERANCE_MS * 2,
      },
    ]) {
      const update = upsertHistory(existing, {
        pageTitle: 'Invalid page',
        pageUrl: 'https://invalid.example/',
        ...input,
      });
      expect(update.entry).toBe(null);
      expect(update.changed).toBe(false);
      expect(update.entries).toEqual(existing);
    }
  });
});

describe('removeHistoryEntry', () => {
  test('deletes by canonical URL without affecting query-distinct entries', () => {
    const withQuery = entry('https://example.com/tools?mode=full', 2);
    const withoutQuery = entry('https://example.com/tools', 1);
    const update = removeHistoryEntry(
      [withQuery, withoutQuery],
      'https://user:pass@example.com/tools?mode=full#details',
    );

    expect(update.changed).toBe(true);
    expect(update.entry?.url).toBe(withQuery.url);
    expect(update.entries).toEqual([withoutQuery]);
  });

  test('reports a no-op when the URL is absent', () => {
    const existing = [entry('https://example.com/', 1)];
    const update = removeHistoryEntry(existing, 'https://other.example/');

    expect(update.changed).toBe(false);
    expect(update.entry).toBe(null);
    expect(update.entries).toEqual(existing);
  });
});

describe('history mutation protocol', () => {
  test('validates deletion messages', () => {
    expect(isDeleteHistoryEntryMessage({
      type: WEBMCP_MESSAGE.deleteHistoryEntry,
      url: 'https://example.com/',
    })).toBe(true);
    expect(isDeleteHistoryEntryMessage({
      type: WEBMCP_MESSAGE.deleteHistoryEntry,
      url: 42,
    })).toBe(false);
  });

  test('validates clear messages', () => {
    expect(isClearHistoryMessage({ type: WEBMCP_MESSAGE.clearHistory })).toBe(true);
    expect(isClearHistoryMessage({ type: WEBMCP_MESSAGE.clearHistory, url: null })).toBe(true);
    expect(isClearHistoryMessage({ type: 'webmcp-radar:unknown' })).toBe(false);
  });
});

describe('history storage rename', () => {
  const legacyStorageKey = 'webmcp-inspector:history';

  test('migrates valid records from the Inspector storage key', async () => {
    const legacyEntry = entry('https://legacy.example/tools', Date.now(), 2);
    const storage = new Map<string, unknown>([[legacyStorageKey, [legacyEntry]]]);
    const removed: Array<string | string[]> = [];

    await withMockStorage(storage, removed, async () => {
      expect(await readHistory()).toEqual([legacyEntry]);
    });

    expect(storage.get(HISTORY_STORAGE_KEY)).toEqual([legacyEntry]);
    expect(storage.has(legacyStorageKey)).toBe(false);
    expect(removed).toEqual([legacyStorageKey]);
  });

  test('prefers Radar history when both storage keys exist', async () => {
    const currentEntry = entry('https://radar.example/tools', Date.now(), 3);
    const legacyEntry = entry('https://legacy.example/tools', Date.now() - 1, 2);
    const storage = new Map<string, unknown>([
      [HISTORY_STORAGE_KEY, [currentEntry]],
      [legacyStorageKey, [legacyEntry]],
    ]);
    const removed: Array<string | string[]> = [];

    await withMockStorage(storage, removed, async () => {
      expect(await readHistory()).toEqual([currentEntry]);
    });

    expect(storage.get(HISTORY_STORAGE_KEY)).toEqual([currentEntry]);
    expect(storage.get(legacyStorageKey)).toEqual([legacyEntry]);
    expect(removed).toEqual([]);
  });
});

async function withMockStorage(
  storage: Map<string, unknown>,
  removed: Array<string | string[]>,
  operation: () => Promise<void>,
): Promise<void> {
  const testGlobal = globalThis as typeof globalThis & { browser?: unknown };
  const previousBrowser = testGlobal.browser;
  Object.defineProperty(testGlobal, 'browser', {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(keys: string | string[]) {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.flatMap((key) => (
              storage.has(key) ? [[key, storage.get(key)]] : []
            )));
          },
          async set(values: Record<string, unknown>) {
            for (const [key, value] of Object.entries(values)) storage.set(key, value);
          },
          async remove(keys: string | string[]) {
            removed.push(keys);
            for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key);
          },
        },
      },
    },
  });

  try {
    await operation();
  } finally {
    Object.defineProperty(testGlobal, 'browser', {
      configurable: true,
      value: previousBrowser,
    });
  }
}
