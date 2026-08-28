import './style.css';
import {
  CREATE_TOKEN_URL,
  TOKEN_STORAGE_KEY,
  normalizeToken,
  verifyApiToken,
} from '@/utils/cloudflare';

const app = document.querySelector<HTMLElement>('#main-content')!;

app.innerHTML = `
  <div class="shell">
    <header>
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img">
          <path d="M18.3 10.1a6.7 6.7 0 0 0-12.9 1.6A4.4 4.4 0 0 0 6.4 20h11.4a4.9 4.9 0 0 0 .5-9.9Z" />
          <path class="brand-mark-arrow" d="M8.2 13.4a4.1 4.1 0 0 1 6.5-2.1l1-1v3.8h-3.8l1.2-1.2a2 2 0 0 0-3 1.1l-1.9-.6Zm7.6 2.1a4.1 4.1 0 0 1-6.5 2.1l-1 1v-3.8h3.8L10.9 16a2 2 0 0 0 3-1.1l1.9.6Z" />
        </svg>
      </div>
      <h1>CF Cache Purge</h1>
    </header>
    <p class="description">Purge the current URL with one click.</p>

    <form id="token-form" novalidate>
      <div class="label-row">
        <label for="api-token">API token</label>
        <a href="${CREATE_TOKEN_URL}" target="_blank" rel="noreferrer">Create token ↗</a>
      </div>
      <div class="control-row">
        <div class="input-shell" id="input-shell">
          <input id="api-token" name="api-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste Cloudflare API token" aria-describedby="token-help token-status" />
          <button class="reveal-token" id="reveal-token" type="button" aria-label="Show API token" aria-pressed="false">
            <svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>
            <svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-2.2 2.9M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4-1"/></svg>
          </button>
        </div>
        <button class="save-token" id="save-token" type="submit">Save</button>
      </div>
      <p class="field-help" id="token-help">Zone Read + Cache Purge. Stored locally.</p>
      <p class="token-status" id="token-status" role="status" aria-live="polite"></p>
    </form>
  </div>
`;

const form = document.querySelector<HTMLFormElement>('#token-form')!;
const tokenInput = document.querySelector<HTMLInputElement>('#api-token')!;
const inputShell = document.querySelector<HTMLDivElement>('#input-shell')!;
const revealButton = document.querySelector<HTMLButtonElement>('#reveal-token')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save-token')!;
const status = document.querySelector<HTMLParagraphElement>('#token-status')!;

void loadToken();

revealButton.addEventListener('click', () => {
  const reveal = tokenInput.type === 'password';
  tokenInput.type = reveal ? 'text' : 'password';
  revealButton.setAttribute('aria-pressed', String(reveal));
  revealButton.setAttribute('aria-label', reveal ? 'Hide API token' : 'Show API token');
  revealButton.classList.toggle('is-revealed', reveal);
  tokenInput.focus();
});

tokenInput.addEventListener('input', () => {
  inputShell.classList.remove('has-error');
  setStatus('', 'idle');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = normalizeToken(tokenInput.value);
  if (!token) {
    inputShell.classList.add('has-error');
    setStatus('Enter an API token.', 'error');
    tokenInput.focus();
    return;
  }

  setBusy(true);
  setStatus('Checking token and zone access…', 'loading');
  try {
    await verifyApiToken(token);
    await browser.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
    setStatus('Saved', 'success');
  } catch (error) {
    inputShell.classList.add('has-error');
    setStatus(errorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
});

async function loadToken(): Promise<void> {
  const stored = await browser.storage.local.get(TOKEN_STORAGE_KEY);
  const token = typeof stored[TOKEN_STORAGE_KEY] === 'string'
    ? stored[TOKEN_STORAGE_KEY]
    : '';
  tokenInput.value = token;
}

function setBusy(busy: boolean): void {
  tokenInput.disabled = busy;
  revealButton.disabled = busy;
  saveButton.disabled = busy;
  saveButton.textContent = busy ? 'Checking…' : 'Save';
}

function setStatus(message: string, state: 'idle' | 'loading' | 'success' | 'error'): void {
  status.textContent = message;
  status.dataset.state = state;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The token could not be verified.';
}
