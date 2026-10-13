# Privacy

> Draft from Phase 1, covering only the storage origin. The full privacy notice (what is stored,
> sensitivity levels, consent when storing data about other people) comes in Phase 5.

## Where Kin keeps data

Kin runs inside the Google AI Edge Gallery app as a JavaScript skill. It is served from
`https://quantumbboy.github.io/lore/skills/` and keeps everything in the app's webview storage
(localStorage / IndexedDB) on your phone. It makes no network requests. Every page ships a
Content-Security-Policy that blocks connections, and CI fails if any network API or external
script appears in `skills/`.

## Storage belongs to the origin, not to the skill

Browser storage is scoped to an **origin** (scheme + host + port), not to a skill, a repository
or a path. Kin's origin is `https://quantumbboy.github.io`. That has consequences:

- **Any page on that origin can read and write Kin's data** when it runs in the same app.
  That covers every GitHub Pages site of the `QuantumBBoy` account, not just this repository.
  **Never host third-party, untrusted or experimental skills on any QuantumBBoy GitHub Pages
  site.** Only skills from this repository, after review.
- **Every key is namespaced** with `lore:` (for example `lore:spike:entries`), so Lore data
  never collides with anything else that might share the origin.
- **The URL must stay stable forever.** If the skill moves to another host, account or custom
  domain, it starts with empty storage. The only way across is export and re-import. So: do not
  rename the `QuantumBBoy` account or move the repository to another account or organization
  (new origin, empty storage), and do not rename the `lore` repository (the skill URL saved in the
  app would stop working).
- **Forks get their own storage.** A fork served from `https://<someone>.github.io` has a
  separate origin and cannot see your data.

## Storage can be lost, so back it up

The data lives only on your phone. It disappears if you delete the app or clear its website
data, and iOS may clear it under storage pressure. Kin will make export a core feature and will
remind you to export a backup periodically (every 30 days or every 20 changes).
