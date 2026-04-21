interface HNResult {
  hnUrl: string;
  comments: number;
}

// Cache: tab URL → HN result (null = not found)
const cache = new Map<string, HNResult | null>();

// Track in-flight searches to avoid duplicate requests
const pending = new Map<string, Promise<HNResult | null>>();

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'ref', 'fbclid', 'gclid', 'msclkid', 'dclid', '__readwiseLocation',
];

function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));
    let cleaned = u.toString();
    if (cleaned.endsWith('/') && u.pathname !== '/') {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  } catch {
    return raw;
  }
}

async function searchHN(url: string): Promise<HNResult | null> {
  const cleanedUrl = cleanUrl(url);
  const apiUrl =
    `https://hn.algolia.com/api/v1/search?` +
    `query=${encodeURIComponent('"' + cleanedUrl + '"')}&` +
    `restrictSearchableAttributes=url&` +
    `tags=story&` +
    `hitsPerPage=5`;

  const resp = await fetch(apiUrl);
  const data = await resp.json();

  if (data.hits && data.hits.length > 0) {
    const best = data.hits[0];
    return {
      hnUrl: `https://news.ycombinator.com/item?id=${best.objectID}`,
      comments: best.num_comments ?? 0,
    };
  }
  return null;
}

async function lookupAndUpdate(tabId: number, url: string) {
  if (!url.startsWith('http')) {
    await setDisabled(tabId);
    return;
  }

  const cleanedUrl = cleanUrl(url);

  if (cache.has(cleanedUrl)) {
    const result = cache.get(cleanedUrl)!;
    if (result) {
      await setFound(tabId, result);
    } else {
      await setDisabled(tabId);
    }
    return;
  }

  await setSearching(tabId);

  let promise = pending.get(cleanedUrl);
  if (!promise) {
    promise = searchHN(url);
    pending.set(cleanedUrl, promise);
  }

  try {
    const result = await promise;
    cache.set(cleanedUrl, result);
    if (result) {
      await setFound(tabId, result);
    } else {
      await setDisabled(tabId);
    }
  } catch {
    await setDisabled(tabId);
  } finally {
    pending.delete(cleanedUrl);
  }
}

// --- Badge / Icon state helpers ---

const grayIcon = {
  16: 'icon/16-gray.png',
  32: 'icon/32-gray.png',
  48: 'icon/48-gray.png',
  96: 'icon/96-gray.png',
  128: 'icon/128-gray.png',
};

const defaultIcon = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  96: 'icon/96.png',
  128: 'icon/128.png',
};

async function setSearching(tabId: number) {
  await Promise.all([
    browser.action.setBadgeText({ text: '...', tabId }),
    browser.action.setBadgeBackgroundColor({ color: '#888888', tabId }),
    browser.action.setTitle({ title: 'Searching HN...', tabId }),
    browser.action.enable(tabId),
  ]);
}

async function setFound(tabId: number, result: HNResult) {
  const text = result.comments >= 1000
    ? `${Math.floor(result.comments / 1000)}k`
    : String(result.comments);
  await Promise.all([
    browser.action.setIcon({ path: defaultIcon, tabId }),
    browser.action.setBadgeText({ text, tabId }),
    browser.action.setBadgeBackgroundColor({ color: '#FF6600', tabId }),
    browser.action.setTitle({ title: `${result.comments} comments on HN`, tabId }),
    browser.action.enable(tabId),
  ]);
}

async function setDisabled(tabId: number) {
  await Promise.all([
    browser.action.setIcon({ path: grayIcon, tabId }),
    browser.action.setBadgeText({ text: '', tabId }),
    browser.action.setTitle({ title: 'No HN discussion found', tabId }),
    browser.action.disable(tabId),
  ]);
}

// --- Event listeners ---

export default defineBackground(() => {
  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await browser.tabs.get(tabId);
    if (tab.url) {
      lookupAndUpdate(tabId, tab.url);
    }
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      lookupAndUpdate(tabId, changeInfo.url);
    } else if (changeInfo.status === 'complete' && tab.url) {
      lookupAndUpdate(tabId, tab.url);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    // No per-tab state to clean up, but keeps things tidy
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.url || !tab.id) return;
    const cleanedUrl = cleanUrl(tab.url);
    const result = cache.get(cleanedUrl);
    if (result) {
      await browser.tabs.create({ url: result.hnUrl });
    }
  });
});
