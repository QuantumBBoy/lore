# Privacy

**In short:** Kin keeps what you tell it in the Gallery app's storage on your phone. It never sends
it anywhere, it hides sensitive notes from the model unless you ask for them, and you can back up
or delete everything yourself. Nobody behind this project can see your data, and nobody can
recover it for you.

This document covers Kin, the skill in this repository. Other programs that use the Lore format
have their own privacy rules; the [spec](spec/SPEC.md#6-sensitivity) sets the minimum.

## What Kin stores

Only what you tell it, as a [Lore folder](spec/SPEC.md):

| File | What is in it |
| --- | --- |
| `me.md` | You. Kin creates it the first time with the name "Me" (or "Yo"), the language you wrote in and your phone's time zone. |
| `people/<name>.md` | One file per person: name, nickname, relationship, birthday and other dates, links to other people, how often you want to talk and when you last did, and sections for likes, sizes, food restrictions, gift ideas, gifts given, plans, things to ask, promises and loans, and notes. |
| `INDEX.md` | A generated list of the files, one line each. It never contains sensitive data. |
| `conflicts/<time>/…` | Only after you merge a backup that changes a file: the version that was on the phone, so a merge never loses anything. |

Kin also keeps three small records of its own:

- `lore:v1:meta`: the date you first used Kin, the date of your last backup, how many changes you
  have made since, and the date of the last backup reminder.
- `lore:v1:undo`: after you import a backup, a full copy of your data from just before the import,
  so you can undo it. It stays until you undo or import again. A person you delete after an import
  is still in this copy until then.
- `lore:v1:bin:…`: files that are not text, if a backup you imported contains any.

There are no analytics, logs, identifiers or cookies.

## Where it is stored

In the web storage (`localStorage`) of the Gallery app's built-in browser, on your phone, under
keys that start with `lore:v1:`. It may be included in your phone's own backups (iCloud or a
computer), like other app data.

The data belongs to the web address Kin is served from, `https://quantumbboy.github.io`. See
[Storage belongs to the origin](#storage-belongs-to-the-origin-not-to-the-skill) below.

## What leaves the phone

**Nothing you tell Kin.** Kin makes no network requests. Every Kin page has a
Content-Security-Policy that blocks all connections (`default-src 'none'`), and CI fails if any
network API (fetch, XMLHttpRequest, WebSocket, sendBeacon…) or external script appears in a skill.

What does go over the network:

- **Kin's code.** The Gallery app loads Kin's pages from GitHub Pages. GitHub sees that request,
  as it would for any website (your IP address and the browser's user agent), under
  [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
  The request carries none of your data.
- **The model.** The Gallery app downloads the Gemma model once. That is between you and the app.

## What the model sees

Gemma runs inside the Gallery app, on the phone. For each request, the model sees your message and
Kin's short answer to it, and it writes the reply. Kin does not hand the model your whole folder:
only what that request needs, after removing sensitive data unless you asked for it.

Your chats are kept, or not, by the Gallery app. Kin has no access to them.

## Sensitivity levels

Every piece of data in Lore has one of three levels:

| Level | Meaning | Who sees it |
| --- | --- | --- |
| `public` | Fine to share. | You, and anything you choose to share with others. |
| `private` | The default. For your own use. | You. |
| `sensitive` | Could hurt someone if it leaked: health, money, relationships, beliefs, legal matters, anything told in confidence. | You, and only when you ask for it explicitly. |

What Kin does with them:

- **Everything is private** unless marked otherwise.
- **Kin marks a note sensitive** when it mentions health, money, relationships or legal matters
  (it looks for keywords in English and Spanish), or when you say it is private. Keyword detection
  misses things, so say so when it matters.
- **Sensitive notes stay out of Kin's answers**, and so away from the model, unless your request
  asks for them explicitly ("what did Javi say about his surgery?"). Kin says how many it held
  back, without saying what they are. The permission covers that one request.
- **Sensitive data never appears in `INDEX.md`**, and Kin never lowers a level on its own.
- **Backups contain everything, sensitive notes included**, because they are yours. The backup is
  not encrypted: keep it somewhere private.

## Writing about other people

Everyone in Kin, except you, is someone who never agreed to be written down. Treat their data as
you would want yours treated:

- Store what helps you be a better friend, partner or relative. Do not store what you would be
  uncomfortable for them to read.
- Mark what you were told in confidence as private, so Kin keeps it sensitive.
- Keep it accurate, and delete what you no longer need.
- Do not share someone's data without a good reason, and never their sensitive notes.
- If someone asks you to forget something, delete it.

## Deleting data

- **One note:** "Borra la nota de Marta sobre …" / "Delete the note about … from Marta's file".
- **One person:** "Borra a Luis" / "Delete Luis". Kin asks first.
- **Everything:** delete the Gallery app. This removes all of Kin's storage on the phone. Backups
  you saved elsewhere are not affected.

## Storage belongs to the origin, not to the skill

Browser storage is scoped to an **origin** (scheme + host + port), not to a skill, a repository or
a path. Kin's origin is `https://quantumbboy.github.io`. That has consequences:

- **Any page on that origin can read and write Kin's data** when it runs in the same app. That
  covers every GitHub Pages site of the `QuantumBBoy` account, not just this repository.
  **Never host third-party, untrusted or experimental skills on any QuantumBBoy GitHub Pages
  site.** Only skills from this repository, after review.
- **Every key is namespaced** with `lore:` (for example `lore:v1:file:me.md`), so Lore data never
  collides with anything else that might share the origin.
- **The URL must stay stable forever.** If the skill moves to another host, account or custom
  domain, it starts with empty storage, and the only way across is a backup and a restore. So: do
  not rename the `QuantumBBoy` account or move the repository to another account or organization
  (new origin, empty storage), and do not rename the `lore` repository (the skill URL saved in the
  app would stop working).
- **Forks get their own storage.** A fork served from `https://<someone>.github.io` has a separate
  origin and cannot see your data.

## Storage can be lost, so back it up

The data lives only on your phone. It disappears if you delete the app or clear its website data,
and iOS may clear it under storage pressure. Kin reminds you to back up every 30 days or every 20
changes (the `kin.export_every_days` and `kin.export_every_changes` settings in `me.md`). Say "backup" or "copia de seguridad": the panel can share
a `.zip` file (save it in Files or send it to yourself) or copy everything as text, and restore
either one later.

## Reporting a problem

If you find a way Kin could leak data, open an issue that describes it without including anyone's
personal data. For anything that should not be public, contact the maintainer through GitHub first.
