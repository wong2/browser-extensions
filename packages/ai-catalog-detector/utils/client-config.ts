import { identifierLabel } from './catalog';
import type { CatalogEntry, RemoteEndpoint } from './types';

const TRANSPORT_PREFERENCE = ['streamable-http', 'http', 'sse'];

export function preferredRemote(remotes: RemoteEndpoint[] | undefined): RemoteEndpoint | undefined {
  const usable = (remotes ?? []).filter((remote) => remote.url);
  for (const type of TRANSPORT_PREFERENCE) {
    const match = usable.find((remote) => remote.type === type);
    if (match) return match;
  }
  return usable[0];
}

export function transportLabel(type: string | undefined): string {
  if (type === 'streamable-http' || type === 'http') return 'HTTP';
  if (type === 'sse') return 'SSE';
  return type || 'Unknown transport';
}

export function requiresAuth(remote: RemoteEndpoint): boolean {
  return Boolean(remote.headers?.some((header) => header.isRequired || header.isSecret));
}

export function serverKey(entry: CatalogEntry): string {
  const source =
    identifierLabel(entry.serverCard?.name) || entry.displayName || entry.serverCard?.title || identifierLabel(entry.identifier);
  const slug = (source ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'mcp-server';
}

export function clientConfig(entry: CatalogEntry): string | undefined {
  const remote = preferredRemote(entry.serverCard?.remotes);
  if (!remote) return undefined;

  const url = (remote.variables ?? []).reduce(
    (value, variable) => (variable.default ? value.replaceAll(`{${variable.name}}`, variable.default) : value),
    remote.url,
  );
  const headers = Object.fromEntries(
    (remote.headers ?? [])
      .filter((header) => header.isRequired || header.isSecret)
      .map((header) => [header.name, `<${header.name}>`]),
  );

  const server = {
    type: remote.type === 'sse' ? 'sse' : 'http',
    url,
    ...(Object.keys(headers).length ? { headers } : {}),
  };

  return JSON.stringify({ mcpServers: { [serverKey(entry)]: server } }, null, 2);
}
