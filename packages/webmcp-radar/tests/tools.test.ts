import { describe, expect, test } from 'bun:test';
import { formatBadgeCount } from '@/utils/badge';
import {
  WEBMCP_MESSAGE,
  isScanPageResponse,
  isStateChangedMessage,
  type StateChangedMessage,
} from '@/utils/protocol';
import { classifyToolError, normalizeTools } from '@/utils/tools';

describe('formatBadgeCount', () => {
  const cases: Array<[number, string]> = [
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1000, '999+'],
    [-3, '0'],
    [Number.NaN, '0'],
  ];

  for (const [count, expected] of cases) {
    test(`formats ${String(count)} as ${expected}`, () => {
      expect(formatBadgeCount(count)).toBe(expected);
    });
  }
});

describe('normalizeTools', () => {
  test('sorts, parses legacy schemas, and produces serializable DTOs', () => {
    const tools: WebMcpPageTool[] = [
      {
        name: 'zebra.tool',
        description: '<img src=x onerror=alert(1)>',
        origin: 'https://frame.example',
        inputSchema: '{"type":"object","properties":{"query":{"type":"string"}}}',
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        window: {} as WindowProxy,
      },
      {
        name: 'alpha_tool',
        title: 'Alpha',
        origin: 'https://page.example',
      },
    ];

    const normalized = normalizeTools(tools, 'https://fallback.example');

    expect(normalized.map((tool) => tool.name)).toEqual(['alpha_tool', 'zebra.tool']);
    expect(normalized[1]?.inputSchema).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    expect(normalized[1]?.description).toBe('<img src=x onerror=alert(1)>');
    expect(JSON.stringify(normalized)).not.toContain('window');
    expect(() => structuredClone(normalized)).not.toThrow();
  });

  test('keeps duplicate names distinct across frames', () => {
    const normalized = normalizeTools([
      { name: 'search', origin: 'https://a.example' },
      { name: 'search', origin: 'https://b.example' },
      { name: 'search', origin: 'https://b.example' },
    ], 'https://fallback.example');

    expect(normalized).toHaveLength(3);
    expect(new Set(normalized.map((tool) => tool.key)).size).toBe(3);
  });

  test('drops cyclic schema branches rather than leaking unserializable values', () => {
    const schema: Record<string, unknown> = { type: 'object' };
    schema.self = schema;
    const [tool] = normalizeTools([
      { name: 'cyclic', inputSchema: schema },
    ], 'https://page.example');

    expect(tool?.inputSchema).toEqual({ type: 'object' });
    expect(() => structuredClone(tool)).not.toThrow();
  });

  test('preserves an own __proto__ schema key without changing object prototypes', () => {
    const schema = JSON.parse(
      '{"type":"object","__proto__":{"polluted":"yes"}}',
    ) as Record<string, unknown>;
    const [tool] = normalizeTools([
      { name: 'safe-schema', inputSchema: schema },
    ], 'https://page.example');
    const normalizedSchema = tool?.inputSchema;

    expect(normalizedSchema).toEqual({
      type: 'object',
      ['__proto__']: { polluted: 'yes' },
    });
    expect(Object.prototype.hasOwnProperty.call(normalizedSchema, '__proto__')).toBe(true);
    expect(Object.prototype.propertyIsEnumerable.call(normalizedSchema, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(normalizedSchema)).toBe(Object.prototype);
    expect((Object.prototype as Record<string, unknown>).polluted).toBe(undefined);
    expect(() => structuredClone(normalizedSchema)).not.toThrow();

    const serialized = JSON.stringify(normalizedSchema);
    expect(serialized).toContain('"__proto__"');
    expect(JSON.parse(serialized)).toEqual({
      type: 'object',
      ['__proto__']: { polluted: 'yes' },
    });
  });
});

describe('classifyToolError', () => {
  const cases: Array<[
    string,
    'blocked' | 'restricted',
    'permissions-policy' | 'origin-isolation' | 'document-inactive' | 'scan-failed',
  ]> = [
    ['NotAllowedError', 'blocked', 'permissions-policy'],
    ['SecurityError', 'blocked', 'origin-isolation'],
    ['InvalidStateError', 'restricted', 'document-inactive'],
    ['UnknownError', 'restricted', 'scan-failed'],
  ];

  for (const [name, status, reason] of cases) {
    test(`maps ${name} to ${status}/${reason}`, () => {
      expect(classifyToolError({ name, message: 'example' })).toMatchObject({ status, reason });
    });
  }
});

describe('state change protocol', () => {
  test('accepts a serializable supported snapshot', () => {
    const message: StateChangedMessage = {
      type: WEBMCP_MESSAGE.stateChanged,
      state: {
        status: 'supported',
        tabId: 7,
        pageUrl: 'https://example.com/',
        pageOrigin: 'https://example.com',
        scannedAt: 1,
        fromOrigins: ['https://example.com'],
        fallbackUsed: false,
        tools: [],
      },
    };

    expect(isStateChangedMessage(message)).toBe(true);
    expect(isStateChangedMessage({ type: WEBMCP_MESSAGE.stateChanged, state: null })).toBe(false);
  });

  test('rejects malformed base fields in responses and state changes', () => {
    const result = validScanResult();

    expect(isScanPageResponse({ requestId: 'scan-1', result }, 'scan-1')).toBe(true);
    expect(isScanPageResponse({
      requestId: 'scan-1',
      result: { ...result, scannedAt: Number.NaN },
    }, 'scan-1')).toBe(false);
    expect(isScanPageResponse({
      requestId: 'scan-1',
      result: { ...result, fromOrigins: ['https://example.com', 42] },
    }, 'scan-1')).toBe(false);
    expect(isStateChangedMessage({
      type: WEBMCP_MESSAGE.stateChanged,
      state: { ...result, tabId: 7, fallbackUsed: 'no' },
    })).toBe(false);
  });

  test('validates the complete tool DTO including JSON schemas and annotations', () => {
    const result = validScanResult();
    const tool = result.tools[0];
    expect(isScanPageResponse({ requestId: 'scan-1', result }, 'scan-1')).toBe(true);

    for (const malformedTool of [
      { ...tool, index: -1 },
      { ...tool, index: 0.5 },
      { ...tool, name: 42 },
      { ...tool, title: false },
      { ...tool, origin: null },
      { ...tool, annotations: { readOnlyHint: 'yes' } },
      { ...tool, inputSchema: { maximum: Number.NaN } },
    ]) {
      expect(isScanPageResponse({
        requestId: 'scan-1',
        result: { ...result, tools: [malformedTool] },
      }, 'scan-1')).toBe(false);
    }

    const cyclicSchema: Record<string, unknown> = { type: 'object' };
    cyclicSchema.self = cyclicSchema;
    expect(isScanPageResponse({
      requestId: 'scan-1',
      result: { ...result, tools: [{ ...tool, inputSchema: cyclicSchema }] },
    }, 'scan-1')).toBe(false);

    let tooDeepSchema: Record<string, unknown> = {};
    for (let depth = 0; depth < 64; depth += 1) {
      tooDeepSchema = { nested: tooDeepSchema };
    }
    expect(isScanPageResponse({
      requestId: 'scan-1',
      result: { ...result, tools: [{ ...tool, inputSchema: tooDeepSchema }] },
    }, 'scan-1')).toBe(false);
  });

  test('enforces status-specific reasons and error fields', () => {
    const base = validScanResult();
    const cases = [
      { ...base, status: 'unsupported', reason: 'scan-failed' },
      { ...base, status: 'blocked', reason: 'permissions-policy' },
      {
        ...base,
        status: 'blocked',
        reason: 'permissions-policy',
        errorName: 'SecurityError',
      },
      { ...base, status: 'restricted', reason: 'not-a-reason' },
      { ...base, status: 'restricted', reason: 'scan-failed', errorName: 42 },
    ];

    for (const result of cases) {
      expect(isScanPageResponse({ requestId: 'scan-1', result }, 'scan-1')).toBe(false);
    }

    expect(isScanPageResponse({
      requestId: 'scan-1',
      result: {
        ...base,
        status: 'blocked',
        reason: 'origin-isolation',
        errorName: 'SecurityError',
        message: 'Cross-origin access is blocked.',
      },
    }, 'scan-1')).toBe(true);
  });
});

function validScanResult() {
  return {
    status: 'supported' as const,
    pageUrl: 'https://example.com/tools',
    pageOrigin: 'https://example.com',
    scannedAt: 1,
    fromOrigins: ['https://example.com'],
    fallbackUsed: false,
    tools: [{
      key: '["https://example.com","search",0]',
      index: 0,
      name: 'search',
      title: 'Search',
      description: 'Search this page',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      origin: 'https://example.com',
    }],
  };
}
