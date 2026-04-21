import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'HN Jump',
    description: 'Quickly jump to Hacker News discussions for the current page',
    permissions: ['activeTab', 'tabs'],
    action: {},
  },
});
