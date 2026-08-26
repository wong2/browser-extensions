import { defineConfig } from 'wxt';

export default defineConfig({
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'WebMCP Radar',
    description: 'Discover and inspect WebMCP tools as you browse',
    permissions: ['tabs', 'webNavigation', 'storage'],
    host_permissions: ['<all_urls>'],
    action: {},
  },
});
