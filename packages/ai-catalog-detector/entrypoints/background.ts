import { getBadgeState } from '@/utils/badge';
import { isResultFresh, readStoredScan, writeCachedScan } from '@/utils/cache';
import { scanMcpDiscovery } from '@/utils/scanner';
import type { RuntimeMessage, ScanResult, ScanTarget } from '@/utils/types';
import { createUnsupportedResult, getScanTarget, isScanTarget } from '@/utils/url';

const inFlightScans = new Map<string, Promise<ScanResult>>();
const lastScannedUrlByTab = new Map<number, string>();

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void scanActiveTab();
  });

  browser.runtime.onStartup.addListener(() => {
    void scanActiveTab();
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void scanTab(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      void scanTabIfUrlChanged(tabId, tab);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    lastScannedUrlByTab.delete(tabId);
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (!isRuntimeMessage(message)) return undefined;

    if (message.type === 'catalog:refresh-current-scan') {
      return scanActiveTab({ force: true });
    }

    return scanActiveTab();
  });
});

async function scanActiveTab(options: { force?: boolean } = {}): Promise<ScanResult> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab?.id) {
    return createUnsupportedResult(undefined, 'No active tab is available.');
  }

  return scanTab(tab.id, tab, options);
}

async function scanTab(
  tabId: number,
  tab?: Browser.tabs.Tab,
  options: { force?: boolean } = {},
): Promise<ScanResult> {
  const currentTab = tab ?? (await browser.tabs.get(tabId));

  if (!currentTab.url) {
    const result = createUnsupportedResult(undefined, 'Current tab URL is not available.');
    await updateBadge(tabId, result);
    return result;
  }

  const targetOrResult = getScanTarget(currentTab.url);
  if (!isScanTarget(targetOrResult)) {
    await updateBadge(tabId, targetOrResult);
    return targetOrResult;
  }

  const stored = await readStoredScan(targetOrResult.origin);
  if (!options.force && isResultFresh(stored)) {
    const cachedForTab = {
      ...stored,
      fromCache: true,
      pageUrl: targetOrResult.pageUrl,
      pageOrigin: targetOrResult.pageOrigin,
    };
    await updateBadge(tabId, cachedForTab);
    return cachedForTab;
  }

  const result = await scanTarget(targetOrResult, stored);
  await writeCachedScan(result);
  await updateBadge(tabId, result);
  return result;
}

async function scanTabIfUrlChanged(tabId: number, tab?: Browser.tabs.Tab): Promise<ScanResult | undefined> {
  const currentTab = tab ?? (await browser.tabs.get(tabId));
  if (!currentTab.url) return undefined;

  if (lastScannedUrlByTab.get(tabId) === currentTab.url) {
    return undefined;
  }

  lastScannedUrlByTab.set(tabId, currentTab.url);
  return scanTab(tabId, currentTab);
}

async function scanTarget(target: ScanTarget, previous?: ScanResult): Promise<ScanResult> {
  const existing = inFlightScans.get(target.endpoint);
  if (existing) return existing;

  const next = scanMcpDiscovery(target, { previous }).finally(() => {
    inFlightScans.delete(target.endpoint);
  });
  inFlightScans.set(target.endpoint, next);
  return next;
}

async function updateBadge(tabId: number, result: ScanResult): Promise<void> {
  const badge = getBadgeState(result);
  await browser.action.setBadgeText({ tabId, text: badge.text });
  await browser.action.setTitle({ tabId, title: badge.title });

  if (badge.color) {
    await browser.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  }
}

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: unknown }).type;
  return type === 'catalog:get-current-scan' || type === 'catalog:refresh-current-scan';
}
