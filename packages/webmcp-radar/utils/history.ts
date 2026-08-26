export const HISTORY_STORAGE_KEY = 'webmcp-radar:history';
const LEGACY_HISTORY_STORAGE_KEY = 'webmcp-inspector:history';
export const HISTORY_LIMIT = 200;
export const HISTORY_WRITE_THROTTLE_MS = 60_000;
export const HISTORY_URL_MAX_LENGTH = 8_192;
export const HISTORY_TITLE_MAX_LENGTH = 512;
/** Allows minor wall-clock corrections without letting corrupt future records pin the list. */
export const HISTORY_FUTURE_TOLERANCE_MS = 5 * 60_000;
/** Defensive ceiling far above a plausible page inventory, while keeping corrupt values harmless. */
export const HISTORY_MAX_TOOL_COUNT = 100_000;

export interface HistoryEntry {
  title: string;
  url: string;
  origin: string;
  hostname: string;
  firstDetectedAt: number;
  lastDetectedAt: number;
  toolCount: number;
}

export interface RecordSupportedPageInput {
  pageTitle: string;
  pageUrl: string;
  toolCount: number;
  detectedAt: number;
}

export interface HistoryUpdate {
  entries: HistoryEntry[];
  changed: boolean;
  entry: HistoryEntry | null;
}

interface SanitizedHistory {
  entries: HistoryEntry[];
  changed: boolean;
}

let historyOperationQueue: Promise<void> = Promise.resolve();

/**
 * Returns one stable URL identity for a history entry.
 * Query parameters remain significant; credentials and fragments never enter storage.
 */
export function canonicalizeHistoryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    url.username = '';
    url.password = '';
    url.hash = '';
    return url.href.length <= HISTORY_URL_MAX_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

/** Converts untrusted storage data into the sole shape allowed back into local storage. */
export function sanitizeHistory(value: unknown): SanitizedHistory {
  return sanitizeHistoryAt(value, Date.now());
}

function sanitizeHistoryAt(value: unknown, now: number): SanitizedHistory {
  if (!Array.isArray(value)) {
    return { entries: [], changed: value !== undefined };
  }

  const byUrl = new Map<string, HistoryEntry>();
  for (const candidate of value) {
    const entry = sanitizeEntry(candidate, now);
    if (!entry) continue;

    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, entry);
      continue;
    }

    const latest = entry.lastDetectedAt >= existing.lastDetectedAt ? entry : existing;
    const earlier = latest === entry ? existing : entry;
    byUrl.set(entry.url, {
      ...latest,
      title: latest.title || earlier.title,
      firstDetectedAt: Math.min(existing.firstDetectedAt, entry.firstDetectedAt),
      lastDetectedAt: Math.max(existing.lastDetectedAt, entry.lastDetectedAt),
    });
  }

  const entries = sortAndCap([...byUrl.values()]);
  return {
    entries,
    changed: !isExactStoredHistory(value, entries),
  };
}

/** Pure update used by storage code and tests. */
export function upsertHistory(
  value: unknown,
  input: RecordSupportedPageInput,
): HistoryUpdate {
  const now = Date.now();
  const sanitized = sanitizeHistoryAt(value, now);
  const canonicalUrl = canonicalizeHistoryUrl(input.pageUrl);
  const title = normalizeHistoryTitle(input.pageTitle);
  const detectedAt = normalizeTimestamp(input.detectedAt, now);
  const toolCount = normalizeToolCount(input.toolCount);
  if (!canonicalUrl || detectedAt === null || toolCount === null) {
    return { ...sanitized, entry: null };
  }

  const metadata = metadataFromCanonicalUrl(canonicalUrl);
  if (!metadata) return { ...sanitized, entry: null };

  const existingIndex = sanitized.entries.findIndex((entry) => entry.url === canonicalUrl);
  const existing = sanitized.entries[existingIndex];
  if (existing) {
    const effectiveTitle = title || existing.title;
    const duplicateWithinThrottle = existing.toolCount === toolCount
      && existing.title === effectiveTitle
      && detectedAt < existing.lastDetectedAt + HISTORY_WRITE_THROTTLE_MS;
    const staleObservation = detectedAt < existing.lastDetectedAt;
    if (duplicateWithinThrottle || staleObservation) {
      return { ...sanitized, entry: existing };
    }

    const updated: HistoryEntry = {
      ...metadata,
      title: effectiveTitle,
      firstDetectedAt: Math.min(existing.firstDetectedAt, detectedAt),
      lastDetectedAt: Math.max(existing.lastDetectedAt, detectedAt),
      toolCount,
    };
    const entries = [...sanitized.entries];
    entries[existingIndex] = updated;
    return { entries: sortAndCap(entries), changed: true, entry: updated };
  }

  const entry: HistoryEntry = {
    ...metadata,
    title,
    firstDetectedAt: detectedAt,
    lastDetectedAt: detectedAt,
    toolCount,
  };
  return {
    entries: sortAndCap([...sanitized.entries, entry]),
    changed: true,
    entry,
  };
}

/** Pure delete used by storage code and tests. */
export function removeHistoryEntry(value: unknown, pageUrl: string): HistoryUpdate {
  const sanitized = sanitizeHistory(value);
  const canonicalUrl = canonicalizeHistoryUrl(pageUrl);
  if (!canonicalUrl) return { ...sanitized, entry: null };

  const entry = sanitized.entries.find((candidate) => candidate.url === canonicalUrl) ?? null;
  if (!entry) return { ...sanitized, entry: null };
  return {
    entries: sanitized.entries.filter((candidate) => candidate.url !== canonicalUrl),
    changed: true,
    entry,
  };
}

export function readHistory(): Promise<HistoryEntry[]> {
  return enqueueHistoryOperation(async () => {
    const raw = await readRawHistory();
    return sanitizeHistory(raw).entries;
  });
}

/** Repairs persisted data from the background's single mutation context. */
export function repairHistory(): Promise<void> {
  return enqueueHistoryOperation(async () => {
    const raw = await readRawHistory();
    const sanitized = sanitizeHistory(raw);
    if (sanitized.changed && raw !== undefined) await writeHistory(sanitized.entries);
  });
}

export function recordSupportedPage(
  input: RecordSupportedPageInput,
  shouldRecord: () => boolean = () => true,
): Promise<HistoryEntry | null> {
  return enqueueHistoryOperation(async () => {
    if (!shouldRecord()) return null;
    const raw = await readRawHistory();
    if (!shouldRecord()) return null;
    const update = upsertHistory(raw, input);
    if (update.changed && shouldRecord()) await writeHistory(update.entries);
    return update.entry;
  });
}

export function deleteHistoryEntry(pageUrl: string): Promise<boolean> {
  return enqueueHistoryOperation(async () => {
    const raw = await readRawHistory();
    const update = removeHistoryEntry(raw, pageUrl);
    if (update.changed) await writeHistory(update.entries);
    return update.entry !== null;
  });
}

export function clearHistory(): Promise<void> {
  return enqueueHistoryOperation(async () => {
    await browser.storage.local.remove([HISTORY_STORAGE_KEY, LEGACY_HISTORY_STORAGE_KEY]);
  });
}

function enqueueHistoryOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = historyOperationQueue.then(operation, operation);
  historyOperationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readRawHistory(): Promise<unknown> {
  const result = await browser.storage.local.get([
    HISTORY_STORAGE_KEY,
    LEGACY_HISTORY_STORAGE_KEY,
  ]);
  const current = result[HISTORY_STORAGE_KEY];
  if (current !== undefined) return current;

  const legacy = result[LEGACY_HISTORY_STORAGE_KEY];
  if (legacy === undefined) return undefined;

  const migrated = sanitizeHistory(legacy).entries;
  await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: migrated });
  await browser.storage.local.remove(LEGACY_HISTORY_STORAGE_KEY);
  return migrated;
}

async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: entries });
}

function sanitizeEntry(value: unknown, now: number): HistoryEntry | null {
  if (!isRecord(value) || typeof value.url !== 'string') return null;

  const canonicalUrl = canonicalizeHistoryUrl(value.url);
  const firstDetectedAt = normalizeTimestamp(value.firstDetectedAt, now);
  const lastDetectedAt = normalizeTimestamp(value.lastDetectedAt, now);
  const toolCount = normalizeToolCount(value.toolCount);
  if (!canonicalUrl || firstDetectedAt === null || lastDetectedAt === null || toolCount === null) {
    return null;
  }

  const metadata = metadataFromCanonicalUrl(canonicalUrl);
  if (!metadata) return null;

  return {
    ...metadata,
    title: normalizeHistoryTitle(value.title),
    firstDetectedAt: Math.min(firstDetectedAt, lastDetectedAt),
    lastDetectedAt: Math.max(firstDetectedAt, lastDetectedAt),
    toolCount,
  };
}

function metadataFromCanonicalUrl(
  canonicalUrl: string,
): Pick<HistoryEntry, 'url' | 'origin' | 'hostname'> | null {
  try {
    const url = new URL(canonicalUrl);
    return {
      url: canonicalUrl,
      origin: url.origin,
      hostname: url.hostname,
    };
  } catch {
    return null;
  }
}

function sortAndCap(entries: HistoryEntry[]): HistoryEntry[] {
  return entries
    .sort((left, right) => (
      right.lastDetectedAt - left.lastDetectedAt || left.url.localeCompare(right.url)
    ))
    .slice(0, HISTORY_LIMIT);
}

function normalizeTimestamp(value: unknown, now: number): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= now + HISTORY_FUTURE_TOLERANCE_MS
    ? value
    : null;
}

function normalizeToolCount(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    && value <= HISTORY_MAX_TOOL_COUNT
    ? value
    : null;
}

export function normalizeHistoryTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, HISTORY_TITLE_MAX_LENGTH);
}

function isExactStoredHistory(value: unknown[], entries: HistoryEntry[]): boolean {
  if (value.length !== entries.length) return false;
  return value.every((candidate, index) => {
    if (!isRecord(candidate) || Object.keys(candidate).length !== 7) return false;
    const expected = entries[index];
    if (!expected) return false;
    return candidate.title === expected.title
      && candidate.url === expected.url
      && candidate.origin === expected.origin
      && candidate.hostname === expected.hostname
      && candidate.firstDetectedAt === expected.firstDetectedAt
      && candidate.lastDetectedAt === expected.lastDetectedAt
      && candidate.toolCount === expected.toolCount;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
