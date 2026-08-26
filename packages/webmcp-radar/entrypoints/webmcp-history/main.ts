import './style.css';
import {
  HISTORY_STORAGE_KEY,
  readHistory,
  type HistoryEntry,
} from '@/utils/history';
import {
  WEBMCP_MESSAGE,
  type HistoryMutationResponse,
} from '@/utils/protocol';

type PreparedEntry = {
  entry: HistoryEntry;
  title: string;
  url: string;
  toolCount: number;
};

const app = requiredElement<HTMLDivElement>('#app');

app.innerHTML = `
  <main class="history-shell">
    <header class="masthead">
      <div class="masthead-copy">
        <h1>WebMCP history</h1>
        <p>WebMCP pages you’ve encountered while browsing.</p>
      </div>
    </header>

    <section class="ledger-toolbar" aria-label="Filter history">
      <div class="search-control" role="search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.75"></circle><path d="m12 12 4 4"></path></svg>
        <label class="visually-hidden" for="history-search">Search title or URL</label>
        <input id="history-search" type="search" inputmode="search" autocomplete="off" placeholder="Search title or URL" disabled />
        <button class="search-clear" id="search-clear" type="button" aria-label="Clear search" hidden>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"></path></svg>
        </button>
      </div>
      <p class="record-count" id="record-count" role="status" aria-live="polite" aria-atomic="true">Loading…</p>
    </section>

    <p class="visually-hidden" id="mutation-status" role="status" aria-live="polite" aria-atomic="true"></p>

    <section class="ledger-region" aria-label="Detected WebMCP pages">
      <div class="loading-ledger" id="loading-ledger" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="history-list" id="history-list" role="list" hidden></div>
      <div class="ledger-message" id="ledger-message" hidden></div>
    </section>

    <footer class="history-footer" aria-label="History data and actions">
      <p class="data-note">Data stays on this device.</p>
      <button class="quiet-action quiet-action--danger" id="clear-request" type="button" disabled>
        Clear history
      </button>
      <div class="clear-confirm" id="clear-confirm" role="group" aria-label="Confirm clear history" hidden>
        <span>Delete every local record?</span>
        <button class="quiet-action" id="clear-cancel" type="button">Cancel</button>
        <button class="danger-action" id="clear-all" type="button">Clear all</button>
      </div>
    </footer>
  </main>
`;

const historySearch = requiredElement<HTMLInputElement>('#history-search');
const searchClear = requiredElement<HTMLButtonElement>('#search-clear');
const recordCount = requiredElement<HTMLElement>('#record-count');
const mutationStatus = requiredElement<HTMLElement>('#mutation-status');
const loadingLedger = requiredElement<HTMLElement>('#loading-ledger');
const historyList = requiredElement<HTMLElement>('#history-list');
const ledgerMessage = requiredElement<HTMLElement>('#ledger-message');
const clearRequest = requiredElement<HTMLButtonElement>('#clear-request');
const clearConfirm = requiredElement<HTMLElement>('#clear-confirm');
const clearCancel = requiredElement<HTMLButtonElement>('#clear-cancel');
const clearAll = requiredElement<HTMLButtonElement>('#clear-all');

const entryByKey = new Map<string, PreparedEntry>();
let entries: PreparedEntry[] = [];
let loadSequence = 0;

historySearch.addEventListener('input', () => {
  searchClear.hidden = historySearch.value.length === 0;
  renderLedger();
});

searchClear.addEventListener('click', () => {
  historySearch.value = '';
  searchClear.hidden = true;
  renderLedger();
  historySearch.focus();
});

clearRequest.addEventListener('click', () => {
  clearRequest.hidden = true;
  clearConfirm.hidden = false;
  clearAll.focus();
});

clearCancel.addEventListener('click', () => closeClearConfirmation(true));

clearAll.addEventListener('click', () => {
  void clearAllHistory();
});

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const retry = target.closest<HTMLButtonElement>('[data-action="retry"]');
  if (retry) {
    void loadHistory();
    return;
  }

  const button = target.closest<HTMLButtonElement>('[data-entry-key]');
  const key = button?.dataset.entryKey;
  const prepared = key ? entryByKey.get(key) : undefined;
  if (!button || !prepared) return;

  if (button.dataset.action === 'delete') {
    void deleteEntry(prepared, button);
  }
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest('.row-menu')) return;
  closeRowMenus();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = historyList.querySelector<HTMLDetailsElement>('.row-menu[open]');
  if (!menu) return;
  event.preventDefault();
  menu.open = false;
  menu.querySelector<HTMLElement>('summary')?.focus();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !Object.prototype.hasOwnProperty.call(changes, HISTORY_STORAGE_KEY)) return;
  void loadHistory(false);
});

void loadHistory();

async function loadHistory(showLoading = true): Promise<void> {
  const sequence = ++loadSequence;
  if (showLoading) renderLoading();

  try {
    const storedEntries = await readHistory();
    if (sequence !== loadSequence) return;

    entries = storedEntries
      .map(prepareEntry)
      .filter((entry): entry is PreparedEntry => entry !== null)
      .sort((left, right) => right.entry.lastDetectedAt - left.entry.lastDetectedAt);

    app.setAttribute('aria-busy', 'false');
    historySearch.disabled = false;
    clearRequest.disabled = entries.length === 0;
    loadingLedger.hidden = true;
    closeClearConfirmation(false);
    renderLedger();
  } catch (error) {
    if (sequence !== loadSequence) return;
    renderError(error instanceof Error ? error.message : 'The local history could not be read.');
  }
}

function renderLoading(): void {
  app.setAttribute('aria-busy', 'true');
  historySearch.disabled = true;
  clearRequest.disabled = true;
  historyList.hidden = true;
  ledgerMessage.hidden = true;
  loadingLedger.hidden = false;
  recordCount.textContent = 'Loading…';
}

function renderLedger(): void {
  const query = historySearch.value.trim().toLocaleLowerCase();
  const visibleEntries = query.length === 0
    ? entries
    : entries.filter(({ title, url }) => `${title} ${url}`.toLocaleLowerCase().includes(query));

  entryByKey.clear();
  historyList.replaceChildren();
  loadingLedger.hidden = true;

  if (entries.length === 0) {
    recordCount.textContent = '0 pages';
    showMessage('No pages yet', 'Pages appear after Radar finds at least one WebMCP tool.');
    return;
  }

  if (visibleEntries.length === 0) {
    recordCount.textContent = `0 of ${formatCount(entries.length)} ${entries.length === 1 ? 'page' : 'pages'}`;
    showMessage('No matches', 'Try another title or URL.');
    return;
  }

  recordCount.textContent = query
    ? `${formatCount(visibleEntries.length)} of ${formatCount(entries.length)} ${entries.length === 1 ? 'page' : 'pages'}`
    : `${formatCount(entries.length)} ${entries.length === 1 ? 'page' : 'pages'}`;

  ledgerMessage.hidden = true;
  historyList.hidden = false;
  visibleEntries.forEach((entry, index) => {
    const key = String(index);
    entryByKey.set(key, entry);
    historyList.append(createHistoryRow(entry, key));
  });
}

function createHistoryRow(prepared: PreparedEntry, key: string): HTMLElement {
  const row = document.createElement('article');
  row.className = 'history-row';
  row.setAttribute('role', 'listitem');

  const identity = document.createElement('a');
  identity.className = 'page-link';
  identity.href = prepared.url;
  identity.target = '_blank';
  identity.rel = 'noopener noreferrer';
  const title = document.createElement('strong');
  title.textContent = prepared.title;
  title.title = prepared.title;
  title.dir = 'auto';
  const url = document.createElement('code');
  url.textContent = prepared.url;
  url.title = prepared.url;
  url.dir = 'ltr';

  const toolCount = document.createElement('span');
  toolCount.className = 'tool-count';
  const value = document.createElement('strong');
  value.textContent = String(prepared.toolCount);
  const unit = document.createElement('span');
  unit.textContent = prepared.toolCount === 1 ? 'tool' : 'tools';
  toolCount.append(value, unit);

  const metadata = document.createElement('span');
  metadata.className = 'page-meta';
  metadata.append(url, toolCount);
  identity.append(title, metadata);

  const aside = document.createElement('div');
  aside.className = 'row-aside';
  const targetLabel = `${prepared.title}, ${prepared.url}`;
  const menu = createRowMenu(key, targetLabel);
  aside.append(menu);

  row.append(identity, aside);
  return row;
}

function createRowMenu(key: string, targetLabel: string): HTMLDetailsElement {
  const menu = document.createElement('details');
  menu.className = 'row-menu';

  const trigger = document.createElement('summary');
  trigger.setAttribute('aria-label', `More actions for ${targetLabel}`);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="5" r="1.25"></circle>
      <circle cx="10" cy="10" r="1.25"></circle>
      <circle cx="10" cy="15" r="1.25"></circle>
    </svg>
  `;

  const popover = document.createElement('div');
  popover.className = 'row-menu-popover';
  popover.setAttribute('role', 'menu');

  const remove = document.createElement('button');
  remove.className = 'row-menu-item';
  remove.type = 'button';
  remove.dataset.action = 'delete';
  remove.dataset.entryKey = key;
  remove.setAttribute('role', 'menuitem');
  remove.setAttribute('aria-label', `Delete ${targetLabel} from history`);
  remove.textContent = 'Delete';
  popover.append(remove);
  menu.append(trigger, popover);

  menu.addEventListener('toggle', () => {
    trigger.setAttribute('aria-expanded', String(menu.open));
    if (menu.open) closeRowMenus(menu);
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && menu.open) {
      event.preventDefault();
      remove.focus();
    }
    if (event.key === 'ArrowUp' && document.activeElement === remove) {
      event.preventDefault();
      trigger.focus();
    }
  });

  return menu;
}

function closeRowMenus(except?: HTMLDetailsElement): void {
  historyList.querySelectorAll<HTMLDetailsElement>('.row-menu[open]').forEach((menu) => {
    if (menu !== except) menu.open = false;
  });
}

function showMessage(titleText: string, descriptionText: string): void {
  historyList.hidden = true;
  ledgerMessage.replaceChildren();
  ledgerMessage.className = 'ledger-message';

  const title = document.createElement('h2');
  title.textContent = titleText;
  const description = document.createElement('p');
  description.textContent = descriptionText;
  ledgerMessage.append(title, description);
  ledgerMessage.hidden = false;
}

function renderError(message: string): void {
  app.setAttribute('aria-busy', 'false');
  historySearch.disabled = true;
  clearRequest.disabled = true;
  loadingLedger.hidden = true;
  historyList.hidden = true;
  recordCount.textContent = 'Unavailable';
  ledgerMessage.replaceChildren();
  ledgerMessage.className = 'ledger-message ledger-message--error';

  const title = document.createElement('h2');
  title.textContent = 'Local history could not be read';
  const description = document.createElement('p');
  description.textContent = message;
  const retry = document.createElement('button');
  retry.className = 'primary-action';
  retry.type = 'button';
  retry.dataset.action = 'retry';
  retry.textContent = 'Try again';
  ledgerMessage.append(title, description, retry);
  ledgerMessage.hidden = false;
}

async function deleteEntry(prepared: PreparedEntry, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    const response = await browser.runtime.sendMessage({
      type: WEBMCP_MESSAGE.deleteHistoryEntry,
      url: prepared.url,
    }) as HistoryMutationResponse;
    if (!response.ok) throw new Error(response.message);
    await loadHistory(false);
    historySearch.focus();
    mutationStatus.textContent = `Deleted ${prepared.title} from history. ${formatCount(entries.length)} ${entries.length === 1 ? 'page remains' : 'pages remain'}.`;
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'The record could not be deleted.');
  }
}

async function clearAllHistory(): Promise<void> {
  clearAll.disabled = true;
  clearCancel.disabled = true;
  try {
    const response = await browser.runtime.sendMessage({
      type: WEBMCP_MESSAGE.clearHistory,
    }) as HistoryMutationResponse;
    if (!response.ok) throw new Error(response.message);
    historySearch.value = '';
    searchClear.hidden = true;
    await loadHistory(false);
    historySearch.focus();
    mutationStatus.textContent = 'History cleared. 0 pages remain.';
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'The local history could not be cleared.');
  } finally {
    clearAll.disabled = false;
    clearCancel.disabled = false;
  }
}

function closeClearConfirmation(restoreFocus: boolean): void {
  clearConfirm.hidden = true;
  clearRequest.hidden = false;
  if (restoreFocus) clearRequest.focus();
}

function prepareEntry(entry: HistoryEntry): PreparedEntry | null {
  const url = sanitizeWebUrl(entry.url);
  if (!url) return null;

  return {
    entry,
    title: entry.title || url.host,
    url: url.href,
    toolCount: Math.max(0, Math.trunc(Number.isFinite(entry.toolCount) ? entry.toolCount : 0)),
  };
}

function sanitizeWebUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing history element: ${selector}`);
  return element;
}
