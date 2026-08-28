import {
  TOKEN_STORAGE_KEY,
  findZoneForHostname,
  normalizePurgeUrl,
  purgeUrl,
} from '@/utils/cloudflare';

const DEFAULT_TITLE = 'Purge this URL from Cloudflare cache';
const zoneByHostname = new Map<string, { id: string; name: string }>();
const badgeGeneration = new Map<number, number>();
const purgingTabs = new Set<number>();

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    void handleActionClick(tab).catch(() => undefined);
  });

  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[TOKEN_STORAGE_KEY]) zoneByHostname.clear();
  });
});

async function handleActionClick(tab: Browser.tabs.Tab): Promise<void> {
  const tabId = tab.id;
  if (tabId === undefined) return;
  if (purgingTabs.has(tabId)) return;

  const stored = await browser.storage.local.get(TOKEN_STORAGE_KEY);
  const token = typeof stored[TOKEN_STORAGE_KEY] === 'string'
    ? stored[TOKEN_STORAGE_KEY].trim()
    : '';

  if (!token) {
    await browser.action.setTitle({ tabId, title: 'Configure a Cloudflare API token' });
    await browser.runtime.openOptionsPage();
    return;
  }

  let url: URL;
  try {
    url = new URL(normalizePurgeUrl(tab.url ?? ''));
  } catch (error) {
    await showResult(tabId, 'error', errorMessage(error));
    return;
  }

  const generation = nextGeneration(tabId);
  purgingTabs.add(tabId);

  try {
    await showRunning(tabId, generation);
    let zone = zoneByHostname.get(url.hostname);
    if (!zone) {
      zone = await findZoneForHostname(token, url.hostname);
      zoneByHostname.set(url.hostname, zone);
    }
    await purgeUrl(token, zone.id, url.toString());
    await showResult(tabId, 'success', `Purged ${url.toString()}`, generation);
  } catch (error) {
    await showResult(tabId, 'error', errorMessage(error), generation);
  } finally {
    purgingTabs.delete(tabId);
  }
}

async function showRunning(tabId: number, generation: number): Promise<void> {
  if (!isCurrent(tabId, generation)) return;
  await Promise.all([
    browser.action.setBadgeText({ tabId, text: '…' }),
    browser.action.setBadgeBackgroundColor({ tabId, color: '#77716D' }),
    browser.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }),
    browser.action.setTitle({ tabId, title: 'Purging this URL from Cloudflare cache…' }),
  ]);
}

async function showResult(
  tabId: number,
  result: 'success' | 'error',
  detail: string,
  knownGeneration?: number,
): Promise<void> {
  const generation = knownGeneration ?? nextGeneration(tabId);
  if (!isCurrent(tabId, generation)) return;

  const success = result === 'success';
  await Promise.all([
    browser.action.setBadgeText({ tabId, text: success ? '✓' : '!' }),
    browser.action.setBadgeBackgroundColor({ tabId, color: success ? '#178C52' : '#C9362B' }),
    browser.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }),
    browser.action.setTitle({
      tabId,
      title: success ? detail : `Cache purge failed: ${detail}`,
    }),
  ]);

  setTimeout(() => {
    if (!isCurrent(tabId, generation)) return;
    void Promise.all([
      browser.action.setBadgeText({ tabId, text: '' }),
      browser.action.setTitle({ tabId, title: DEFAULT_TITLE }),
    ]).catch(() => undefined);
  }, success ? 2500 : 5000);
}

function nextGeneration(tabId: number): number {
  const generation = (badgeGeneration.get(tabId) ?? 0) + 1;
  badgeGeneration.set(tabId, generation);
  return generation;
}

function isCurrent(tabId: number, generation: number): boolean {
  return badgeGeneration.get(tabId) === generation;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Cloudflare rejected the purge request.';
}
