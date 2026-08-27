# WebMCP Radar

A focused browser extension that detects WebMCP on the active page, shows a toolbar badge when accessible tools are present, exposes each tool's metadata in the popup, and keeps a local history of page titles and URLs where tools were detected.

## What it shows

- A live badge with the accessible tool count when at least one tool is available; zero-tool pages leave the badge empty
- Tool name, optional title, description, origin, annotations, and formatted input schema
- Separate states for an unavailable API, a page blocked by WebMCP security policy, and a browser page that extensions cannot inspect
- A direct WebMCP testing-flag shortcut when Chrome does not expose the API on the current page
- Dynamic updates after `toolchange`, navigation, and tab activation
- A searchable history of the most recently detected WebMCP page titles and URLs, available from the popup

The count follows `document.modelContext.getTools()` semantics. It includes tools accessible to the top-level page from eligible descendant frames; it does not execute any tool.

## History

Whenever a page exposes at least one accessible WebMCP tool, the extension records its title, URL, origin, first and most recent detection times, and latest positive tool count. Supported pages with zero tools remain visible in the popup but show no badge and are not added to history. Fragments and embedded URL credentials are removed, records are deduplicated by URL, and the newest 200 entries are kept locally. Tool descriptions and schemas are never stored in history.

Open **History** from the popup to search, reopen, remove, or clear recorded pages.

## Requirements

WebMCP is experimental. For local development, use a compatible Chrome build, enable `chrome://flags/#enable-webmcp-testing`, and relaunch the browser. Pages also need a secure, origin-isolated context and permission to use the `tools` Permissions Policy feature.

## Development

```bash
bun install
bun run dev
bun run test
bun run compile
bun run build
```

The development command builds and watches the extension without opening WXT's temporary Chrome profile. In your own Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3-dev`. You only need to load it once; keep `bun run dev` running while you work.

For a production build, load `.output/chrome-mv3` instead.

## Permissions

- `tabs` — track active tabs and clear stale state on navigation
- `webNavigation` — collect descendant-frame origins for WebMCP's explicit cross-origin discovery option
- `storage` — keep the local supported-page history
- `<all_urls>` — run the passive detector on ordinary pages before the user opens the popup

No inspected metadata leaves the browser, and the extension never invokes a page tool.

## References

- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
