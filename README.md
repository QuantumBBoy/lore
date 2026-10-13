# Lore + Kin

*[Leer en español](README.es.md)*

**Lore** is an open, local-first file format for a person's life context: a folder of Markdown
files with YAML frontmatter that both people and language models can read.

**Kin** is the first app built on Lore. It is a skill for
[Google AI Edge Gallery](https://github.com/google-ai-edge/gallery), the app that runs Gemma
models on your phone, and it helps you remember the people in your life: birthdays, gift ideas,
promises, things to ask, and who you haven't talked to in a while. It makes no network requests
and nothing you tell it leaves the phone.

## Why local-first

What you know about the people close to you is some of the most personal data you have, and most
of it is about people who never agreed to be in a database. It belongs on your phone, not on a
server.

- **The model runs on the phone.** Gemma runs inside the Gallery app. Kin hands it only what the
  current question needs, with sensitive notes removed unless you ask for them.
- **Kin never connects to anything.** Its pages ship a Content-Security-Policy that blocks every
  connection, and CI fails if any network API or external script appears in the skill.
- **Plain files you own.** Kin stores a Lore folder: Markdown you can export, read in any text
  editor and take to another app. The format is an open [specification](spec/SPEC.md), not a
  private database.
- **No account, no subscription, no server to shut down.** GitHub Pages hosts Kin's code, but
  never your data.

## Try Kin on an iPhone

1. Install **Google AI Edge Gallery** from the App Store.
2. In the app, download **Gemma 4 E4B**. E2B is smaller and faster, but chooses the wrong action
   more often.
3. Open **Agent Skills**, tap the **Skills** chip, then **+** → **Load skill from URL**, and paste:

   ```
   https://quantumbboy.github.io/lore/skills/kin
   ```

4. Make sure `kin` is switched on, start a new chat and talk normally. There is no button: the
   model calls Kin whenever your message is about a person.

Kin answers in English or Spanish, whichever you write in. The same app exists for Android, where
Kin should work the same way, but it has only been tested on iPhone.

## A 30-second demo

Type these in a new chat. The replies in italics are what Kin returns; the model words them its
own way.

1. `Yesterday Marta told me she wants to learn pottery`
   → *I don't know anyone called "Marta". Should I add "Marta" as a new person?* → `yes`
   → *Added Marta. Saved for Marta (gift ideas): Wants to learn pottery*
2. `Marta's birthday is April 12`
   → *Saved Marta's birthday: Apr 12.*
3. `I lent Marta my copy of Dune`
4. `I'm seeing Marta tomorrow, anything I should remember?`
   → *Before you see Marta: Lent (not returned): Lent her my copy of Dune*
5. `What should I get Marta? Around 40 euros`
   → Kin returns your saved ideas and past gifts, and the model suggests three gifts from them.
6. `Any birthdays in the next 12 months?`
   → *Marta: birthday in … days (Apr 12)*

Kin also keeps plans, sizes, food restrictions and things to ask someone. You can set how often you
want to talk to someone and ask who is overdue. Say `backup` to save or restore everything.

## Limitations

Kin is a working prototype. Things to know before you rely on it:

- **Your data lives in one place.** Kin keeps it in the Gallery app's web storage on your phone.
  Deleting the app, or clearing its website data, deletes it, and iOS may clear storage when the
  phone is short of space. Kin reminds you to back up every 30 days or 20 changes; keep the
  backups. Whether storage survives eight days or more without opening Kin is still being tested.
- **No sync.** One phone. A backup file is how you move to another one.
- **No reminders.** Skills cannot run in the background, so Kin only speaks when you ask it
  something. It cannot notify you of a birthday.
- **Small models make mistakes.** Sometimes the model answers without calling Kin, picks the
  wrong action or misreads a name. Kin asks before creating, overwriting or deleting anything, but
  check what it says it saved.
- **Long chats break the model.** After about fifteen requests in one chat, the on-device model
  runs out of context and starts writing nonsense. Start a new chat every few requests; Kin's data
  does not depend on the chat. Leave *Max tokens* at its default: very high values make the model
  produce only noise.
- **Sensitive notes are detected by keywords** (health, money, relationships, legal matters, in
  English and Spanish). It will miss things. Say when something is private, and Kin marks it.
- **The code is loaded from GitHub Pages.** The app fetches Kin's pages from
  `quantumbboy.github.io`, so GitHub sees that request (as for any website). Your data is never
  sent. Using Kin offline has not been tested.
- **English and Spanish only**, and only the people part of Lore so far.
- **The spec is a 0.1 draft** and may change before 1.0.

This is an independent project, not affiliated with or endorsed by Google.

## Lore, the format

A Lore folder looks like this ([full example](examples/lore/), everyone in it is fictional):

```text
lore/
├── me.md                 you: name, language, time zone; declares the spec version
├── INDEX.md              one line per file, generated, read first by models
└── people/
    ├── marta-ruiz.md     frontmatter for facts, sections for gift ideas, promises, notes…
    └── luis-ortega.md
```

- [spec/SPEC.md](spec/SPEC.md): the specification, with sensitivity levels, body syntax, date
  rules and extensions.
- [spec/schemas/](spec/schemas/): JSON Schemas, also published at
  `https://quantumbboy.github.io/lore/spec/0.1/`.
- [lore-core/](lore-core/README.md): a dependency-free JavaScript library that reads, edits,
  validates and queries Lore folders without losing hand edits.

Anyone can build on Lore. Read [CONTRIBUTING.md](CONTRIBUTING.md) to propose changes or register
an extension namespace.

## Status

| Phase | State |
| --- | --- |
| 1. Feasibility spike: does skill storage survive on iPhone? | Done ([results](docs/spike/RESULTS.md)) |
| 2. Lore spec 0.1 | Draft |
| 3. lore-core library | Done |
| 4. Kin skill | Done, tested on iPhone ([results](docs/kin/RESULTS.md)) |
| 5. Docs and release | This README, [PRIVACY.md](PRIVACY.md), [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md) |

What comes next is in [ROADMAP.md](ROADMAP.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `spec/` | The Lore specification and its JSON Schemas. |
| `examples/lore/` | A complete example Lore folder. Everyone in it is fictional. |
| `lore-core/` | The JavaScript library for Lore folders, with its tests. |
| `kin/` | Kin's source: actions, storage, backup panel, page templates and tests. |
| `skills/<name>/` | Gallery skills, served from GitHub Pages: `kin`, and `kin-spike` (the Phase 1 storage test). |
| `tools/` | The `SKILL.md` validator, the Kin bundler, the site builder and the schema generator. |
| `tests/` | Spec tests, browser tests that call each skill the way the app does, and a privacy scan. |
| `docs/` | Phone test scripts and results. |

## Development

Requires Node.js 22 or later.

```sh
npm ci
npx playwright install chromium webkit   # once, for the browser tests
node tools/build-kin.mjs                 # after editing kin/ or lore-core/
npm test
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the details.

## Privacy

Read [PRIVACY.md](PRIVACY.md): what Kin stores, where, how sensitive notes are handled, and what
to keep in mind when you write about other people.

## License

[Apache-2.0](LICENSE)
