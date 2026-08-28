# CF Cache Purge

Purge the current HTTP or HTTPS URL from Cloudflare's cache by clicking the extension icon.

## Setup

1. Open the extension settings.
2. Use the provided Cloudflare link to create a token with `Zone Read` and `Cache Purge` permissions.
3. Paste the token and select **Save and verify**.

The token is stored in `browser.storage.local` and is sent only to `api.cloudflare.com`.

## Toolbar states

- `…` Purge in progress
- `✓` Purge succeeded
- `!` Purge failed

The extension removes URL fragments before purging because fragments are not part of HTTP cache keys. Query parameters are preserved.
