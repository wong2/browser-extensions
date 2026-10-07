export const AI_CATALOG_PATH = '/.well-known/ai-catalog.json';
export const AI_CATALOG_MEDIA_TYPE = 'application/ai-catalog+json';
export const SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json';
export const SERVER_CARD_SCHEMA_URL =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
export const DEFAULT_SUCCESS_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_FAILURE_TTL_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 3000;
export const MAX_RESPONSE_BYTES = 256 * 1024;
export const MAX_CATALOG_ENTRIES = 50;
export const MAX_SERVER_CARDS = 20;

export type ScanStatus =
  | 'found'
  | 'found-with-warnings'
  | 'not-found'
  | 'invalid-json'
  | 'invalid-catalog'
  | 'network-error'
  | 'timeout'
  | 'unsupported';

export type WarningCode =
  | 'content-type'
  | 'cors'
  | 'required-field'
  | 'remote'
  | 'schema'
  | 'body-size'
  | 'catalog'
  | 'entry';

export interface ScanWarning {
  code: WarningCode;
  message: string;
}

export interface HeaderRequirement {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

export interface RemoteVariable {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
}

export interface RemoteEndpoint {
  type: string;
  url: string;
  supportedProtocolVersions?: string[];
  headers?: HeaderRequirement[];
  variables?: RemoteVariable[];
}

export interface ServerCardIcon {
  src: string;
  sizes?: string[];
  mimeType?: string;
  theme?: 'light' | 'dark';
}

export interface ServerCardRepository {
  url?: string;
  source?: string;
  subfolder?: string;
  id?: string;
}

export interface ServerCard {
  $schema?: string;
  name?: string;
  version?: string;
  description?: string;
  title?: string;
  websiteUrl?: string;
  repository?: ServerCardRepository;
  icons?: ServerCardIcon[];
  remotes?: RemoteEndpoint[];
}

export interface CatalogHost {
  displayName?: string;
  documentationUrl?: string;
}

export interface CatalogEntry {
  identifier?: string;
  type: string;
  displayName?: string;
  description?: string;
  version?: string;
  tags?: string[];
  sourceUrl?: string;
  inline: boolean;
  warnings: ScanWarning[];
  errorMessage?: string;
  serverCard?: ServerCard;
  httpStatus?: number;
  contentType?: string | null;
  etag?: string;
  inlineData?: unknown;
}

export interface ScanTarget {
  pageUrl: string;
  pageOrigin: string;
  origin: string;
  endpoint: string;
}

export interface ScanResult {
  status: ScanStatus;
  pageUrl?: string;
  pageOrigin?: string;
  origin?: string;
  endpoint?: string;
  fetchedAt: number;
  expiresAt?: number;
  httpStatus?: number;
  contentType?: string | null;
  catalogEtag?: string;
  specVersion?: string;
  host?: CatalogHost;
  entries: CatalogEntry[];
  warnings: ScanWarning[];
  errorMessage?: string;
  fromCache?: boolean;
  cacheTtlMs?: number;
}

export interface CachedScanRecord {
  result: ScanResult;
}

export interface ScannerOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxCards?: number;
  previous?: ScanResult;
}

export type RuntimeMessage = { type: 'catalog:get-current-scan' } | { type: 'catalog:refresh-current-scan' };
