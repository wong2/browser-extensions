export const WEBMCP_MESSAGE = {
  scanPage: 'webmcp-radar:scan-page',
  contentSignal: 'webmcp-radar:content-signal',
  getActiveTab: 'webmcp-radar:get-active-tab',
  stateChanged: 'webmcp-radar:state-changed',
  deleteHistoryEntry: 'webmcp-radar:delete-history-entry',
  clearHistory: 'webmcp-radar:clear-history',
} as const;

export type WebMcpStatus = 'supported' | 'unsupported' | 'blocked' | 'restricted';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolInfo {
  /** Stable enough for a single snapshot and unique for duplicate cross-frame tools. */
  key: string;
  index: number;
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JsonValue;
  annotations?: ToolAnnotations;
  origin: string;
}

interface PageScanBase {
  pageUrl: string;
  pageOrigin: string;
  scannedAt: number;
  fromOrigins: string[];
  fallbackUsed: boolean;
  tools: ToolInfo[];
}

export interface SupportedPageScan extends PageScanBase {
  status: 'supported';
}

export interface UnsupportedPageScan extends PageScanBase {
  status: 'unsupported';
  reason: 'api-unavailable';
}

export interface BlockedPageScan extends PageScanBase {
  status: 'blocked';
  reason: 'permissions-policy' | 'origin-isolation';
  errorName: 'NotAllowedError' | 'SecurityError';
  message?: string;
}

export interface RestrictedPageScan extends PageScanBase {
  status: 'restricted';
  reason:
    | 'document-inactive'
    | 'restricted-url'
    | 'content-unavailable'
    | 'tab-unavailable'
    | 'scan-failed'
    | 'invalid-response'
    | 'stale-document';
  errorName?: string;
  message?: string;
}

export type PageScanResult =
  | SupportedPageScan
  | UnsupportedPageScan
  | BlockedPageScan
  | RestrictedPageScan;

export type TabScanState = PageScanResult & {
  tabId: number;
};

export interface ScanPageMessage {
  type: typeof WEBMCP_MESSAGE.scanPage;
  requestId: string;
  fromOrigins: string[];
}

export interface ScanPageResponse {
  requestId: string;
  result: PageScanResult;
}

export interface ContentSignalMessage {
  type: typeof WEBMCP_MESSAGE.contentSignal;
  reason: 'ready' | 'toolchange';
  pageUrl: string;
}

export interface GetActiveTabMessage {
  type: typeof WEBMCP_MESSAGE.getActiveTab;
}

export interface StateChangedMessage {
  type: typeof WEBMCP_MESSAGE.stateChanged;
  state: TabScanState;
}

export type GetActiveTabResponse =
  | { ok: true; state: TabScanState }
  | { ok: false; error: 'no-active-tab'; message: string };

export interface DeleteHistoryEntryMessage {
  type: typeof WEBMCP_MESSAGE.deleteHistoryEntry;
  url: string;
}

export interface ClearHistoryMessage {
  type: typeof WEBMCP_MESSAGE.clearHistory;
}

export type HistoryMutationResponse =
  | { ok: true }
  | { ok: false; message: string };

const INPUT_SCHEMA_MAX_DEPTH = 64;

const RESTRICTED_REASONS = new Set<RestrictedPageScan['reason']>([
  'document-inactive',
  'restricted-url',
  'content-unavailable',
  'tab-unavailable',
  'scan-failed',
  'invalid-response',
  'stale-document',
]);

export function isScanPageMessage(value: unknown): value is ScanPageMessage {
  if (!isRecord(value)) return false;
  return value.type === WEBMCP_MESSAGE.scanPage
    && typeof value.requestId === 'string'
    && Array.isArray(value.fromOrigins)
    && value.fromOrigins.every((origin) => typeof origin === 'string');
}

export function isContentSignalMessage(value: unknown): value is ContentSignalMessage {
  if (!isRecord(value)) return false;
  return value.type === WEBMCP_MESSAGE.contentSignal
    && (value.reason === 'ready' || value.reason === 'toolchange')
    && typeof value.pageUrl === 'string';
}

export function isGetActiveTabMessage(value: unknown): value is GetActiveTabMessage {
  return isRecord(value) && value.type === WEBMCP_MESSAGE.getActiveTab;
}

export function isDeleteHistoryEntryMessage(
  value: unknown,
): value is DeleteHistoryEntryMessage {
  return isRecord(value)
    && value.type === WEBMCP_MESSAGE.deleteHistoryEntry
    && typeof value.url === 'string';
}

export function isClearHistoryMessage(value: unknown): value is ClearHistoryMessage {
  return isRecord(value) && value.type === WEBMCP_MESSAGE.clearHistory;
}

export function isStateChangedMessage(value: unknown): value is StateChangedMessage {
  return isRecord(value)
    && value.type === WEBMCP_MESSAGE.stateChanged
    && isTabScanState(value.state);
}

export function isScanPageResponse(
  value: unknown,
  requestId: string,
): value is ScanPageResponse {
  return isRecord(value)
    && value.requestId === requestId
    && isPageScanResult(value.result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTabScanState(value: unknown): value is TabScanState {
  return isRecord(value)
    && Number.isSafeInteger(value.tabId)
    && (value.tabId as number) >= 0
    && isPageScanResult(value);
}

function isPageScanResult(value: unknown): value is PageScanResult {
  if (!isRecord(value)) return false;

  if (
    typeof value.pageUrl !== 'string'
    || typeof value.pageOrigin !== 'string'
    || !isFiniteTimestamp(value.scannedAt)
    || !isStringArray(value.fromOrigins)
    || typeof value.fallbackUsed !== 'boolean'
    || !Array.isArray(value.tools)
    || !value.tools.every(isToolInfo)
  ) {
    return false;
  }

  switch (value.status) {
    case 'supported':
      return true;
    case 'unsupported':
      return value.reason === 'api-unavailable';
    case 'blocked':
      return isBlockedReasonAndError(value.reason, value.errorName)
        && isOptionalString(value.message);
    case 'restricted':
      return typeof value.reason === 'string'
        && RESTRICTED_REASONS.has(value.reason as RestrictedPageScan['reason'])
        && isOptionalString(value.errorName)
        && isOptionalString(value.message);
    default:
      return false;
  }
}

function isToolInfo(value: unknown): value is ToolInfo {
  if (!isRecord(value)) return false;

  return typeof value.key === 'string'
    && Number.isSafeInteger(value.index)
    && (value.index as number) >= 0
    && typeof value.name === 'string'
    && isOptionalString(value.title)
    && isOptionalString(value.description)
    && (value.inputSchema === undefined || isJsonValue(value.inputSchema))
    && (value.annotations === undefined || isToolAnnotations(value.annotations))
    && typeof value.origin === 'string';
}

function isToolAnnotations(value: unknown): value is ToolAnnotations {
  return isRecord(value)
    && !Array.isArray(value)
    && isOptionalBoolean(value.readOnlyHint)
    && isOptionalBoolean(value.untrustedContentHint);
}

function isJsonValue(
  value: unknown,
  depth = 0,
  activeObjects = new WeakSet<object>(),
): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth >= INPUT_SCHEMA_MAX_DEPTH) return false;
  if (activeObjects.has(value)) return false;

  activeObjects.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
        if (!isJsonValue(value[index], depth + 1, activeObjects)) return false;
      }
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every((item) => (
      isJsonValue(item, depth + 1, activeObjects)
    ));
  } catch {
    return false;
  } finally {
    activeObjects.delete(value);
  }
}

function isBlockedReasonAndError(reason: unknown, errorName: unknown): boolean {
  return (reason === 'permissions-policy' && errorName === 'NotAllowedError')
    || (reason === 'origin-isolation' && errorName === 'SecurityError');
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}
