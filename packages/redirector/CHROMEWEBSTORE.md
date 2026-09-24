# Chrome Web Store Listing — Redirector

Last Updated: 2026-09-24

## Store Listing

**Extension Name:** Redirector

**Short Description:** Redirect URLs based on custom rules

**Detailed Description:** Redirect links using your own rules. Replace domains and paths,
reuse matching path segments, or open the destination stored in a URL query parameter.
For example, `l.meta.ai => query:u` opens the link in the `u` parameter automatically.
Click the extension icon, enter one rule per line, and save. Rules are stored locally.

**Category:** Productivity

**Single Purpose:** Redirect web navigation according to user-defined URL rules.

**Primary Language:** English

## Graphics & Assets

The 128×128 icon is available at `public/icon/128.png`. Store screenshots are not prepared;
include the query parameter example in the options screenshot before submission.

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| storage | permissions | Save the user's redirect rules locally. |
| declarativeNetRequest | permissions | Apply domain and path replacement rules during navigation. |
| webNavigation | permissions | Detect main-frame navigation and extract destinations from query parameters for matching rules. |
| tabs | permissions | Check current and pending tab URLs to avoid applying a query redirect after the user has navigated elsewhere. |
| `*://*/*` | host_permissions | Apply user-defined rules to HTTP/HTTPS sites chosen by the user. |

## Privacy & Data Use

Rules are stored locally. Navigation URLs are processed locally to apply matching rules;
the extension does not store browsing history or send it to an analytics service.
Redirects cause the browser to request the configured destination normally.

## Privacy Policy

Public privacy policy URL: not configured; required before store submission.

## Distribution & Developer Info

Visibility, regions, publisher, contact email and support URL: not configured.

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.0.1 | 2026-09-24 | Add query parameter destinations with URL decoding. | Draft |

## Review Notes

Query redirects accept only absolute HTTP/HTTPS destinations and operate on main-frame
navigation. They do not guarantee that the source request is prevented from reaching
the source server. Missing or invalid targets leave navigation unchanged.
