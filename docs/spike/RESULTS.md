# Phase 1 results

Phone test of `kin-spike` (see [PHONE-TEST.md](PHONE-TEST.md)).

| Date | Device | Check | Result |
| --- | --- | --- | --- |
| 2026-10-13 | iPhone, Google AI Edge Gallery | Load skill from GitHub Pages URL, `run_js` end to end | Works |
| 2026-10-13 | iPhone, Google AI Edge Gallery | localStorage after fully closing and reopening the app | **Persists** |
| 2026-10-13 | iPhone, inline webview | Same storage as the hidden runner | **Yes** |
| 2026-10-13 | iPhone, inline webview | Download a file (`<a download>`) | **Nothing happens** |
| 2026-10-13 | iPhone, inline webview | Share a file (`navigator.share`) | Works |
| 2026-10-13 | iPhone, inline webview | Copy text (`navigator.clipboard`) | Works |

## Decision

Kin stores its data in `localStorage` under keys prefixed with `lore:`, served from GitHub Pages over
https. Export stays a core feature, because storage can still be lost (app deleted, website data
cleared, iOS storage pressure).

Export uses the share sheet (a `.zip` file) with "copy as text" as a fallback; downloads do not
work in the app's webview. The backup panel can work on the same data as the runner.

## Still open

- Long gap: read again after 8+ days without using the skill (Safari's 7-day rule for
  script-written storage; unclear whether it applies inside apps).
- IndexedDB, Cache API, OPFS and cookie results (not needed while localStorage works).
- ~~File picker in the inline webview (import).~~ Works: tested with the Kin backup panel in
  Phase 4 ([results](../kin/RESULTS.md)).
- "Import local skill" path.
