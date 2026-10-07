import { expect, test } from 'bun:test';
import { parseServerCard } from '../utils/schema';

const schemaUrl = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';

const minimalCard = {
  $schema: schemaUrl,
  name: 'example-org/minimal',
  version: '1.0.0',
  description: 'Smallest valid Server Card.',
};

test('accepts a minimal card without remotes', () => {
  const result = parseServerCard(minimalCard);

  expect(result.card?.name).toBe('example-org/minimal');
  expect(result.warnings).toEqual([]);
});

test('accepts a templated remote and drops secret header values', () => {
  const result = parseServerCard({
    ...minimalCard,
    name: 'example-org/with-remote',
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://{tenant}.example.com/mcp',
        headers: [
          {
            name: 'Authorization',
            isRequired: true,
            isSecret: true,
            value: 'Bearer super-secret-token',
          },
        ],
        variables: {
          tenant: { isRequired: true, default: 'default' },
        },
        supportedProtocolVersions: ['2025-06-18'],
      },
    ],
  });

  expect(result.warnings).toEqual([]);
  expect(result.card?.remotes?.[0]?.headers).toEqual([
    { name: 'Authorization', isRequired: true, isSecret: true },
  ]);
  expect(JSON.stringify(result)).not.toContain('super-secret-token');
  expect(result.card?.remotes?.[0]?.variables).toEqual([
    { name: 'tenant', isRequired: true, default: 'default' },
  ]);
});

test('warns when required fields are missing', () => {
  const result = parseServerCard({});
  const fields = result.warnings.filter((warning) => warning.code === 'required-field').map((warning) => warning.message);

  expect(fields).toEqual([
    'Missing required field: $schema.',
    'Missing required field: name.',
    'Missing required field: version.',
    'Missing required field: description.',
  ]);
});

test('warns on the wrong schema URL and name pattern', () => {
  const wrongSchema = parseServerCard({
    ...minimalCard,
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-11-25/server-card.schema.json',
  });
  const badName = parseServerCard({ ...minimalCard, name: 'no-slash-in-name' });

  expect(wrongSchema.warnings).toContainEqual({
    code: 'schema',
    message: `$schema must be ${schemaUrl}.`,
  });
  expect(badName.warnings).toContainEqual({
    code: 'schema',
    message: 'name must be a reverse-DNS identifier with one slash, such as com.example/weather.',
  });
});

test('rejects version ranges and invalid remote transports', () => {
  const result = parseServerCard({
    ...minimalCard,
    version: '^1.2.3',
    remotes: [{ type: 'websocket', url: 'not a url' }],
  });

  expect(result.warnings).toContainEqual({
    code: 'schema',
    message: 'version must be a concrete version, not a range.',
  });
  expect(result.warnings).toContainEqual({
    code: 'remote',
    message: 'Remote #1 type must be streamable-http or sse.',
  });
  expect(result.warnings).toContainEqual({
    code: 'remote',
    message: 'Remote #1 URL must be an HTTP(S) URL or a {template} variable.',
  });
});

test('removes non-HTTP website URLs before returning the card', () => {
  const result = parseServerCard({
    ...minimalCard,
    websiteUrl: 'javascript:alert(1)',
  });

  expect(result.card?.websiteUrl).toBeUndefined();
  expect(result.warnings).toContainEqual({
    code: 'schema',
    message: 'websiteUrl must be an HTTP(S) URL.',
  });
});

test('rejects non-object documents', () => {
  expect(parseServerCard('nope').card).toBeUndefined();
  expect(parseServerCard('nope').warnings[0]?.code).toBe('schema');
});
