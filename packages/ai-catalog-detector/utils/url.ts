import { AI_CATALOG_PATH, type ScanResult, type ScanTarget } from './types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

export function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOCAL_HOSTS.has(normalized) || normalized.endsWith('.localhost') || normalized.startsWith('127.');
}

export function getScanTarget(pageUrl: string): ScanTarget | ScanResult {
  const fetchedAt = Date.now();

  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return createUnsupportedResult(pageUrl, 'Current tab URL is not valid.', fetchedAt);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return createUnsupportedResult(pageUrl, `${url.protocol} pages cannot expose web discovery metadata.`, fetchedAt);
  }

  const pageOrigin = url.origin;
  const origin = url.protocol === 'https:' || isLocalDevelopmentHost(url.hostname) ? pageOrigin : `https://${url.host}`;

  return {
    pageUrl,
    pageOrigin,
    origin,
    endpoint: `${origin}${AI_CATALOG_PATH}`,
  };
}

export function isScanTarget(value: ScanTarget | ScanResult): value is ScanTarget {
  return 'endpoint' in value && !('status' in value);
}

export function createUnsupportedResult(
  pageUrl: string | undefined,
  errorMessage: string,
  fetchedAt = Date.now(),
): ScanResult {
  return {
    status: 'unsupported',
    pageUrl,
    fetchedAt,
    entries: [],
    warnings: [],
    errorMessage,
  };
}
