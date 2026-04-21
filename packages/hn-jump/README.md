# HN Jump

A browser extension that instantly takes you to the Hacker News discussion for the page you're currently viewing.

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
- `tabs` — to listen for tab changes and open the HN discussion
