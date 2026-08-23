import './style.css';
import { hostnameFromInput } from '@/utils/apex';
import { apexFromError, searchSubdomains, type Subdomain } from '@/utils/search';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <header>
      <h1>Subdomains</h1>
      <form class="row" id="form">
        <input id="query" type="text" spellcheck="false" placeholder="example.com" />
        <button type="submit" id="lookup">Lookup</button>
      </form>
    </header>
    <div class="toolbar">
      <span id="meta"></span>
      <button type="button" class="secondary" id="copy" hidden>Copy</button>
    </div>
    <div id="results"></div>
  </div>
`;

const form = document.querySelector<HTMLFormElement>('#form')!;
const input = document.querySelector<HTMLInputElement>('#query')!;
const lookupBtn = document.querySelector<HTMLButtonElement>('#lookup')!;
const copyBtn = document.querySelector<HTMLButtonElement>('#copy')!;
const meta = document.querySelector<HTMLSpanElement>('#meta')!;
const results = document.querySelector<HTMLDivElement>('#results')!;

let current: Subdomain[] = [];

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void lookup(input.value);
});

copyBtn.addEventListener('click', async () => {
  const text = current.map((item) => item.sub).join('\n');
  await navigator.clipboard.writeText(text);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => {
    copyBtn.textContent = 'Copy';
  }, 1500);
});

results.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-host]');
  if (!button?.dataset.host) return;
  void browser.tabs.create({ url: `https://${button.dataset.host}` });
});

function showStatus(message: string, kind: 'info' | 'error' = 'info') {
  current = [];
  copyBtn.hidden = true;
  meta.textContent = '';
  results.innerHTML = `<div class="status ${kind}">${escapeHtml(message)}</div>`;
}

function render(items: Subdomain[]) {
  current = items;
  copyBtn.hidden = items.length === 0;
  meta.textContent = items.length === 1 ? '1 name' : `${items.length} names`;

  if (items.length === 0) {
    results.innerHTML = `<div class="status">No subdomains in the index.</div>`;
    return;
  }

  results.innerHTML = `<div class="list">${items.map(row).join('')}</div>`;
}

function row(item: Subdomain): string {
  const date = formatDate(item.first_seen);
  return `
    <button type="button" class="item" data-host="${escapeAttr(item.sub)}">
      <span class="host">${escapeHtml(item.sub)}</span>
      ${date ? `<span class="date">${escapeHtml(date)}</span>` : ''}
    </button>
  `;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

async function lookup(raw: string) {
  const host = hostnameFromInput(raw);
  if (!host) {
    showStatus('Enter a public domain, or open a website first.');
    return;
  }

  input.value = host;
  lookupBtn.disabled = true;
  showStatus('Looking up Certificate Transparency…');

  try {
    const items = await searchWithApexHint(host);
    render(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lookup failed';
    showStatus(message, 'error');
  } finally {
    lookupBtn.disabled = false;
  }
}

async function searchWithApexHint(host: string): Promise<Subdomain[]> {
  try {
    return await searchSubdomains(host);
  } catch (error) {
    const hinted = error instanceof Error ? apexFromError(error.message) : null;
    if (hinted && hinted !== host) {
      input.value = hinted;
      return searchSubdomains(hinted);
    }
    throw error;
  }
}

async function currentTabHost(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? hostnameFromInput(tab.url) : null;
}

const initial = await currentTabHost();
if (initial) {
  input.value = initial;
  await lookup(initial);
} else {
  input.focus();
  showStatus('Enter a domain to search Certificate Transparency.');
}
