import './style.css';
import {
  WEBMCP_MESSAGE,
  isStateChangedMessage,
  type GetActiveTabResponse,
  type JsonValue,
  type TabScanState,
  type ToolInfo,
} from '@/utils/protocol';

const DOCS_URL = 'https://developer.chrome.com/docs/ai/webmcp';
const WEBMCP_FLAG_URL = 'chrome://flags/#enable-webmcp-testing';

const app = requiredElement<HTMLDivElement>('#app');

app.innerHTML = `
  <main class="popup-shell">
    <header class="masthead">
      <div class="brand-lockup">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="currentColor"></rect>
          <path class="radar-stroke" d="M16 7.5A8.5 8.5 0 1 0 24.5 16"></path>
          <path class="radar-stroke" d="M16 16 22 10"></path>
          <polygon class="radar-fill" points="11,12 14,12 14,15 11,15"></polygon>
        </svg>
        <div class="brand-copy">
          <h1>WebMCP Radar</h1>
          <p id="page-label">Current page</p>
        </div>
      </div>
      <button class="icon-button" id="refresh" type="button" aria-label="Refresh tools" title="Refresh tools">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path>
          <path d="M21 3v5h-5"></path>
        </svg>
      </button>
    </header>
    <section class="signal-panel signal-panel--loading" id="signal" role="status" aria-live="polite" aria-atomic="true">
      <span class="signal-dot" aria-hidden="true"></span>
      <div class="signal-message">
        <strong id="signal-title">Scanning…</strong>
        <span id="signal-detail" hidden></span>
      </div>
      <div class="signal-count" hidden>
        <span id="tool-count">—</span>
        <small id="tool-count-label">tools</small>
      </div>
    </section>
    <section class="tool-viewport" id="content" aria-label="WebMCP tool inventory">
      <div class="loading-lines" aria-hidden="true"><span></span><span></span></div>
    </section>
    <footer class="popup-footer">
      <button class="text-link" type="button" data-action="history">History</button>
    </footer>
  </main>
`;

const pageLabel = requiredElement<HTMLElement>('#page-label');
const refreshButton = requiredElement<HTMLButtonElement>('#refresh');
const signal = requiredElement<HTMLElement>('#signal');
const signalTitle = requiredElement<HTMLElement>('#signal-title');
const signalDetail = requiredElement<HTMLElement>('#signal-detail');
const signalCount = requiredElement<HTMLElement>('.signal-count');
const toolCount = requiredElement<HTMLElement>('#tool-count');
const toolCountLabel = requiredElement<HTMLElement>('#tool-count-label');
const content = requiredElement<HTMLElement>('#content');

let activeTabId: number | undefined;
let scanSequence = 0;
const schemaByToolKey = new Map<string, string>();

refreshButton.addEventListener('click', () => void refresh());

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;

  if (action === 'docs') {
    void browser.tabs.create({ url: DOCS_URL });
    return;
  }

  if (action === 'flags') {
    const button = target.closest<HTMLButtonElement>('button[data-action="flags"]');
    if (button) void openWebMcpFlag(button);
    return;
  }

  if (action === 'history') {
    void browser.tabs.create({ url: browser.runtime.getURL('/webmcp-history.html') });
    return;
  }

  if (action === 'retry') {
    void refresh();
    return;
  }

  const copyButton = target.closest<HTMLButtonElement>('[data-copy-schema]');
  const key = copyButton?.dataset.copySchema;
  const schema = key ? schemaByToolKey.get(key) : undefined;
  if (!copyButton || schema === undefined) return;

  void navigator.clipboard.writeText(schema).then(() => {
    const previous = copyButton.textContent;
    copyButton.textContent = 'Copied';
    copyButton.disabled = true;
    window.setTimeout(() => {
      copyButton.textContent = previous;
      copyButton.disabled = false;
    }, 1200);
  });
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isStateChangedMessage(message)) return;
  if (activeTabId !== undefined && message.state.tabId !== activeTabId) return;
  activeTabId = message.state.tabId;
  renderState(message.state);
});

void refresh();

async function refresh(): Promise<void> {
  const sequence = ++scanSequence;
  renderLoading();

  try {
    const response = await browser.runtime.sendMessage({
      type: WEBMCP_MESSAGE.getActiveTab,
    }) as GetActiveTabResponse;

    if (sequence !== scanSequence) return;
    if (!response.ok) {
      renderStandaloneFailure(response.message);
      return;
    }

    activeTabId = response.state.tabId;
    renderState(response.state);
  } catch (error) {
    if (sequence !== scanSequence) return;
    renderStandaloneFailure(error instanceof Error ? error.message : 'The extension could not scan this tab.');
  }
}

function renderLoading(): void {
  app.setAttribute('aria-busy', 'true');
  refreshButton.disabled = true;
  refreshButton.classList.add('is-refreshing');
  setSignal('loading', 'Scanning…', '', null);
  content.replaceChildren(createLoadingLines());
}

function renderState(state: TabScanState): void {
  app.setAttribute('aria-busy', 'false');
  refreshButton.disabled = false;
  refreshButton.classList.remove('is-refreshing');
  pageLabel.textContent = compactPageUrl(state.pageUrl);
  schemaByToolKey.clear();

  switch (state.status) {
    case 'supported':
      renderSupported(state);
      return;
    case 'unsupported':
      setSignal('empty', 'WebMCP unavailable', '', null);
      renderMessage({
        description: 'WebMCP isn’t available in this browser. Enable Chrome’s WebMCP testing flag, then relaunch Chrome.',
        flags: true,
        docs: true,
      });
      return;
    case 'blocked': {
      const policyBlocked = state.reason === 'permissions-policy';
      setSignal(
        'warning',
        policyBlocked ? 'Blocked by page policy' : 'Origin isolation required',
        '',
        null,
      );
      renderMessage({
        description: policyBlocked
          ? 'The site must allow the tools Permissions Policy before Radar can read registered tools.'
          : 'WebMCP requires an origin-isolated document. document.domain and Origin-Agent-Cluster opt-out disable it.',
        docs: true,
      });
      return;
    }
    case 'restricted':
      renderRestricted(state);
  }
}

function renderSupported(state: TabScanState): void {
  const count = state.tools.length;
  const noun = count === 1 ? 'tool' : 'tools';
  const detail = state.fallbackUsed ? 'Same-origin tools only' : '';

  setSignal(count === 0 ? 'empty' : 'supported', 'WebMCP available', detail, String(count), noun);

  if (count === 0) {
    renderMessage({
      description: 'No tools are registered. This list updates automatically.',
    });
    return;
  }

  const list = document.createElement('div');
  list.className = 'tool-list';
  list.setAttribute('role', 'list');
  for (const tool of state.tools) list.append(renderTool(tool));
  content.replaceChildren(list);
}

function renderRestricted(state: Extract<TabScanState, { status: 'restricted' }>): void {
  const restrictedUrl = state.reason === 'restricted-url';
  const stale = state.reason === 'stale-document';
  const missingAccess = state.reason === 'content-unavailable';

  const title = restrictedUrl
    ? 'Protected browser page'
    : stale
      ? 'The page changed during the scan'
      : missingAccess
        ? 'Page access is unavailable'
        : 'Inspection could not finish';

  const description = restrictedUrl
    ? 'Chrome internal pages, extension pages, and other protected URLs cannot be inspected.'
    : stale
      ? 'The active tab navigated before its tool list was ready. Retry on the current page.'
      : missingAccess
        ? 'Reload the page after installing the extension, or allow this extension to read the site, then retry.'
        : state.message || 'The page did not return a valid WebMCP scan result.';

  setSignal('error', title, '', null);
  renderMessage({
    description,
    retry: !restrictedUrl,
  });
}

function renderStandaloneFailure(message: string): void {
  app.setAttribute('aria-busy', 'false');
  refreshButton.disabled = false;
  refreshButton.classList.remove('is-refreshing');
  setSignal('error', 'Radar unavailable', '', null);
  renderMessage({
    description: message,
    retry: true,
  });
}

function renderTool(tool: ToolInfo): HTMLElement {
  const listItem = document.createElement('div');
  listItem.setAttribute('role', 'listitem');
  const details = document.createElement('details');
  details.className = 'tool-row';

  const summary = document.createElement('summary');
  const identity = document.createElement('span');
  identity.className = 'tool-identity';

  const titleLine = document.createElement('span');
  titleLine.className = 'tool-title-line';
  const name = document.createElement('code');
  name.className = 'tool-name';
  name.textContent = tool.name;
  titleLine.append(name);

  if (tool.title && tool.title !== tool.name) {
    const title = document.createElement('span');
    title.className = 'tool-title';
    title.textContent = tool.title;
    titleLine.append(title);
  }

  identity.append(titleLine);
  if (tool.description) {
    const description = document.createElement('span');
    description.className = 'tool-description';
    description.textContent = tool.description;
    identity.append(description);
  }

  summary.append(identity);

  const body = document.createElement('div');
  body.className = 'tool-body';
  const metadata = document.createElement('dl');
  metadata.className = 'metadata';
  metadata.append(metadataRow('Origin', tool.origin, true));
  const hints = [
    tool.annotations?.readOnlyHint ? 'Read only' : '',
    tool.annotations?.untrustedContentHint ? 'Untrusted content' : '',
  ].filter(Boolean);
  if (hints.length > 0) metadata.append(metadataRow('Hints', hints.join(' · ')));

  const schemaText = formatSchema(tool.inputSchema);
  schemaByToolKey.set(tool.key, schemaText);
  const schemaBlock = document.createElement('section');
  schemaBlock.className = 'schema-block';
  const schemaHeading = document.createElement('div');
  schemaHeading.className = 'schema-heading';
  const heading = document.createElement('h2');
  heading.textContent = 'Input schema';
  const copy = document.createElement('button');
  copy.className = 'copy-button';
  copy.type = 'button';
  copy.dataset.copySchema = tool.key;
  copy.textContent = 'Copy JSON';
  copy.setAttribute('aria-label', `Copy input schema for ${tool.name}`);
  const pre = document.createElement('pre');
  pre.className = 'schema-code';
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', `Input schema for ${tool.name}`);
  pre.textContent = schemaText;
  schemaHeading.append(heading, copy);
  schemaBlock.append(schemaHeading, pre);
  body.append(metadata, schemaBlock);
  details.append(summary, body);
  listItem.append(details);
  return listItem;
}

function metadataRow(label: string, value: string, code = false): HTMLElement {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  const content = code ? document.createElement('code') : document.createElement('span');
  content.textContent = value;
  description.append(content);
  row.append(term, description);
  return row;
}

function renderMessage(options: {
  description: string;
  retry?: boolean;
  flags?: boolean;
  docs?: boolean;
}): void {
  const message = document.createElement('div');
  message.className = 'state-message';
  const description = document.createElement('p');
  description.textContent = options.description;
  message.append(description);

  if (options.retry || options.flags || options.docs) {
    const actions = document.createElement('div');
    actions.className = 'state-actions';
    if (options.flags) {
      const flags = document.createElement('button');
      flags.className = 'primary-action';
      flags.type = 'button';
      flags.dataset.action = 'flags';
      flags.textContent = 'Enable WebMCP flag';
      actions.append(flags);
    }
    if (options.retry) {
      const retry = document.createElement('button');
      retry.className = 'primary-action';
      retry.type = 'button';
      retry.dataset.action = 'retry';
      retry.textContent = 'Scan again';
      actions.append(retry);
    }
    if (options.docs) {
      const docs = document.createElement('button');
      docs.className = 'text-link';
      docs.type = 'button';
      docs.dataset.action = 'docs';
      docs.textContent = 'Setup guide';
      actions.append(docs);
    }
    message.append(actions);
  }

  content.replaceChildren(message);
}

async function openWebMcpFlag(button: HTMLButtonElement): Promise<void> {
  const originalLabel = button.textContent;
  button.disabled = true;

  try {
    await browser.tabs.create({ url: WEBMCP_FLAG_URL });
    button.disabled = false;
    return;
  } catch {
    try {
      await navigator.clipboard.writeText(WEBMCP_FLAG_URL);
      button.textContent = 'Flag address copied';
    } catch {
      button.textContent = 'Couldn’t open flag';
    }
  }

  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.textContent = originalLabel;
    button.disabled = false;
  }, 1600);
}

function setSignal(
  tone: 'loading' | 'supported' | 'empty' | 'warning' | 'error',
  title: string,
  detail: string,
  count: string | null,
  countLabel = 'tools',
): void {
  signal.className = `signal-panel${tone === 'supported' ? '' : ` signal-panel--${tone}`}`;
  signalTitle.textContent = title;
  signalDetail.textContent = detail;
  signalDetail.hidden = detail.length === 0;
  signalCount.hidden = count === null;
  toolCount.textContent = count ?? '';
  toolCountLabel.textContent = count === null ? '' : countLabel;
}

function createLoadingLines(): HTMLElement {
  const loading = document.createElement('div');
  loading.className = 'loading-lines';
  loading.setAttribute('aria-hidden', 'true');
  loading.append(document.createElement('span'), document.createElement('span'));
  return loading;
}

function formatSchema(schema: JsonValue | undefined): string {
  if (schema === undefined) return 'No input schema provided.';
  if (typeof schema === 'string') return schema;
  return JSON.stringify(schema, null, 2);
}

function compactPageUrl(value: string): string {
  if (!value) return 'Current page';
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const path = url.pathname === '/' ? '' : url.pathname;
      return truncate(`${url.host}${path}`, 46);
    }
    return truncate(value, 46);
  } catch {
    return truncate(value, 46);
  }
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing popup element: ${selector}`);
  return element;
}
