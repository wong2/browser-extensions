import { parseRules, buildDNRRules, STORAGE_KEY } from '@/utils/rules';
import { redirectQueryNavigation } from '@/utils/navigation';

export default defineBackground(() => {
  const onNavigation = async (details: { tabId: number; frameId: number; url: string }) => {
    try {
      await redirectQueryNavigation(details);
    } catch (error) {
      console.warn('Redirector: query redirect failed', error);
    }
  };
  browser.webNavigation.onBeforeNavigate.addListener(onNavigation);
  // Fallback when the browser doesn't expose a pending URL before commit.
  browser.webNavigation.onCommitted.addListener(onNavigation);

  // Click extension icon to open options page
  browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
  });

  // Apply rules when storage changes
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      const value = changes[STORAGE_KEY].newValue;
      const text = typeof value === 'string' ? value : '';
      applyRules(text);
    }
  });

  // Apply rules on startup
  browser.storage.local.get(STORAGE_KEY).then((result) => {
    const value = result[STORAGE_KEY];
    const text = typeof value === 'string' ? value : '';
    applyRules(text);
  });
});

async function applyRules(text: string) {
  const parsed = parseRules(text);
  const newRules = buildDNRRules(parsed);

  // Remove all existing dynamic rules first
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules,
  });

  console.log(`Redirector: applied ${newRules.length} rules`);
}
