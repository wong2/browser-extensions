---
name: WebMCP Radar
description: A compact live readout of the current page's WebMCP tool inventory.
colors:
  canvas: "#f2f2f2"
  surface: "#fafafa"
  surface-strong: "#ffffff"
  ink: "#171717"
  muted: "#595959"
  faint: "#696969"
  rule: "#dddddd"
  rule-strong: "#898989"
  signal: "#171717"
  signal-deep: "#111111"
  signal-soft: "#ededed"
  warning: "#404040"
  warning-soft: "#e7e7e7"
  warning-ink: "#303030"
  warning-ink-dark: "#e0e0e0"
  danger: "#111111"
  danger-soft: "#dfdfdf"
  danger-ink: "#171717"
  danger-ink-dark: "#f0f0f0"
  focus: "#000000"
  code-bg: "#f0f0f0"
  code-ink: "#262626"
  selection: "#d1d1d1"
  button-ink: "#ffffff"
  scroll-thumb: "#737373"
typography:
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    lineHeight: 1.45
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 720
    letterSpacing: "-0.015em"
  meta:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10.5px"
    fontWeight: 650
  supporting:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
  status:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 680
  unit:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "9.5px"
    fontWeight: 650
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "10.5px"
    lineHeight: 1.55
  count:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 680
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  status-mark: "1px"
  compact: "6px"
  action: "7px"
  control: "9px"
  pill: "999px"
spacing:
  hairline: "1px"
  tight: "5px"
  compact: "7px"
  row: "12px"
  inset: "16px"
components:
  masthead:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    height: "56px"
    padding: "10px 14px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "30px"
  signal-panel-supported:
    backgroundColor: "{colors.signal-soft}"
    textColor: "{colors.signal-deep}"
    height: "56px"
    padding: "10px 14px"
  tool-row:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    padding: "10px 40px 10px 14px"
  hint-badge:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "2px 7px"
  schema-code:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  primary-action:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.action}"
    padding: "5px 10px"
    height: "30px"
  text-link:
    backgroundColor: "transparent"
    textColor: "{colors.signal-deep}"
    rounded: "{rounded.compact}"
    padding: "3px 7px"
    height: "26px"
  history-masthead:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    height: "68px"
    padding: "11px 24px"
  history-footer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    height: "44px"
    padding: "8px 24px"
  history-search:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 39px 7px 37px"
    height: "38px"
  history-row:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    padding: "14px 24px"
    height: "72px"
  history-page-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.compact}"
    padding: "0"
  danger-action:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.action}"
    padding: "5px 10px"
    height: "30px"
---

# Design System: WebMCP Radar

## Overview

**Creative North Star: "The Live Protocol Ledger"**

WebMCP Radar is a live protocol readout, not a miniature dashboard. White paper surfaces, graphite rules, and decisive black-and-white contrast turn a potentially abstract API state into a small, calm instrument: support first, count second, metadata only on disclosure.

The popup is code-led Direct Operate. It favors compact native typography, tabular count treatment, and monospace only where an identifier or JSON schema benefits from it. The result is dense enough for inspection while remaining quiet around routine and empty states; it never implies that the extension executes a discovered tool.

The history page carries that instrument into a chronological field log of titles and URLs where at least one tool was detected: newest-first records, search, reopening, and local deletion remain visibly operational rather than analytical. A quiet footer keeps the local-data note and clear action out of the primary reading flow, while each ruled row keeps page identity, compact detection metadata, and a coherent action group in one scan line.

**Key Characteristics:**

- A continuous instrument surface, divided by hairline graphite rules rather than dashboard cards.
- Near-black carries live state and action; warnings and errors are distinguished by labels, fields, and shapes rather than hue.
- Technical detail is progressively disclosed: readable rows first, metadata and schema second.
- History is a chronological, searchable ledger of URLs with detected tools; it never turns local detection records into analytics.
- System light and dark schemes preserve the same semantic token roles.

## Colors

The light palette is white paper and graphite; the dark palette inverts those same roles into black surfaces and white signals.

### Monochrome Core

- **Signal Black**: drives the light-scheme brand mark, live dot, badge, and primary action.
- **Deep Black**: supplies compact action text and supporting status copy where the signal needs firmer contrast.
- **Soft Gray**: is the supported-state field and the hover wash for quiet actions.

### Semantic States

- **Warning Graphite**: marks policy and origin-isolation warnings; its diamond status mark separates it from other states.
- **Warning Gray**: is the warning-state field and untrusted-content badge backing.
- **Destructive Black**: marks unavailable scan outcomes and explicit destructive controls; the error status mark is square.
- **Destructive Gray**: is the error-state field and the hover wash for row deletion.

### Neutral

- **Gray Canvas**: sits behind the constrained popup frame.
- **Paper Surface**: fills the scrolling inventory and footer; **Strong Paper** separates the masthead and closed rows.
- **Graphite Ink**: carries primary reading text; **Muted**, **Faint**, and **Scroll Graphite** step down for supporting text and affordances.
- **Graphite Rules** and **Strong Rules** establish boundaries without card-heavy depth.
- **Code Paper** gives schemas, skeletons, and subtle hover fields a distinct technical plane.
- **Focus Black**, **Selection Gray**, and **Inverse Ink** are functional colors for keyboard state, text selection, and filled actions; their dark-scheme roles invert.

### Named Rules

**The Monochrome Signal Rule.** Black-and-white contrast communicates availability, liveness, and action. Do not introduce a decorative hue into the instrument surface.

**The Semantic Alert Rule.** Warning and error states must remain distinguishable without color: use explicit copy, separate background values, and diamond-versus-square marks. Destructive actions stay explicit in their wording and confirmation.

## Typography

**Display Font:** No separate display face; use the native sans stack.

**Body Font:** `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

**Label/Mono Font:** `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace` for tool names, full URLs, origins, and schemas.

**Character:** Native sans keeps the popup familiar to the browser; modestly heavy weights make the compact scale legible. Monospace is a semantic annotation layer, not the default reading voice.

### Hierarchy

- **Count** (680, 16px, 1): a compact exact tool count in the popup signal rail; use tabular numerals without turning it into a hero metric.
- **Title** (720, 14px): masthead and state-message headings.
- **Row name** (650, 12.5px): monospace identifier for a tool.
- **History identity** (700, 13.5px title; 400, 11px URL): the page title anchors each ledger row in native sans while the full canonical URL remains a quieter monospace detail.
- **Body** (400, 13px, 1.45): the base reading size; tool descriptions and state copy reduce to 11.5–12px where the fixed popup demands it.
- **Label** (650–700, 10–10.5px, 0.04–0.055em): uppercase status units, metadata terms, and badges.
- **Code** (400, 10.5px, 1.55): schema body with preserved whitespace and a two-space tab size.

### Named Rules

**The Code Has a Job Rule.** Reserve monospace for identifiers, URLs, origins, and schema data; never use it for navigation, explanatory copy, or primary status language.

## Layout

The popup is a fixed-width (420px; minimum 360px) vertical instrument with a 600px maximum height. A 56px masthead, 56px signal rail, scrollable inventory, and 32px footer form one uninterrupted stack. The first viewport prioritizes current-page context, support state and count, then immediately visible tool rows.

The recurring popup inset is 14px. Compact 10px row padding, 10px grid gaps, and 1px graphite dividers produce the dense ledger rhythm. Tool summaries use two columns—identity and semantic risk badges—with a reserved right-side disclosure affordance; disclosed content keeps the same inset and stacks origin before schema. Long URLs, names, and descriptions clamp, truncate, or wrap deliberately rather than widening the popup.

The popup has no viewport-width breakpoints: its constrained geometry is the responsive contract. System color preference changes semantic token values, and reduced-motion preference removes animation and disclosure transitions.

The history page is one centered continuous shell, capped at 1040px with graphite side rules and a full-viewport minimum height. Its first viewport reads in order: a 68px masthead with a browsing-context subtitle, a 58px search-and-count toolbar, then the newest ruled records. A compact data-and-clear footer follows the ledger. Rows use one stable two-column grid at every width: a fluid, directly linked page identity whose second line groups URL and tool count, plus a reserved right-side overflow control. Desktop rows are at least 72px tall with a 12px gap and 14px × 24px padding.

History responds at three implemented breakpoints without rearranging row semantics. At 780px, horizontal insets reduce to 18px. At 620px, shell side rules disappear and footer actions may wrap. At 410px, insets reduce to 14px and search/count stack; each row keeps the page identity and metadata on the left with only its overflow control reserved on the right, including at a 360px viewport.

## Elevation & Depth

This is a flat, layered interface. Paper tone, border lines, open-versus-closed popup rows, and the history row's faint gray hover wash convey hierarchy; regular cards and drop shadows are absent. The only shadow is the small neutral live-dot bloom, which makes the active state feel present without lifting a surface.

### Shadow Vocabulary

- **Live-dot bloom** (`0 2px 8px color-mix(in srgb, var(--signal) 32%, transparent)`): applies only to the supported signal dot.

### Named Rules

**The Ruled Surface Rule.** Separate reading zones with paper contrast and a 1px rule, not with floating containers or decorative shadows.

## Shapes

Geometry is compact and gently practical. Warning and error status marks use a 1px corner so their diamond and square silhouettes stay crisp. The brand mark uses a 9px rounded square; icon controls, schema code blocks, and the search field share the 9px control corner. Primary, row, and destructive actions use 7px corners, quiet copy actions use 6px corners, and badges or scroll thumbs are fully pill-shaped. Borders are thin graphite rules; the visual language does not use oversized softness or ornamental clipping.

## Components

### Masthead Navigation

The masthead establishes the current-page context without becoming app chrome. A 28px near-black brand mark in light mode (white in dark mode), 13.5px title, truncated 11px page label, and a top-right 30px refresh control sit on Strong Paper, divided from the signal rail by one graphite rule.

### Refresh Icon Button

- **Shape:** compact rounded-square control (9px; 30px square).
- **Default:** transparent field with muted iconography.
- **Hover / Focus:** Code Paper hover with ink icon; the global 2px focus outline uses Focus Black in light mode and white in dark mode. The glyph spins once while a scan is in progress.
- **Disabled:** faint, 58% opacity, and no pointer affordance.

### Signal Rail

- **Structure:** 7px status dot and concise state message lead the rail. A compact 16px tabular count and uppercase unit appear only after WebMCP support is confirmed; loading, unavailable, blocked, restricted, and error states omit the count region entirely. Supporting text appears only when same-origin fallback needs disclosure.
- **Supported:** Soft Gray field with a circular Signal Black dot and Deep Black copy; dark mode inverts the signal roles.
- **Loading / empty:** Code Paper or Paper with graphite copy; loading alone breathes the dot.
- **Warning / error:** separate gray fields with diamond and square status marks respectively. These states remove the live-dot shadow.

### WebMCP Setup State

- **Trigger:** appears only when `document.modelContext` is unavailable. Supported pages with zero tools, policy-blocked pages, origin-isolation failures, and protected browser pages keep their own distinct states.
- **Recovery:** the existing state-message region explains that local testing requires Chrome's WebMCP testing flag and a browser relaunch. “Enable WebMCP flag” is the primary action that opens the flag page; “Setup guide” remains the quiet secondary action. The state does not claim that Radar can read or change the flag itself.

### Tool Row Disclosure

- **Shape:** a ruled row with a minimum 56px summary and a small CSS-drawn chevron at the right.
- **Default:** Strong Paper, monospace tool name, muted title and optional description, plus only semantically important read-only or untrusted badges.
- **Hover / Focus:** the summary receives a translucent Soft Gray wash; focus uses the shared visible outline.
- **Open:** the row changes to Paper and the chevron rotates; metadata appears before the schema rather than opening a separate dialog.

### Hint Badges

- **Style:** uppercase 10.5px labels with 2px × 7px padding and fully pill-shaped corners.
- **Variants:** default uses Code Paper; read-only uses Soft Gray with Deep Black text; untrusted uses Warning Gray, warning text, and a dashed border.

### Schema Code Block

- **Corner Style:** compact control corners (9px) and a single graphite border.
- **Background:** Code Paper with 11px × 12px padding and a 220px maximum height.
- **Typography:** 10.5px monospace, 1.55 line height, preserved whitespace, and horizontal/vertical overflow for source fidelity.
- **Adjacent action:** its 11px uppercase heading pairs with the quiet Copy JSON action; copying briefly changes the label to “Copied”.

### Primary Action

- **Shape:** 7px corners, 30px minimum height, and 5px × 10px padding.
- **Primary:** Signal Black background with Inverse Ink text, used for the single most useful recovery—Scan again when retry is meaningful, or Enable WebMCP flag when the API is absent. Dark mode reverses the pair.
- **Hover / Focus:** Deep Black on hover; the shared high-contrast focus outline remains keyboard-visible.

### Text Link

- **Style:** a compact 26px-tall quiet action for WebMCP docs, Setup guide, and Copy JSON.
- **Hover / Focus:** transparent at rest, then Soft Gray backing; it keeps text-action scale rather than becoming a secondary filled button.

### History Masthead and Data Footer

- **Masthead:** a compact 68px ruled header pairing “WebMCP history” with “WebMCP pages you’ve encountered while browsing.” The subtitle explains passive discovery without suggesting a bookmark list or active crawl.
- **Data footer:** a neutral 44px line follows the ledger and states only “Data stays on this device.” It keeps storage context available without interrupting the page’s primary reading flow.
- **Clear entry point:** “Clear history” is a quiet, explicitly destructive action in the footer. It remains disabled when no records exist and never resembles a positive primary action.

### Ledger Toolbar

- **Search:** a 430px maximum-width, 38px-tall Strong Paper field with a leading search glyph, trailing clear control, graphite border, and 9px corners. Its label and placeholder both specify “Search title or URL.”
- **Count:** an 11px uppercase, tabular status at the opposite edge reports loading, total, or filtered-over-total pages. It is a polite atomic live region, not an analytics metric.
- **Responsive behavior:** search and count share one horizontal 58px rail on desktop, then stack with the count right-aligned at 410px and below.

### History Ledger Row

- **Structure:** each newest-first ruled row is a two-part composition. The saved page title leads one large link on the left; its canonical URL and latest positive tool count share the quieter metadata line beneath it. Only the overflow menu remains on the right. Detection time is intentionally omitted.
- **Actions:** activating the title or URL opens the page in a new tab, so a separate Open button is unnecessary. Delete remains inside a vertically centered 30px three-dot disclosure with a single-item dropdown. The menu closes on outside click or Escape, supports arrow-key focus, and retains destination-aware accessible names and visible focus rings.
- **Responsive behavior:** the same two-part composition persists at every width. Long titles and URLs truncate within the flexible link instead of pushing the right cluster or widening the ledger.

### Destructive History Confirmation

Clear-all is the confirmed destructive path. Activating “Clear history” swaps that entry point in place for “Delete every local record?”, Cancel, and a filled black/white “Clear all” action; focus moves to Clear all, Cancel restores focus to Clear history, and both confirmation actions disable during the mutation. Per-row Delete remains a direct, destination-labelled action.

### Mutation Announcements

A single visually hidden, polite, atomic status region reports successful local mutations without moving the viewport. Row deletion names the removed page title plus the remaining page count; clear-all announces “History cleared. 0 pages remain.” After either mutation, focus returns to the enabled history search. Read or mutation failures replace the ledger with the visible error state and Try again action.

## Do's and Don'ts

### Do:

- **Do** lead with the semantic support state and exact count before presenting tool metadata.
- **Do** keep the popup's 14px inset and 1px graphite rules when adding another popup inspection row or section.
- **Do** use monospace for tool identifiers, origins, and JSON; preserve code overflow instead of reflowing schemas.
- **Do** preserve visible 2px high-contrast focus rings and disable incidental animation for reduced-motion users.
- **Do** use the implemented light/dark semantic token overrides instead of introducing a separate theme vocabulary.
- **Do** keep history newest-first and show only the latest positive tool count in each valid URL row.
- **Do** keep clear-all behind its inline confirmation, restore focus deliberately, and announce completed deletions through the polite atomic status region.
- **Do** preserve the history row's 780px, 620px, and 410px recompositions when changing its contents.

### Don't:

- **Don't** turn the popup into a dashboard: no KPI cards, charts, or competing accent colors.
- **Don't** use shadows to make ordinary rows or actions float; depth comes from paper layers and rules.
- **Don't** rely on color alone for warnings, failures, or destructive actions; keep labels, marks, and confirmation intact.
- **Don't** expose all tool metadata by default or imply that this extension can run a tool.
- **Don't** turn history into analytics, charts, or behavioral reporting; it is a local chronological ledger of URLs where tools were detected.
- **Don't** make destructive confirmation visually ambiguous or remove the explicit clear-all question.
