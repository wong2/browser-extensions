# AI Catalog

Discovers the AI Catalog advertised by the active website at `/.well-known/ai-catalog.json`. The popup lists every catalog entry. MCP Server Cards are fetched and shown with their identity, version, and transport endpoints. Other artifact types are listed from the catalog entry itself — name, type, and link — until those formats get their own detail views.

The toolbar badge shows how many entries the catalog contains. Discovery metadata is public: the extension does not connect to MCP, call tools, collect credentials, or inspect page content. Secret header values on Server Cards are dropped before anything is shown or cached.

Discovery follows the merged [SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) extension in [experimental-ext-server-card](https://github.com/modelcontextprotocol/experimental-ext-server-card).

## Development

```bash
bun install
bun run dev
bun run test
bun run compile
bun run build
```

From the repository root:

```bash
bun run dev:ai-catalog-detector
```

`bun run dev` watches the extension without opening a temporary Chrome profile. Load `.output/chrome-mv3-dev` once from `chrome://extensions`.

## Permissions

- `tabs` — read the active tab URL when the tab changes, before the popup opens
- `storage` — cache discovery responses using `Cache-Control` and `ETag`
- `http://*/*` and `https://*/*` — fetch an origin's AI Catalog and the MCP Server Card URLs it advertises, including cards hosted on another domain
