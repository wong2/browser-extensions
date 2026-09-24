import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Redirector',
    description: 'Redirect URLs based on custom rules',
    permissions: ['storage', 'declarativeNetRequest', 'webNavigation', 'tabs'],
    host_permissions: ['*://*/*'],
    action: {},
  },
});
