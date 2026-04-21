# Redirector

A browser extension to redirect URLs based on custom rules. Built with [WXT](https://wxt.dev/) and TypeScript.

## Features

- Define custom URL redirect rules with a simple text format
- Support for path parameters (`:name`) and wildcards (`:name*`)
- Uses Chrome's Declarative Net Request API for efficient redirects
- Works with both Chrome and Firefox

## Rule Format

Rules are defined one per line, using `=>` to separate source and target URLs:

```
source-url => target-url
```

### Examples

```
# Simple redirect
npmjs.com => npmx.dev

# With path parameter (matches single segment)
npmjs.com/package/:slug => npmx.dev/package/:slug

# With wildcard (matches multiple segments)
npmjs.com/package/:slug* => npmx.dev/package/:slug*

# Protocol-specific
https://old.com => https://new.com

# Protocol-preserving redirect
example.com => newdomain.com
```

### Parameter Types

| Pattern | Matches | Example |
|---------|---------|---------|
| `:name` | Single path segment | `/package/:slug` matches `/package/react` |
| `:name*` | Multiple path segments | `/docs/:path*` matches `/docs/api/core` |

## Development

```bash
# Install dependencies
npm install

# Development mode (Chrome)
npm run dev

# Development mode (Firefox)
npm run dev:firefox

# Build for production
npm run build

# Build for Firefox
npm run build:firefox

# Create zip for distribution
npm run zip
```

## Installation

### Chrome / Edge

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3-dev` folder (or `.output/chrome-mv3-prod` for production)

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` from `.output/firefox-mv2-dev` folder

## Usage

1. Click the extension icon to open the options page
2. Enter your redirect rules in the text area
3. Click "Save" to apply the rules

## Permissions

- `storage` - To save redirect rules
- `declarativeNetRequest` - To perform redirects efficiently
- `host_permissions: <all_urls>` - To redirect any URL (required for the extension to work universally)

## License

MIT
