# Redirector

A browser extension to redirect URLs based on custom rules. Built with [WXT](https://wxt.dev/) and TypeScript.

## Features

- Define custom URL redirect rules with a simple text format
- Support for path parameters (`:name`) and wildcards (`:name*`)
- Redirect to a URL stored in a query parameter, with automatic URL decoding
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

### Redirect to a query parameter

Use `query:parameterName` as the target:

```text
l.meta.ai => query:u
example.com/redirect => query:url
```

The first rule redirects `https://l.meta.ai/?u=https%3A%2F%2Fsources.news%2Fp%2Farticle&h=tracking`
to `https://sources.news/p/article`. Parameters can appear in any order. Values are decoded
once, preserving any encoding belonging to the destination URL itself.

The source matches the exact host and pathname (a bare host matches `/`); path parameters
and wildcards are supported. Only HTTP/HTTPS destinations are accepted. Missing, empty,
invalid, or self-referencing destinations leave navigation unchanged. Query redirects apply
only to the main tab, using navigation events; the source request may already have started.

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
- `webNavigation` - To detect navigation and redirect to query parameter destinations
- `tabs` - To check the current/pending URL so a query redirect doesn't overwrite a newer navigation
- `host_permissions: <all_urls>` - To redirect any URL (required for the extension to work universally)

## License

MIT
