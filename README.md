# Lore + Kin

**Lore** is an open, local-first file format for a person's life context: a folder of Markdown
files with YAML frontmatter that both people and language models can read.

**Kin** is the first app on top of Lore: a skill for
[Google AI Edge Gallery](https://github.com/google-ai-edge/gallery), running Gemma on your phone.
It helps you remember the people in your life: birthdays, gift ideas, promises, and who you
haven't talked to in a while. Nothing leaves the device.

## Status

- **Phase 1, feasibility spike: done.** A skill served from GitHub Pages keeps its `localStorage`
  on iPhone after the app is closed ([results](docs/spike/RESULTS.md)).
- **Phase 2, Lore spec 0.1: draft.** Read [spec/SPEC.md](spec/SPEC.md); the
  [JSON Schemas](spec/schemas/) and a fictional [example folder](examples/lore/) go with it.

Skill URL for the app ("Load skill from URL"):

```
https://quantumbboy.github.io/lore/skills/kin-spike
```

## Repository layout

| Path | What it is |
| --- | --- |
| `spec/` | The Lore specification and its JSON Schemas. |
| `examples/lore/` | A complete example Lore folder. Everyone in it is fictional. |
| `skills/<name>/` | Gallery skills, served from GitHub Pages. |
| `tools/validate-skills.mjs` | Strict `SKILL.md` validator. It mirrors the app's parser, which is much stricter than YAML. |
| `tools/build-site.mjs` | Builds the Pages site in `_site/`: skills, and the spec under `spec/<version>/`. |
| `tests/` | Spec consistency tests, headless-browser tests that call each skill like the app does, and a static privacy scan. |
| `.github/workflows/` | CI on every push; deploy to GitHub Pages from `main`. |

## Development

Requires Node.js 22+.

```sh
npm ci
npx playwright install chromium   # once, for the browser tests
npm run validate                  # check every SKILL.md
npm run build                     # build _site/
npm test                          # unit, privacy and browser tests
```

## Privacy

Kin makes no network requests and keeps its data in your phone's webview storage. Storage is
scoped to the hosting origin, so the Pages URL must stay stable and must not host other
people's code. See [PRIVACY.md](PRIVACY.md).

## License

[Apache-2.0](LICENSE)
