# CRT

A browser extension that lists subdomains for the current site from [crt.name](https://crt.name/) Certificate Transparency logs.

## Development

This extension is built with [WXT](https://wxt.dev/) and TypeScript.

```bash
# Install dependencies
bun install

# Start dev server (Chrome)
bun run dev

# Start dev server (Firefox)
bun run dev:firefox

# Build for Chrome
bun run build

# Build for Firefox
bun run build:firefox

# Package for distribution
bun run zip
bun run zip:firefox
```

## Permissions

- `activeTab` — to read the URL of the current tab
- `host_permissions: https://crt.name/*` — to query the subdomain index
