const SEARCH_URL = 'https://crt.name/v1/search';
const APEX_HINT = /eTLD\+1 is ([a-z0-9.-]+)/i;

export interface Subdomain {
  sub: string;
  first_seen: string | null;
}

export class SearchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

export async function searchSubdomains(apex: string): Promise<Subdomain[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('apex', apex);
  url.searchParams.set('format', 'json');
  url.searchParams.set('dates', '1');

  const resp = await fetch(url);
  const body = await resp.text();

  if (resp.status === 429) {
    throw new SearchError('Rate limited by crt.name, try again later', 429);
  }

  if (!resp.ok) {
    throw new SearchError(body.trim() || `Request failed (${resp.status})`, resp.status);
  }

  if (!body.trim()) {
    return [];
  }

  return JSON.parse(body) as Subdomain[];
}

export function apexFromError(message: string): string | null {
  return message.match(APEX_HINT)?.[1] ?? null;
}
