import { getQueryRedirectUrl, parseRules, STORAGE_KEY } from './rules';

export async function redirectQueryNavigation(details: {
  tabId: number;
  frameId: number;
  url: string;
}): Promise<void> {
  if (details.frameId !== 0 || details.tabId < 0) return;

  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  const target = getQueryRedirectUrl(details.url, parseRules(typeof value === 'string' ? value : ''));
  if (!target) return;

  // Don't overwrite a newer navigation while storage was being read.
  const tab = await browser.tabs.get(details.tabId);
  if ((tab.pendingUrl || tab.url) !== details.url) return;
  await browser.tabs.update(details.tabId, { url: target });
}
