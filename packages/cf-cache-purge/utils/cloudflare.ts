export const TOKEN_STORAGE_KEY = 'cloudflareApiToken';
export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

const tokenPermissions = [
  { key: 'zone', type: 'read' },
  { key: 'cache', type: 'purge' },
];

const tokenUrl = new URL('https://dash.cloudflare.com/profile/api-tokens');
tokenUrl.searchParams.set('permissionGroupKeys', JSON.stringify(tokenPermissions));
tokenUrl.searchParams.set('accountId', '*');
tokenUrl.searchParams.set('zoneId', 'all');
tokenUrl.searchParams.set('name', 'CF Cache Purge');

export const CREATE_TOKEN_URL = tokenUrl.toString();

interface CloudflareErrorDetail {
  code?: number;
  message?: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: CloudflareErrorDetail[];
}

interface Zone {
  id: string;
  name: string;
}

interface TokenVerification {
  status: string;
}

type Fetcher = typeof fetch;

export class CloudflareApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

export function normalizeToken(token: string): string {
  return token.trim();
}

export function normalizePurgeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CloudflareApiError('The current tab does not have a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CloudflareApiError('Only HTTP and HTTPS pages can be purged.');
  }

  if (!url.hostname || url.username || url.password) {
    throw new CloudflareApiError('The current tab does not have a purgeable URL.');
  }

  url.hash = '';
  return url.toString();
}

export function getZoneCandidates(hostname: string): string[] {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length < 2) return [];

  return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
}

export async function verifyApiToken(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const normalizedToken = requireToken(token);
  const verification = await requestCloudflare<TokenVerification>(
    '/user/tokens/verify',
    normalizedToken,
    undefined,
    fetcher,
  );

  if (verification.status !== 'active') {
    throw new CloudflareApiError('This API token is not active.');
  }

  const zones = await requestCloudflare<Zone[]>(
    '/zones?per_page=5',
    normalizedToken,
    undefined,
    fetcher,
  );

  if (zones.length === 0) {
    throw new CloudflareApiError('This token cannot access any Cloudflare zones.');
  }
}

export async function findZoneForHostname(
  token: string,
  hostname: string,
  fetcher: Fetcher = fetch,
): Promise<Zone> {
  const normalizedToken = requireToken(token);

  for (const candidate of getZoneCandidates(hostname)) {
    const zones = await requestCloudflare<Zone[]>(
      `/zones?name=${encodeURIComponent(candidate)}&per_page=5`,
      normalizedToken,
      undefined,
      fetcher,
    );
    const zone = zones.find((item) => item.name.toLowerCase() === candidate);
    if (zone) return zone;
  }

  throw new CloudflareApiError(`No accessible Cloudflare zone matches ${hostname}.`);
}

export async function purgeUrl(
  token: string,
  zoneId: string,
  rawUrl: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const normalizedToken = requireToken(token);
  const url = normalizePurgeUrl(rawUrl);
  await requestCloudflare<{ id: string }>(
    `/zones/${encodeURIComponent(zoneId)}/purge_cache`,
    normalizedToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [url] }),
    },
    fetcher,
  );
  return url;
}

function requireToken(token: string): string {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    throw new CloudflareApiError('Enter a Cloudflare API token.');
  }
  return normalizedToken;
}

async function requestCloudflare<T>(
  path: string,
  token: string,
  init: RequestInit | undefined,
  fetcher: Fetcher,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`${CLOUDFLARE_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new CloudflareApiError('Cloudflare could not be reached.');
  }

  let data: CloudflareResponse<T> | undefined;
  try {
    data = await response.json() as CloudflareResponse<T>;
  } catch {
    throw new CloudflareApiError(`Cloudflare returned an invalid response (${response.status}).`);
  }

  if (!response.ok || !data.success) {
    const message = data.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join(' ');
    throw new CloudflareApiError(message || `Cloudflare rejected the request (${response.status}).`);
  }

  return data.result;
}
