import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'CF Cache Purge',
    description: 'Purge the current URL from Cloudflare cache with one click',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://api.cloudflare.com/*'],
    action: {
      default_title: 'Purge this URL from Cloudflare cache',
    },
  },
});
