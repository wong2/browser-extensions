import './style.css';
import { STORAGE_KEY } from '@/utils/rules';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h1>Redirector</h1>
    <p class="description">
      Enter redirect rules, one per line, using <code>=></code> to separate source and target.<br>
      Use <code>:name</code> to match a single path segment, and <code>:name*</code> for wildcard matching.<br>
      Example: <code>npmjs.com/package/:slug* => npmx.dev/package/:slug*</code>
    </p>
    <textarea id="rules" placeholder="https://npmjs.com/package/:slug => https://npmx.dev/package/:slug"></textarea>
    <div class="actions">
      <button id="save">Save</button>
      <span class="status" id="status">Saved!</span>
    </div>
  </div>
`;

const textarea = document.querySelector<HTMLTextAreaElement>('#rules')!;
const saveBtn = document.querySelector<HTMLButtonElement>('#save')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;

// Load saved rules
browser.storage.local.get(STORAGE_KEY).then((result) => {
  textarea.value = result[STORAGE_KEY] || '';
});

saveBtn.addEventListener('click', async () => {
  await browser.storage.local.set({ [STORAGE_KEY]: textarea.value });
  status.classList.add('visible');
  setTimeout(() => status.classList.remove('visible'), 2000);
});
