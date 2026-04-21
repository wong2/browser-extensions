# Browser Extensions

A monorepo for my browser extensions, built with [WXT](https://wxt.dev/), TypeScript, and Bun.

## Extensions

| Extension | Description |
|-----------|-------------|
| [hn-jump](packages/hn-jump) | Quickly jump to Hacker News discussions for the current page |
| [redirector](packages/redirector) | Redirect URLs based on custom rules |

## Development

Prerequisites: [Bun](https://bun.sh/)

```bash
# Install dependencies
bun install

# Dev mode for a specific extension
bun run dev:hn-jump
bun run dev:redirector

# Build all extensions
bun run build

# Build a specific extension
bun run build:hn-jump
bun run build:redirector
```

## Project Structure

```
packages/
├── hn-jump/       # HN Jump extension
└── redirector/    # Redirector extension
```
