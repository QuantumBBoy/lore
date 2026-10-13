# lore-core

JavaScript library to read, write, validate and query [Lore](../spec/SPEC.md) folders.

- **No dependencies.** It includes its own YAML subset parser, JSON Schema checker and ZIP
  reader/writer. Runs in browsers (including iOS WebKit, inside a Gallery skill) and Node.js 22+.
- **Lossless.** Edits rewrite only the lines they change; comments, quoting, unknown fields,
  sections and files are kept byte for byte.
- **Private by default.** Every query drops sensitive data in code and tells you how much it
  withheld. Pass `includeSensitive: true` only when the owner explicitly asked.
- **Today comes from the clock**, never from a model.

## Use

```js
import { LoreFolder, matchPerson, upcoming, brief, exportArchive, importArchive } from './lore-core/src/index.mjs';

// A folder is a map of path -> content (text, or bytes for binary files).
const folder = LoreFolder.fromFiles({ 'me.md': '...', 'people/marta-ruiz.md': '...' });
// or: LoreFolder.create({ name: 'Alex', language: 'es', timezone: 'Europe/Madrid' })

const m = matchPerson(folder, 'Marta');
// { status: 'match', slug: 'marta-ruiz', ... } | { status: 'ambiguous', candidates } | { status: 'none', suggestions }

folder.addEntry('marta-ruiz', 'gift-ideas', { date: '2026-10-13', text: 'Pottery class' });
folder.updatePerson('marta-ruiz', { last_contact: '2026-10-13' });
folder.regenerateIndex();

upcoming(folder, { days: 30 });          // { items: [{ name, kind, date, daysAway, years }], withheld }
brief(folder, 'marta-ruiz');             // { lines: ['Pendiente: …', …], withheld, withheldLine }

const files = folder.toFiles();          // Map path -> content, to save wherever you keep it
const zip = exportArchive(folder);       // Uint8Array, a Lore archive (spec 14)
const back = await importArchive(zip);   // LoreFolder
```

In Node.js, `src/node.mjs` adds `readFolder(dir)` and `writeFolder(dir, folder)`.

## API

| Area | Functions |
| --- | --- |
| Folder | `LoreFolder.fromFiles`, `LoreFolder.create`, `toFiles`, `paths`, `getText`, `setText`, `remove`, `file`, `me`, `slugs`, `person`, `nameOf` |
| People | `createPerson(fields)` → slug, `updatePerson(slug, patch)` (null removes a field), `deletePerson(slug)` (also removes links to them), `recordContact(slug, date)` |
| Links | `link(a, b, type)` writes both directions with the inverse type (spec 8.2), `unlink(a, b)` |
| Entries | `entries(slug, section)`, `findEntries(slug, section, text)`, `addEntry`, `updateEntry`, `completeEntry`, `removeEntry`, `giveGift` |
| Index and checks | `buildIndex`, `regenerateIndex`, `summarize(path)`, `validate()` → issues |
| Queries | `upcoming`, `overdue`, `giftHistory`, `findGiven`, `giftContext`, `brief`, `personSummary` |
| People matching | `matchPerson(folder, query)` |
| Archives | `exportArchive`, `importArchive`, `planImport`, `applyImport(current, incoming, { mode: 'replace' \| 'merge' })` |
| Files | `LoreFile.parse/create`, `get/set/delete`, `body.sections`, `body.entries(id)`, `toString()` |
| Lower level | `parseYaml`, `stringifyYaml`, `validateFrontmatter`, `parseAttributes`, `formatAttributes`, `parseEntryLine`, `formatEntryLine`, date helpers (`today`, `nextOccurrence`, `addCadence`, …), `slugify`, `readZip`, `createZip` |

Every change made through `LoreFolder` increments `folder.changes`, which an app can use to remind
the owner to export a backup.

Errors are `LoreError` objects with a `code`: `invalid` (with `errors` from the schema check),
`not-found`, `no-owner` or `bad-archive`. Parsing errors are `LoreFormatError` or `YamlError` and
carry line numbers.

## Notes

- Merging an import keeps the previous version of every changed file under
  `conflicts/<timestamp>/`, which the spec lets programs add (unknown directories are preserved).
- `src/schemas.generated.mjs` is generated from `spec/schemas` by `node tools/gen-schemas.mjs`;
  a test fails if it is out of date.

## Tests

`npm test` runs them all from the repository root. The YAML parser is checked against the `yaml`
package, the schema checker against Ajv, and the whole library is run in Chromium and WebKit to
make sure it gives the same answers in a browser as in Node.
