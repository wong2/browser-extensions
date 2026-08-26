# Browser Extensions

A monorepo for my browser extensions, built with [WXT](https://wxt.dev/), TypeScript, and Bun.

## Extensions

| Extension | Description |
|-----------|-------------|
| [hn-jump](packages/hn-jump) | Quickly jump to Hacker News discussions for the current page |
| [redirector](packages/redirector) | Redirect URLs based on custom rules |
| [crt](packages/crt) | List subdomains from Certificate Transparency logs |
| [webmcp-radar](packages/webmcp-radar) | Discover WebMCP tools as you browse and keep a local detection history |

## Development

Prerequisites: [Bun](https://bun.sh/)

```bash
# Install dependencies
bun install

# Dev mode for a specific extension
bun run dev:hn-jump
bun run dev:redirector
bun run dev:crt
bun run dev:webmcp-radar

# Build all extensions
bun run build

# Build a specific extension
bun run build:hn-jump
bun run build:redirector
bun run build:crt
bun run build:webmcp-radar
```

## Project Structure

```
packages/
├── hn-jump/       # HN Jump extension
├── redirector/    # Redirector extension
├── crt/           # CRT subdomain lookup
└── webmcp-radar/  # WebMCP tool radar and local discovery history
```
