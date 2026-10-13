# Phase 1 results

Phone test of `kin-spike` (see [PHONE-TEST.md](PHONE-TEST.md)).

| Date | Device | Check | Result |
| --- | --- | --- | --- |
| 2026-10-13 | iPhone, Google AI Edge Gallery | Load skill from GitHub Pages URL, `run_js` end to end | Works |
| 2026-10-13 | iPhone, Google AI Edge Gallery | localStorage after fully closing and reopening the app | **Persists** |

## Decision

Kin stores its data in `localStorage` under keys prefixed with `lore:`, served from GitHub Pages over
https. Export stays a core feature, because storage can still be lost (app deleted, website data
cleared, iOS storage pressure).

## Still open

- Long gap: read again after 8+ days without using the skill (Safari's 7-day rule for
  script-written storage; unclear whether it applies inside apps).
- IndexedDB, Cache API, OPFS and cookie results, and whether the inline webview shares storage
  with the runner.
- Export/import probes in the inline webview (download, share, copy, file picker). Phase 4
  depends on these.
- "Import local skill" path.
