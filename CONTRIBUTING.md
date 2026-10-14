# Contributing

Thanks for helping. There are several ways in:

- **Try Kin on your phone** with the [test script](docs/kin/PHONE-TEST.md) and open an issue with
  what went wrong. Say which phone, app version and model you used.
- **Build on Lore.** Read the [spec](spec/SPEC.md), use [lore-core](lore-core/README.md), and tell
  us what is unclear or missing.
- **Propose a spec change**, register an extension namespace, or improve lore-core and Kin.

Issues and pull requests can be in English or Spanish.

## Ground rules

These are not negotiable, and CI checks most of them:

- **No real personal data anywhere in the repository**: not in examples, tests, issues,
  screenshots or commit messages. Use made-up people, like the ones in
  [examples/lore/](examples/lore/).
- **Kin makes no network requests.** No fetch, XMLHttpRequest, WebSocket, sendBeacon, external
  scripts or external styles. Every page keeps its Content-Security-Policy. A privacy test scans
  the skills, and the browser tests fail on any request.
- **Today's date comes from the device clock, never from the model.** Kin receives the user's
  words ("ayer", "next 3 months") and works out dates in code.
- **Sensitive data is filtered before the model sees it**, unless the user's current request asks
  for it explicitly ([spec section 6](spec/SPEC.md#6-sensitivity)).
- **Editing is lossless.** Code that writes Lore keeps every field, section, comment and extension
  it does not understand.
- **Storage keys start with `lore:`**, and the Pages URL stays the same. Never host other skills
  on the `quantumbboy.github.io` origin ([PRIVACY.md](PRIVACY.md#storage-belongs-to-the-origin-not-to-the-skill)).
- **Kin replies in the user's language.** New user-facing text needs both English and Spanish.

## Setup

Requires Node.js 22 or later.

```sh
npm ci
npx playwright install chromium webkit   # once; the browser tests skip an engine that is missing
npm run validate                         # check every SKILL.md
node tools/build-kin.mjs                 # rebuild skills/kin after editing kin/ or lore-core/
npm run build                            # build the Pages site in _site/
npm test                                 # unit, privacy and browser tests
```

CI runs the same steps, with Chromium and WebKit (the iPhone's engine) both required.

## Repository layout

| Path | What it is |
| --- | --- |
| `spec/` | The Lore specification and its JSON Schemas. |
| `examples/lore/` | A complete example Lore folder. Everyone in it is fictional. |
| `lore-core/` | The JavaScript library for Lore folders, with its tests. |
| `kin/` | Kin's source: actions, storage, backup panel, page templates and tests. |
| `skills/<name>/` | Gallery skills, served from GitHub Pages: `kin`, and `kin-spike` (the Phase 1 storage test). |
| `tools/validate-skills.mjs` | Strict `SKILL.md` validator. It mirrors the app's parser, which is much stricter than YAML. |
| `tools/build-kin.mjs` | Bundles lore-core and Kin into the skill's two pages (no external scripts). |
| `tools/build-site.mjs` | Builds the Pages site in `_site/`: skills, and the spec under `spec/<version>/`. |
| `tools/gen-schemas.mjs` | Embeds the JSON Schemas into lore-core. |
| `tests/` | Spec consistency tests, browser tests that call each skill the way the app does, and a static privacy scan. |
| `evals/cases.jsonl` | Kin's logged mistakes, replayed by `tools/replay-evals.mjs` (`npm run evals`). |
| `docs/` | Phone test scripts and their results. |

## Making changes

**lore-core.** Plain ES modules with no dependencies, so they run in the app's webview as they
are. Add tests in `lore-core/test/`; the YAML and schema code is checked against the `yaml` package
and Ajv.

**Kin.** Edit `kin/src/` or the page templates in `kin/`, then run `node tools/build-kin.mjs` and
commit the regenerated files in `skills/kin/` with your change. CI fails if they are out of date.
The bundler supports named imports and exports only (no default, namespace or dynamic imports).
Kin's answers must be short: the model reads them inside a small context window.

**SKILL.md.** The Gallery app's parser is strict: the file starts with `---`, the frontmatter has
only `name`, `description` and `metadata`, values are plain one-line strings, and the description
is at most 1024 characters. `npm run validate` checks all of it. Keep Kin's `SKILL.md` short; a
test caps its size and checks it lists exactly Kin's actions.

**The spec.** Change `spec/SPEC.md` and the schemas together, run `node tools/gen-schemas.mjs`,
update the example folder if needed, and add a line to the changelog (Appendix B). Breaking
changes need a new spec version. To start a new version, first freeze the current one: copy
`spec/SPEC.md` and `spec/schemas/` to `spec/<version>/` (never edit them again), then change the
version and `$id`s in `spec/schemas/`. The site publishes every version, lore-core embeds every
version's schemas, and a fixture of the old example folder (`tests/fixtures/lore-<version>/`)
must keep loading byte for byte.

**Kin's mistakes (evals).** People who use Kin can export the mistakes they reported as
`cases.jsonl` from the backup panel. To add them, append the lines to `evals/cases.jsonl`, read
them first (names are replaced, but other details are not), and triage each case: set `fault` to
`kin` with an `expected` object (the keys of `kin/src/interpret.mjs`, such as `{"days": 365}` or
`{"date": "2026-10-12"}`) when Kin misread what the model sent, or to `model` when the model chose
the wrong action or person. `npm run evals` replays every case; a `kin` case that fails is a bug to
fix. `model` cases can only be re-run on a phone; fix those through `SKILL.md`.

**Extension namespaces.** Open a pull request that adds a row to the registry in
[spec section 12](spec/SPEC.md#12-extensions). Reverse domain names (`com.example.app`) need no
registration.

**A new language for Kin.** Add the language to `kin/src/messages.mjs`,
`lore-core/src/i18n.mjs`, the section titles in `lore-core/src/sections.mjs`, the date and period
words in `kin/src/when.mjs`, and the texts in both page templates.

## Releases

Kin, lore-core and `package.json` share one version. To release: bump `KIN_VERSION`
(`kin/src/version.mjs`), `VERSION` (`lore-core/src/folder.mjs`) and `package.json`, add a section
`## Kin X.Y.Z, …` at the top of `CHANGELOG.md` (a test checks both), merge to `main`, and push a
tag `vX.Y.Z`. The release workflow runs CI and publishes the GitHub release with that section as
notes. The skill itself is live as soon as `main` deploys to GitHub Pages.

## Pull requests

- Keep each pull request to one change, in small commits with clear messages.
- CI must be green.
- If you change how Kin behaves in a chat, run the [phone test](docs/kin/PHONE-TEST.md) if you can,
  and say what you saw.
- By contributing, you agree that your work is licensed under [Apache-2.0](LICENSE).
