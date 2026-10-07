import { expect, test } from 'bun:test';
import { parseAiCatalog } from '../utils/catalog';

const catalogUrl = 'https://example.com/.well-known/ai-catalog.json';

test('keeps MCP Server Cards and other artifact types', () => {
  const result = parseAiCatalog(
    {
      specVersion: '1.0',
      entries: [
        {
          identifier: 'urn:air:example.com:skill:code-review',
          displayName: 'Code Review Assistant',
          type: 'application/agent-skills+zip',
          url: 'https://skills.example.com/code-review/skill.zip',
        },
        {
          identifier: 'urn:air:example.com:mcp:weather',
          type: 'application/mcp-server-card+json',
          url: 'https://example.com/mcp/server-card',
        },
      ],
    },
    catalogUrl,
  );

  expect(result.ok).toBe(true);
  expect(result.warnings).toEqual([]);
  expect(result.entries).toEqual([
    {
      identifier: 'urn:air:example.com:skill:code-review',
      type: 'application/agent-skills+zip',
      displayName: 'Code Review Assistant',
      sourceUrl: 'https://skills.example.com/code-review/skill.zip',
      inline: false,
      warnings: [],
    },
    {
      identifier: 'urn:air:example.com:mcp:weather',
      type: 'application/mcp-server-card+json',
      sourceUrl: 'https://example.com/mcp/server-card',
      inline: false,
      warnings: [],
    },
  ]);
});

test('keeps inline cards and resolves relative URLs against the catalog', () => {
  const result = parseAiCatalog(
    {
      entries: [
        { identifier: 'urn:air:example.com:mcp:inline', type: 'application/mcp-server-card+json', data: { name: 'example-org/inline' } },
        { identifier: 'urn:air:example.com:mcp:relative', type: 'application/mcp-server-card+json', url: '/weather/server-card' },
      ],
    },
    catalogUrl,
  );

  expect(result.entries[0]).toMatchObject({ inline: true, inlineData: { name: 'example-org/inline' } });
  expect(result.entries[1]?.sourceUrl).toBe('https://example.com/weather/server-card');
});

test('skips entries that include both url and data', () => {
  const result = parseAiCatalog(
    {
      entries: [
        {
          identifier: 'urn:air:example.com:mcp:both',
          type: 'application/mcp-server-card+json',
          url: 'https://example.com/mcp/server-card',
          data: { name: 'example-org/both' },
        },
      ],
    },
    catalogUrl,
  );

  expect(result.ok).toBe(true);
  expect(result.entries[0]?.sourceUrl).toBeUndefined();
  expect(result.entries[0]?.inline).toBe(false);
  expect(result.entries[0]?.warnings[0]?.code).toBe('entry');
});

test('rejects documents that are not catalogs', () => {
  const result = parseAiCatalog({ name: 'not-a-catalog' }, catalogUrl);

  expect(result.ok).toBe(false);
  expect(result.warnings[0]?.code).toBe('catalog');
});

test('caps the number of server card entries it will inspect', () => {
  const result = parseAiCatalog(
    {
      entries: [1, 2, 3].map((index) => ({
        identifier: `urn:air:example.com:mcp:${index}`,
        type: 'application/mcp-server-card+json',
        url: `https://example.com/${index}/server-card`,
      })),
    },
    catalogUrl,
    2,
  );

  expect(result.entries).toHaveLength(2);
  expect(result.warnings.some((warning) => warning.message.includes('first 2'))).toBe(true);
});
