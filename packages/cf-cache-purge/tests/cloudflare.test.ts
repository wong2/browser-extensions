import { describe, expect, test } from 'bun:test';
import {
  CREATE_TOKEN_URL,
  findZoneForHostname,
  getZoneCandidates,
  normalizePurgeUrl,
  purgeUrl,
  verifyApiToken,
} from '../utils/cloudflare';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Cloudflare token template', () => {
  test('prefills only the permissions the extension needs', () => {
    const url = new URL(CREATE_TOKEN_URL);
    expect(url.origin).toBe('https://dash.cloudflare.com');
    expect(JSON.parse(url.searchParams.get('permissionGroupKeys') ?? '[]')).toEqual([
      { key: 'zone', type: 'read' },
      { key: 'cache', type: 'purge' },
    ]);
    expect(url.searchParams.get('zoneId')).toBe('all');
  });
});

describe('URL and zone handling', () => {
  test('keeps query parameters but strips fragments', () => {
    expect(normalizePurgeUrl('https://www.example.com/a?draft=1#preview'))
      .toBe('https://www.example.com/a?draft=1');
  });

  test('rejects non-web URLs', () => {
    expect(() => normalizePurgeUrl('chrome://extensions')).toThrow('Only HTTP and HTTPS');
  });

  test('tries the most specific possible zone first', () => {
    expect(getZoneCandidates('Docs.App.Example.CO.UK.')).toEqual([
      'docs.app.example.co.uk',
      'app.example.co.uk',
      'example.co.uk',
      'co.uk',
    ]);
  });
});

describe('Cloudflare API calls', () => {
  test('verifies the token and confirms zone access', async () => {
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      paths.push(String(input));
      return paths.length === 1
        ? jsonResponse({ success: true, result: { status: 'active' } })
        : jsonResponse({ success: true, result: [{ id: 'zone-1', name: 'example.com' }] });
    };

    await verifyApiToken(' token ', fetcher);
    expect(paths.map((path) => new URL(path).pathname)).toEqual([
      '/client/v4/user/tokens/verify',
      '/client/v4/zones',
    ]);
  });

  test('finds a parent zone without relying on a public suffix list', async () => {
    const names: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const name = new URL(String(input)).searchParams.get('name') ?? '';
      names.push(name);
      return jsonResponse({
        success: true,
        result: name === 'example.co.uk'
          ? [{ id: 'zone-1', name: 'example.co.uk' }]
          : [],
      });
    };

    await expect(findZoneForHostname('token', 'www.example.co.uk', fetcher))
      .resolves.toEqual({ id: 'zone-1', name: 'example.co.uk' });
    expect(names).toEqual(['www.example.co.uk', 'example.co.uk']);
  });

  test('purges exactly one normalized URL', async () => {
    let request: RequestInit | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      request = init;
      return jsonResponse({ success: true, result: { id: 'zone-1' } });
    };

    await expect(purgeUrl(
      'token',
      'zone-1',
      'https://example.com/path?q=1#section',
      fetcher,
    )).resolves.toBe('https://example.com/path?q=1');
    expect(request?.method).toBe('POST');
    expect(JSON.parse(String(request?.body))).toEqual({
      files: ['https://example.com/path?q=1'],
    });
  });

  test('surfaces Cloudflare error messages', async () => {
    const fetcher: typeof fetch = async () => jsonResponse({
      success: false,
      result: null,
      errors: [{ code: 10000, message: 'Authentication error' }],
    }, 403);

    await expect(verifyApiToken('bad-token', fetcher)).rejects.toThrow('Authentication error');
  });
});
