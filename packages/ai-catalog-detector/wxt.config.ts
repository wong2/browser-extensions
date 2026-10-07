import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'AI Catalog',
    description: 'Discover the AI Catalog advertised by the current website.',
    permissions: ['tabs', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'AI Catalog',
    },
  },
});
