# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

WXT browser extension, TypeScript, native DOM/CSS, and Bun, following the existing monorepo conventions.

## Users

People inspecting the page they are currently browsing, especially web developers evaluating experimental WebMCP integrations.

## Product Purpose

Detect whether the active page exposes the WebMCP API, keep the toolbar badge synchronized with the number of tools the page makes accessible, show registered tool metadata in a compact popup, and retain a local history of page titles and URLs where tools were detected for later reference.

Success means the badge and popup agree after navigation and dynamic tool registration or removal, while clearly distinguishing an unavailable API from a supported page with zero tools. Every URL exposing at least one accessible tool should also become findable by title or URL in history without retaining tool schemas or sending browsing data elsewhere; zero-tool pages stay out of history.

## Positioning

This is a passive, glanceable WebMCP inventory rather than an agent or tool executor: the toolbar answers “how many?”, the popup answers “which ones?”, and history answers “where have I seen WebMCP?” without invoking page functionality.

## Operating Context

The extension runs while the user browses normal web pages. The popup reports tools accessible from the top-level page, including eligible descendant frames. A separate history surface lists page titles and URLs that exposed at least one tool, with the latest positive tool count. Tool names, descriptions, origins, annotations, and input schemas remain local to the browser.

## Capabilities and Constraints

- Uses `document.modelContext.getTools()` as the authoritative source; it does not infer support by scraping declarative form attributes.
- Re-reads the full list after `toolchange` events and when the popup opens.
- Records page titles and HTTP(S) URLs locally only when at least one accessible tool is detected; zero-tool pages are excluded, and legacy zero-tool records are removed. History is deduplicated, bounded to 200 recent entries, searchable, and user-clearable.
- Stores only page-level history metadata and the latest count, never tool schemas or descriptions.
- WebMCP remains experimental. Local testing currently requires a compatible Chrome build with `chrome://flags/#enable-webmcp-testing` enabled, or an origin-trial-enabled page.
- When that API is absent, the popup points users to the exact Chrome testing flag and notes that Chrome must be relaunched; supported-zero, blocked, and restricted states retain their own guidance.
- Secure context, origin isolation, and the `tools` Permissions Policy can limit availability.
- The extension inspects metadata only. It never executes a tool.

## Evidence on Hand

- WebMCP Community Group specification: <https://webmachinelearning.github.io/webmcp/>
- Chrome WebMCP overview and local setup: <https://developer.chrome.com/docs/ai/webmcp>
- Chrome imperative API and tool-discovery behavior: <https://developer.chrome.com/docs/ai/webmcp/imperative-api>
- Chrome declarative API: <https://developer.chrome.com/docs/ai/webmcp/declarative-api>

No product analytics, customer claims, or external service dependencies are supplied or required.

## Product Principles

- Make support state unambiguous: unavailable, blocked, supported with zero tools, and supported with tools are different outcomes.
- Keep the badge live and make the popup refresh from the page instead of trusting stale worker memory.
- Make history useful without turning it into analytics: newest-first titles and URLs, counts, search, reopen, and deletion are enough.
- Preserve page safety by inspecting serializable metadata only and never executing tools.
- Favor dense, readable technical detail over decorative dashboard chrome.

## Accessibility & Inclusion

The popup and history surface must support keyboard navigation, visible focus, reduced motion, high-contrast status text, accessible disclosure controls, and responsive history rows down to narrow extension-page viewports.
