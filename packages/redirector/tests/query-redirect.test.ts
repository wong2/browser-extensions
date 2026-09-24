import { expect, test } from 'bun:test';
import { buildDNRRules, getQueryRedirectUrl, parseRules, STORAGE_KEY } from '../utils/rules';
import { redirectQueryNavigation } from '../utils/navigation';

const rules = parseRules('l.meta.ai => query:u');
const destination = 'https://sources.news/p/mark-zuckerberg-meta-muse-ai-podcast-interview';
const metaUrl = 'https://l.meta.ai/?u=https%3A%2F%2Fsources.news%2Fp%2Fmark-zuckerberg-meta-muse-ai-podcast-interview&h=AUBRYH83yqTG2BTMOuBzGrA6yqSngFa17trzD3EClJspW7reSg9oa8qzlkE2QDBGQ5L_KxuIYkDj56_kSpUmexFok7DfrpCEZxjAj4MIe9m_xTcO9S_CUw';

test('redirects the supplied Meta link', () => {
  expect(getQueryRedirectUrl(metaUrl, rules)).toBe(destination);
});

test('decodes once and preserves destination query, fragment, escaped separators and plus', () => {
  const target = 'https://example.com/a%2Fb?q=a+b&next=%2Fdocs#section';
  expect(getQueryRedirectUrl(`https://l.meta.ai/?h=tracking&u=${encodeURIComponent(target)}`, rules)).toBe(target);
});

test('matches exact host/path and respects scheme and path patterns', () => {
  const query = `?u=${encodeURIComponent(destination)}`;
  for (const source of ['https://l.meta.ai.evil.test/', 'https://other.test/', 'https://l.meta.ai/other']) {
    expect(getQueryRedirectUrl(source + query, rules)).toBe(undefined);
  }
  const scoped = parseRules('https://l.meta.ai/link/:path* => query:u');
  expect(getQueryRedirectUrl('https://l.meta.ai/link/a/b' + query, scoped)).toBe(destination);
  expect(getQueryRedirectUrl('http://l.meta.ai/link/a/b' + query, scoped)).toBe(undefined);
  const literal = parseRules('l.meta.ai/go.html => query:u');
  expect(getQueryRedirectUrl('https://l.meta.ai/goXhtml' + query, literal)).toBe(undefined);
});

test('ignores absent, empty, malformed and non-http destinations', () => {
  for (const value of ['', '/relative', '//example.com/', 'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'https://', 'https%3A%2F%2Fexample.com']) {
    expect(getQueryRedirectUrl(`https://l.meta.ai/?u=${encodeURIComponent(value)}`, rules)).toBe(undefined);
  }
  expect(getQueryRedirectUrl('https://l.meta.ai/?h=tracking', rules)).toBe(undefined);
  expect(getQueryRedirectUrl('invalid', rules)).toBe(undefined);
});

test('query rules never enter DNR and existing path redirects are preserved', () => {
  Object.assign(globalThis, { browser: { declarativeNetRequest: {
    RuleActionType: { REDIRECT: 'redirect' }, ResourceType: { MAIN_FRAME: 'main_frame' },
  } } });
  const mixed = parseRules('l.meta.ai => query:u\nnpmjs.com/package/:slug* => npmx.dev/package/:slug*');
  expect(mixed).toHaveLength(2);
  const dnr = buildDNRRules(mixed);
  expect(dnr).toHaveLength(1);
  expect(dnr[0]?.condition.regexFilter).toBe('^(https?)://npmjs\\.com/package/(.+)$');
  expect(dnr[0]?.action.redirect?.regexSubstitution).toBe('\\1://npmx.dev/package/\\2');
  expect(buildDNRRules(rules)).toEqual([]);
  expect(parseRules('l.meta.ai => query:')).toEqual([]);
});

test('navigation updates only the matching main tab and reads current saved rules', async () => {
  const updates: unknown[] = [];
  let saved = 'l.meta.ai => query:u';
  let tab = { pendingUrl: metaUrl, url: 'https://previous.test/' };
  Object.assign(globalThis, { browser: {
    storage: { local: { get: async () => ({ [STORAGE_KEY]: saved }) } },
    tabs: {
      get: async () => tab,
      update: async (id: number, update: unknown) => { updates.push({ id, update }); },
    },
  } });
  const event = { tabId: 7, frameId: 0, url: metaUrl };
  await redirectQueryNavigation({ ...event, frameId: 1 });
  expect(updates).toHaveLength(0);
  await redirectQueryNavigation(event);
  expect(updates).toEqual([{ id: 7, update: { url: destination } }]);
  tab = { pendingUrl: 'https://new-navigation.test/', url: metaUrl };
  await redirectQueryNavigation(event);
  expect(updates).toHaveLength(1);
  tab = { pendingUrl: '', url: metaUrl };
  await redirectQueryNavigation(event);
  expect(updates).toHaveLength(2);
  saved = '';
  await redirectQueryNavigation(event);
  expect(updates).toHaveLength(2);
});
