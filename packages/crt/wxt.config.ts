import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'CRT',
    description: 'List subdomains from Certificate Transparency logs',
    permissions: ['activeTab'],
    host_permissions: ['https://crt.name/*'],
  },
});
