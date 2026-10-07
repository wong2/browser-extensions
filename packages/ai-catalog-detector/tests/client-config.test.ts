import { expect, test } from 'bun:test';
import { clientConfig, preferredRemote, requiresAuth, serverKey } from '../utils/client-config';
import { SERVER_CARD_MEDIA_TYPE, type CatalogEntry, type RemoteEndpoint } from '../utils/types';

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return { type: SERVER_CARD_MEDIA_TYPE, inline: false, warnings: [], ...overrides };
}

test('prefers streamable HTTP over SSE', () => {
  const remotes: RemoteEndpoint[] = [
    { type: 'sse', url: 'https://example.com/sse' },
    { type: 'streamable-http', url: 'https://example.com/mcp' },
  ];
  expect(preferredRemote(remotes)?.url).toBe('https://example.com/mcp');
});

test('derives the server key from the package name', () => {
  expect(serverKey(entry({ serverCard: { name: 'com.codex-resets/codex-resets' } }))).toBe('codex-resets');
  expect(serverKey(entry({ displayName: 'Acme Issues' }))).toBe('acme-issues');
  expect(serverKey(entry())).toBe('mcp-server');
});

test('builds an mcpServers config with header placeholders and variable defaults', () => {
  const config = clientConfig(
    entry({
      serverCard: {
        name: 'dev.acme/issues',
        remotes: [
          {
            type: 'streamable-http',
            url: 'https://{region}.acme.dev/mcp',
            headers: [
              { name: 'Authorization', isRequired: true, isSecret: true },
              { name: 'X-Trace', isRequired: false },
            ],
            variables: [{ name: 'region', default: 'us' }],
          },
        ],
      },
    }),
  );

  expect(JSON.parse(config!)).toEqual({
    mcpServers: {
      issues: {
        type: 'http',
        url: 'https://us.acme.dev/mcp',
        headers: { Authorization: '<Authorization>' },
      },
    },
  });
});

test('returns undefined without a usable remote', () => {
  expect(clientConfig(entry({ serverCard: { remotes: [] } }))).toBeUndefined();
});

test('detects authentication requirements', () => {
  expect(requiresAuth({ type: 'sse', url: 'x', headers: [{ name: 'Authorization', isSecret: true }] })).toBe(true);
  expect(requiresAuth({ type: 'sse', url: 'x' })).toBe(false);
});
