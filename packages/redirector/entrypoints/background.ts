import { parseRules, buildDNRRules, STORAGE_KEY } from '@/utils/rules';

export default defineBackground(() => {
  // Click extension icon to open options page
  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
  });

  // Apply rules when storage changes
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      const text = changes[STORAGE_KEY].newValue || '';
      applyRules(text);
    }
  });

  // Apply rules on startup
  browser.storage.local.get(STORAGE_KEY).then((result) => {
    const text = result[STORAGE_KEY] || '';
    applyRules(text);
  });
});

async function applyRules(text: string) {
  const parsed = parseRules(text);
  const newRules = buildDNRRules(parsed);

  // Remove all existing dynamic rules first
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules,
  });

  console.log(`Redirector: applied ${newRules.length} rules`);
}
