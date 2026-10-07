import { expect, test } from 'bun:test';
import { scanMcpDiscovery } from '../utils/scanner';
import type { ScanResult, ScanTarget, ServerCard } from '../utils/types';

const schemaUrl = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
const target: ScanTarget = {
  pageUrl: 'https://example.com/app',
  pageOrigin: 'https://example.com',
  origin: 'https://example.com',
  endpoint: 'https://example.com/.well-known/ai-catalog.json',
};

const validCard: ServerCard = {
  $schema: schemaUrl,
  name: 'example-org/minimal',
  version: '1.0.0',
  description: 'Smallest valid Server Card.',
  title: 'Example',
};

test('discovers a server card linked from the AI Catalog', async () => {
  const requests: { url: string; accept: string | null; ifNoneMatch: string | null }[] = [];
  const result = await scanMcpDiscovery(target, {
    now: () => 1000,
    fetcher: async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        accept: headers.get('accept'),
        ifNoneMatch: headers.get('if-none-match'),
      });
      if (String(input).endsWith('/.well-known/ai-catalog.json')) {
        return jsonResponse(
          {
            specVersion: '1.0',
            entries: [
              {
                identifier: 'urn:air:example.com:mcp:minimal',
                type: 'application/mcp-server-card+json',
                url: 'https://example.com/mcp/server-card',
              },
            ],
          },
          'application/ai-catalog+json',
        );
      }
      return jsonResponse(validCard, 'application/mcp-server-card+json');
    },
  });

  expect(requests.map((request) => request.url)).toEqual([
    'https://example.com/.well-known/ai-catalog.json',
    'https://example.com/mcp/server-card',
  ]);
  expect(requests[0]?.accept).toContain('application/ai-catalog+json');
  expect(requests[1]?.accept).toContain('application/mcp-server-card+json');
  expect(result.status).toBe('found');
  expect(result.entries[0]?.serverCard?.name).toBe('example-org/minimal');
  expect(result.entries[0]?.identifier).toBe('urn:air:example.com:mcp:minimal');
  expect(result.expiresAt).toBe(3_601_000);
  expect(result.warnings).toEqual([]);
});

test('reads an inline server card without a second request', async () => {
  let calls = 0;
  const result = await scanMcpDiscovery(target, {
    fetcher: async () => {
      calls += 1;
      return jsonResponse({
        specVersion: '1.0',
        entries: [
          {
            identifier: 'urn:air:example.com:mcp:inline',
            type: 'application/mcp-server-card+json',
            data: validCard,
          },
        ],
      });
    },
  });

  expect(calls).toBe(1);
  expect(result.status).toBe('found');
  expect(result.entries[0]?.inline).toBe(true);
  expect(result.entries[0]?.serverCard?.name).toBe('example-org/minimal');
});

test('lists other artifacts without fetching them', async () => {
  const urls: string[] = [];
  const result = await scanMcpDiscovery(target, {
    fetcher: async (input) => {
      urls.push(String(input));
      if (String(input).endsWith('/server-card')) return jsonResponse(validCard, 'application/mcp-server-card+json');
      return jsonResponse({
        specVersion: '1.0',
        host: { displayName: 'Example' },
        entries: [
          {
            identifier: 'urn:air:example.com:skill:code-review',
            displayName: 'Code Review Assistant',
            type: 'application/agent-skills+zip',
            url: 'https://skills.example.com/code-review/skill.zip',
          },
          {
            identifier: 'urn:air:example.com:mcp:minimal',
            type: 'application/mcp-server-card+json',
            url: 'https://example.com/mcp/server-card',
          },
        ],
      });
    },
  });

  expect(urls).toEqual(['https://example.com/.well-known/ai-catalog.json', 'https://example.com/mcp/server-card']);
  expect(result.status).toBe('found');
  expect(result.host?.displayName).toBe('Example');
  expect(result.entries.map((entry) => entry.type)).toEqual([
    'application/agent-skills+zip',
    'application/mcp-server-card+json',
  ]);
  expect(result.entries[0]?.serverCard).toBeUndefined();
  expect(result.entries[1]?.serverCard?.name).toBe('example-org/minimal');
});

test('returns not-found for a missing catalog', async () => {
  const result = await scanMcpDiscovery(target, {
    fetcher: async () => new Response('', { status: 404 }),
    now: () => 1000,
  });

  expect(result.status).toBe('not-found');
  expect(result.expiresAt).toBe(601_000);
});

test('warns when media types or browser CORS headers do not match the extension', async () => {
  const result = await scanMcpDiscovery(target, {
    fetcher: async (input) => {
      if (String(input).endsWith('/ai-catalog.json')) {
        return jsonResponse(
          {
            entries: [
              {
                identifier: 'urn:air:example.com:mcp:minimal',
                type: 'application/mcp-server-card+json',
                url: 'https://example.com/mcp/server-card',
              },
            ],
          },
          'text/plain',
        );
      }
      return new Response(JSON.stringify(validCard), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  expect(result.status).toBe('found-with-warnings');
  expect(result.warnings.some((warning) => warning.code === 'content-type')).toBe(true);
  expect(result.entries[0]?.warnings.filter((warning) => warning.code === 'cors')).toHaveLength(4);
  expect(result.entries[0]?.warnings.some((warning) => warning.message.includes('If-None-Match'))).toBe(true);
  expect(result.entries[0]?.warnings.some((warning) => warning.message.includes('ETag'))).toBe(true);
});

test('reuses a cached card when the server returns Not Modified', async () => {
  const previous: ScanResult = {
    status: 'found',
    endpoint: target.endpoint,
    fetchedAt: 1000,
    catalogEtag: '"catalog"',
    entries: [
      {
        identifier: 'urn:air:example.com:mcp:minimal',
        type: 'application/mcp-server-card+json',
        sourceUrl: 'https://example.com/mcp/server-card',
        inline: false,
        serverCard: validCard,
        warnings: [],
        etag: '"card"',
      },
    ],
    warnings: [],
  };
  const requests: string[] = [];
  const result = await scanMcpDiscovery(target, {
    previous,
    fetcher: async (input, init) => {
      requests.push(new Headers(init?.headers).get('if-none-match') ?? '');
      return new Response(null, {
        status: 304,
        headers: {
          etag: requests.length === 1 ? '"catalog"' : '"card"',
          'cache-control': 'public, max-age=60',
        },
      });
    },
  });

  expect(requests).toEqual(['"catalog"', '"card"']);
  expect(result.status).toBe('found');
  expect(result.entries[0]?.serverCard?.name).toBe('example-org/minimal');
  expect(result.cacheTtlMs).toBe(60_000);
});

function jsonResponse(body: unknown, contentType = 'application/ai-catalog+json'): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=3600',
      etag: '"v1"',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'Content-Type, If-None-Match',
      'access-control-expose-headers': 'ETag',
    },
  });
}
