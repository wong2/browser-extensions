import {
  WEBMCP_MESSAGE,
  isClearHistoryMessage,
  isContentSignalMessage,
  isDeleteHistoryEntryMessage,
  isGetActiveTabMessage,
  isScanPageResponse,
  type ContentSignalMessage,
  type DeleteHistoryEntryMessage,
  type GetActiveTabResponse,
  type HistoryMutationResponse,
  type PageScanResult,
  type RestrictedPageScan,
  type ScanPageMessage,
  type StateChangedMessage,
  type TabScanState,
} from '@/utils/protocol';
import { formatBadgeCount } from '@/utils/badge';
import {
  clearHistory,
  deleteHistoryEntry,
  recordSupportedPage,
  repairHistory,
} from '@/utils/history';
import {
  coalesceScanDeadline,
  planNavigation,
  planTabUpdate,
  type NavigationEventKind,
  type NavigationPlan,
} from '@/utils/navigation';

const generationByTab = new Map<number, number>();
const scheduledScansByTab = new Map<number, {
  dueAt: number;
  timer: ReturnType<typeof setTimeout>;
}>();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender) => {
    if (isGetActiveTabMessage(message)) return scanActiveTab();
    if (isContentSignalMessage(message)) return handleContentSignal(message, sender);
    if (isDeleteHistoryEntryMessage(message)) return handleDeleteHistoryEntry(message);
    if (isClearHistoryMessage(message)) return handleClearHistory();
    return undefined;
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void scanTab(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    executeNavigationPlan(
      tabId,
      planTabUpdate(changeInfo.status, changeInfo.url !== undefined),
    );
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    cancelScheduledScan(tabId);
    generationByTab.delete(tabId);
  });

  browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    const inheritedGeneration = Math.max(
      generationByTab.get(removedTabId) ?? 0,
      generationByTab.get(addedTabId) ?? 0,
    );
    cancelScheduledScan(removedTabId);
    cancelScheduledScan(addedTabId);
    generationByTab.delete(removedTabId);

    const generation = inheritedGeneration + 1;
    generationByTab.set(addedTabId, generation);
    void showPending(addedTabId, generation);
    scheduleTabScan(addedTabId, 0);
  });

  browser.webNavigation.onCommitted.addListener((details) => {
    handleNavigation('committed', details.tabId, details.frameId);
  });

  browser.webNavigation.onCompleted.addListener((details) => {
    handleNavigation('completed', details.tabId, details.frameId);
  });

  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    handleNavigation('history-state-updated', details.tabId, details.frameId);
  });

  browser.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
    handleNavigation('reference-fragment-updated', details.tabId, details.frameId);
  });

  // Service-worker state is intentionally disposable. Re-scan active tabs on every wake.
  void repairHistory().catch(() => undefined);
  void scanActiveTabs();
});

async function handleDeleteHistoryEntry(
  message: DeleteHistoryEntryMessage,
): Promise<HistoryMutationResponse> {
  try {
    await deleteHistoryEntry(message.url);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error) || 'The history entry could not be deleted.',
    };
  }
}

async function handleClearHistory(): Promise<HistoryMutationResponse> {
  try {
    await clearHistory();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error) || 'History could not be cleared.',
    };
  }
}

function handleNavigation(
  kind: NavigationEventKind,
  tabId: number,
  frameId: number,
): void {
  executeNavigationPlan(tabId, planNavigation(kind, frameId));
}

function executeNavigationPlan(tabId: number, plan: NavigationPlan): void {
  if (plan.cancelScheduledScan) cancelScheduledScan(tabId);

  const generation = plan.invalidate
    ? invalidateTab(tabId)
    : generationByTab.get(tabId);
  if (plan.showPending && generation !== undefined) {
    void showPending(tabId, generation);
  }
  if (plan.scanDelayMs !== null) {
    scheduleTabScan(tabId, plan.scanDelayMs);
  }
}

async function scanActiveTab(): Promise<GetActiveTabResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    return {
      ok: false,
      error: 'no-active-tab',
      message: 'No active browser tab is available.',
    };
  }

  return { ok: true, state: await scanTab(tab.id, true) };
}

async function scanActiveTabs(): Promise<void> {
  let tabs;
  try {
    tabs = await browser.tabs.query({ active: true });
  } catch {
    return;
  }

  await Promise.allSettled(
    tabs.flatMap((tab) => tab.id === undefined ? [] : [scanTab(tab.id)]),
  );
}

async function handleContentSignal(
  message: ContentSignalMessage,
  sender: Browser.runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || (sender.frameId ?? 0) !== 0) return;

  try {
    const currentTab = await browser.tabs.get(tabId);
    if (!currentTab.url || !samePage(message.pageUrl, currentTab.url)) return;
  } catch {
    return;
  }

  await scanTab(tabId);
}

async function scanTab(tabId: number, retryOnStale = false): Promise<TabScanState> {
  cancelScheduledScan(tabId);
  const generation = nextGeneration(tabId);
  let tab;

  try {
    tab = await browser.tabs.get(tabId);
  } catch (error) {
    return withTabId(tabId, restrictedResult(
      '',
      'tab-unavailable',
      errorMessage(error) || 'The tab is no longer available.',
    ));
  }

  const pageUrl = tab.url ?? '';
  if (!isCurrentGeneration(tabId, generation)) {
    if (retryOnStale) return scanTab(tabId, false);
    return staleState(tabId, pageUrl);
  }

  if (!isInspectableUrl(pageUrl)) {
    const state = withTabId(tabId, restrictedResult(
      pageUrl,
      'restricted-url',
      'Browser extensions cannot inspect this page.',
    ));
    if (isCurrentGeneration(tabId, generation)) await applyState(state, generation);
    return state;
  }

  if (!await showPending(tabId, generation)) {
    if (retryOnStale) return scanTab(tabId, false);
    return staleState(tabId, pageUrl);
  }

  const fromOrigins = await collectFrameOrigins(tabId, pageUrl);
  if (!isCurrentGeneration(tabId, generation)) {
    if (retryOnStale) return scanTab(tabId, false);
    return staleState(tabId, pageUrl, fromOrigins);
  }

  const requestId = createRequestId(tabId, generation);
  const request: ScanPageMessage = {
    type: WEBMCP_MESSAGE.scanPage,
    requestId,
    fromOrigins,
  };

  let response: unknown;
  try {
    response = await browser.tabs.sendMessage(tabId, request, { frameId: 0 });
  } catch (error) {
    const state = withTabId(tabId, restrictedResult(
      pageUrl,
      'content-unavailable',
      errorMessage(error) || 'The page inspection script is unavailable.',
      fromOrigins,
    ));
    if (isCurrentGeneration(tabId, generation)) await applyState(state, generation);
    return state;
  }

  if (!isScanPageResponse(response, requestId)) {
    const state = withTabId(tabId, restrictedResult(
      pageUrl,
      'invalid-response',
      'The page returned an invalid WebMCP scan result.',
      fromOrigins,
    ));
    if (isCurrentGeneration(tabId, generation)) await applyState(state, generation);
    return state;
  }

  let currentUrl = '';
  let currentTitle = tab.title ?? '';
  try {
    const currentTab = await browser.tabs.get(tabId);
    currentUrl = currentTab.url ?? '';
    currentTitle = currentTab.title ?? currentTitle;
  } catch {
    // The generation and URL checks below will reject the result.
  }

  const isStale = !isCurrentGeneration(tabId, generation)
    || !samePage(response.result.pageUrl, currentUrl);
  if (isStale) {
    if (retryOnStale && currentUrl) return scanTab(tabId, false);
    return staleState(tabId, currentUrl || pageUrl, fromOrigins);
  }

  const state = withTabId(tabId, response.result);
  await applyState(state, generation, currentTitle);
  return state;
}

async function collectFrameOrigins(tabId: number, pageUrl: string): Promise<string[]> {
  const origins = new Set<string>();
  addOrigin(origins, pageUrl);

  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    for (const frame of frames ?? []) addOrigin(origins, frame.url);
  } catch {
    // The top-level origin still allows the content script's no-options fallback.
  }

  return [...origins].sort();
}

function addOrigin(origins: Set<string>, value: string): void {
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== 'null') {
      origins.add(url.origin);
    }
  } catch {
    // Ignore opaque and malformed frame URLs.
  }
}

async function applyState(
  state: TabScanState,
  generation: number,
  pageTitle = '',
): Promise<void> {
  if (!isCurrentGeneration(state.tabId, generation)) return;

  const text = state.status === 'supported' ? formatBadgeCount(state.tools.length) : '';
  const title = actionTitle(state);
  const operations: Promise<unknown>[] = [
    browser.action.setBadgeText({ tabId: state.tabId, text }),
    browser.action.setTitle({ tabId: state.tabId, title }),
  ];

  if (state.status === 'supported') {
    operations.push(browser.action.setBadgeBackgroundColor({
      tabId: state.tabId,
      color: '#171717',
    }));
  }

  if (state.status === 'supported' && state.tools.length > 0) {
    operations.push(recordSupportedPage({
      pageTitle,
      pageUrl: state.pageUrl,
      toolCount: state.tools.length,
      detectedAt: state.scannedAt,
    }, () => isCurrentGeneration(state.tabId, generation)));
  }

  await Promise.allSettled(operations);
  if (!isCurrentGeneration(state.tabId, generation)) return;

  const message: StateChangedMessage = {
    type: WEBMCP_MESSAGE.stateChanged,
    state,
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // The popup is usually closed; state broadcasts are intentionally best effort.
  }
}

async function showPending(tabId: number, generation: number): Promise<boolean> {
  if (!isCurrentGeneration(tabId, generation)) return false;

  await Promise.allSettled([
    browser.action.setBadgeText({ tabId, text: '' }),
    browser.action.setTitle({ tabId, title: 'Checking this page for WebMCP tools…' }),
  ]);
  return true;
}

function actionTitle(state: TabScanState): string {
  switch (state.status) {
    case 'supported': {
      const count = state.tools.length;
      return `WebMCP supported — ${count} ${count === 1 ? 'tool' : 'tools'}`;
    }
    case 'unsupported':
      return 'WebMCP is not supported on this page';
    case 'blocked':
      return state.reason === 'permissions-policy'
        ? 'WebMCP access is blocked by Permissions Policy'
        : 'WebMCP access is blocked by origin isolation';
    case 'restricted':
      return state.message ? `WebMCP inspection unavailable — ${state.message}` : 'WebMCP inspection unavailable';
  }
}

function restrictedResult(
  pageUrl: string,
  reason: RestrictedPageScan['reason'],
  message: string,
  fromOrigins: string[] = [],
): RestrictedPageScan {
  return {
    status: 'restricted',
    reason,
    message,
    pageUrl,
    pageOrigin: originFromUrl(pageUrl),
    scannedAt: Date.now(),
    fromOrigins,
    fallbackUsed: false,
    tools: [],
  };
}

function withTabId(tabId: number, result: PageScanResult): TabScanState {
  return { ...result, tabId };
}

function staleState(
  tabId: number,
  pageUrl: string,
  fromOrigins: string[] = [],
): TabScanState {
  return withTabId(tabId, restrictedResult(
    pageUrl,
    'stale-document',
    'The page navigated while WebMCP tools were being scanned.',
    fromOrigins,
  ));
}

function originFromUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isInspectableUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function samePage(left: string, right: string): boolean {
  return left === right;
}

function scheduleTabScan(tabId: number, delayMs: number): void {
  const existing = scheduledScansByTab.get(tabId);
  const now = Date.now();
  const schedule = coalesceScanDeadline(existing?.dueAt, now, delayMs);
  if (!schedule.replaceTimer) return;

  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const current = scheduledScansByTab.get(tabId);
    if (!current || current.timer !== timer) return;
    scheduledScansByTab.delete(tabId);
    void scanTab(tabId);
  }, Math.max(0, schedule.dueAt - now));

  scheduledScansByTab.set(tabId, { dueAt: schedule.dueAt, timer });
}

function cancelScheduledScan(tabId: number): void {
  const scheduled = scheduledScansByTab.get(tabId);
  if (!scheduled) return;
  clearTimeout(scheduled.timer);
  scheduledScansByTab.delete(tabId);
}

function invalidateTab(tabId: number): number {
  return nextGeneration(tabId);
}

function nextGeneration(tabId: number): number {
  const generation = (generationByTab.get(tabId) ?? 0) + 1;
  generationByTab.set(tabId, generation);
  return generation;
}

function isCurrentGeneration(tabId: number, generation: number): boolean {
  return generationByTab.get(tabId) === generation;
}

function createRequestId(tabId: number, generation: number): string {
  const randomPart = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${tabId}:${generation}:${randomPart}`;
}

function errorMessage(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : undefined;
}
