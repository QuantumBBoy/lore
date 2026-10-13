# Lore specification

**Version 0.1 (draft)** · 2026-10-13 · [JSON Schemas](schemas/) · License: Apache-2.0

Lore is an open, local-first file format for a person's life context: a folder of Markdown files
with YAML frontmatter. People can read and edit it in any text editor, and any language model can
read it, including small ones running on a phone. This document defines Lore 0.1.

## Contents

1. [Introduction](#1-introduction)
2. [Conventions](#2-conventions)
3. [Folder layout](#3-folder-layout)
4. [File format](#4-file-format)
5. [Value types](#5-value-types)
6. [Sensitivity](#6-sensitivity)
7. [The owner: `me.md`](#7-the-owner-memd)
8. [People: `people/<slug>.md`](#8-people-peopleslugmd)
9. [Body syntax](#9-body-syntax)
10. [The index: `INDEX.md`](#10-the-index-indexmd)
11. [Other life areas (reserved)](#11-other-life-areas-reserved)
12. [Extensions](#12-extensions)
13. [Versioning and compatibility](#13-versioning-and-compatibility)
14. [Packaging](#14-packaging)
15. [Computation rules](#15-computation-rules)
16. [Privacy and consent](#16-privacy-and-consent)
17. [Open questions](#17-open-questions)
18. [Appendix A: reading Lore with a small model](#appendix-a-reading-lore-with-a-small-model)
19. [Appendix B: changelog](#appendix-b-changelog)

## 1. Introduction

### Goals

- **Human first.** Plain Markdown that reads well on GitHub, in Obsidian or in a phone's text
  editor. A person can fix any file by hand.
- **Model friendly.** Short files, one fact per line, an index to read first. A model with a few
  thousand tokens of context can find what it needs without loading everything.
- **Local first.** The folder is the source of truth. It lives on the owner's devices; no server
  is required.
- **Private by default.** Every piece of data has a sensitivity level, and sensitive data stays
  out of anything a consumer generates unless the owner explicitly asks for it.
- **Lossless.** Programs that edit Lore must keep everything they do not understand, so hand edits
  and data from other programs survive.
- **Extensible.** Other programs can add their own fields without breaking this spec or each
  other.

### Non-goals

- Lore is not a sync protocol, a database or a contacts format. It does not replace vCard; phone
  numbers and addresses are out of scope in 0.1.
- Lore does not define a user interface or how a program talks to a model.

## 2. Conventions

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, RECOMMENDED, MAY and OPTIONAL are to be
interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all
capitals.

| Term | Meaning |
| --- | --- |
| **Lore folder** | A directory that follows this spec. Usually named `lore/`. |
| **Owner** | The person the folder belongs to and describes. |
| **Consumer** | Any program (or model acting through a program) that reads a Lore folder. |
| **Producer** | Any program that writes to a Lore folder. A program is often both. |
| **Frontmatter** | The YAML block at the start of a file. |
| **Body** | Everything after the frontmatter. |
| **Section** | Part of the body that starts with a `## ` heading. |
| **Entry** | One list item (`- …`) inside a section. |
| **Slug** | The file name of a person without `.md`, used as their identifier. |

Examples in this document use fictional people.

## 3. Folder layout

```text
lore/
├── me.md              REQUIRED  the owner (section 7); declares the spec version
├── INDEX.md           RECOMMENDED  generated index, one line per file (section 10)
├── people/            one file per person (section 8)
│   ├── marta-ruiz.md
│   └── luis-ortega.md
├── body.md            reserved (section 11)
├── training.md        reserved
├── nutrition.md       reserved
├── routines.md        reserved
├── preferences.md     reserved
└── extensions/        files owned by extensions (section 12)
    └── <namespace>/
```

- `me.md` MUST exist. Everything else is OPTIONAL.
- File and directory names are case-sensitive. Names defined by this spec are exact.
- Consumers MUST ignore files and directories they do not know, including hidden ones (names
  starting with `.`), and producers MUST NOT delete them.
- Files directly in `people/` that end in `.md` are person files. Subdirectories of `people/`
  are reserved for future versions.

## 4. File format

### 4.1 Encoding

- Files MUST be UTF-8 without a byte order mark.
- Lines MUST end with LF (`\n`). Producers MUST write LF; consumers SHOULD accept CRLF.
- Files SHOULD end with a newline.

### 4.2 Frontmatter

Every Lore file starts with frontmatter:

- The first line MUST be exactly `---`.
- The frontmatter ends at the next line that is exactly `---`.
- The text between them MUST be a YAML mapping (it MAY be empty).

The frontmatter uses a safe profile of [YAML 1.2](https://yaml.org/spec/1.2.2/):

- Consumers MUST parse it with the YAML 1.2 **core schema**. In particular, dates such as
  `1990-04-12` are strings, not timestamps, and `no`, `on` or `off` are strings, not booleans.
- Anchors (`&`), aliases (`*`), tags (`!`), merge keys (`<<`) and multiple documents MUST NOT be
  used. Consumers MAY reject files that use them.
- Keys MUST be strings. Keys defined by this spec are lowercase `snake_case`.
- Comments (`# …`) are allowed and MUST be preserved by producers (section 4.4).
- Producers SHOULD use block style, with flow sequences (`[a, b]`) only for short lists of plain
  strings. Producers SHOULD quote string values that a YAML 1.1 parser would misread
  (`yes`, `no`, `on`, `off`, `y`, `n`, `true`, `false`, `null`, `~`), and values that start with
  a YAML indicator character.

### 4.3 Body

The body is [CommonMark](https://commonmark.org/) Markdown with the conventions in section 9.
It MAY be empty.

### 4.4 Lossless editing

Lore files are edited by hand and by programs. To keep both working:

- A producer that changes part of a file MUST leave every other part byte-for-byte unchanged:
  frontmatter keys it did not change (with their comments, quoting and order), sections and
  entries it did not change, blank lines and unknown content.
- A producer MUST NOT drop fields, sections, entries, attributes or files it does not
  understand.
- When a producer adds a frontmatter key, it SHOULD add it after the existing keys. When it adds a
  section that does not exist yet, it SHOULD follow the order in section 8.3.
- A producer MUST NOT rewrite `INDEX.md` by hand-merging; it regenerates it (section 10).

## 5. Value types

The JSON Schemas in [`schemas/common.schema.json`](schemas/common.schema.json) define these
types precisely.

| Type | Format | Examples |
| --- | --- | --- |
| Full date | `YYYY-MM-DD`, a valid Gregorian date | `1990-04-12`, `2024-02-29` |
| Yearless date | `--MM-DD` (ISO 8601, as in vCard). `--02-29` is valid. | `--07-29` |
| Person date | A full date or a yearless date | birthday, entries of `dates` |
| Entry date | `YYYY-MM-DD`, `YYYY-MM` or `YYYY`, for approximate dates in the body | `2025-12`, `2019` |
| Date-time | RFC 3339 in UTC, ending in `Z` | `2026-10-13T16:00:00Z` |
| Cadence | A positive integer (1–999) and a unit: `d` days, `w` weeks, `m` months, `y` years | `10d`, `2w`, `1m`, `1y` |
| Slug | Lowercase ASCII letters and digits in groups joined by single hyphens, at most 64 characters | `marta-ruiz`, `sam-okafor-2` |
| Sensitivity level | `public`, `private` or `sensitive` | |
| Language | BCP 47 tag | `es`, `en-GB` |
| Time zone | IANA name, or `UTC` | `Europe/Madrid` |

Dates are always calendar dates without a time or time zone. They mean the same day wherever the
owner is.

## 6. Sensitivity

Sensitivity is what makes Lore safe to hand to a model. Every field, section and entry has a
sensitivity level, explicit or inherited.

### 6.1 Levels

| Level | Meaning | Who may see it |
| --- | --- | --- |
| `public` | Fine to share beyond the owner. Example: a birthday the person celebrates openly. | The owner, and outputs the owner shares with others. |
| `private` | **Default.** Personal information for the owner's own use. | The owner only. |
| `sensitive` | Information that could hurt someone if it leaked: health, sexuality, beliefs, finances, legal or immigration matters, intimate relationships, conflicts, anything told in confidence. | The owner only, and only when they explicitly ask for it. |

The levels are ordered: `public` < `private` < `sensitive`. A value other than these three MUST be
treated as `sensitive` (fail closed).

### 6.2 Where levels are set

| Scope | How | Example |
| --- | --- | --- |
| File | `sensitivity: <level>` in the frontmatter | `sensitivity: sensitive` |
| Frontmatter field | `sensitivity:` as a map, with `default` for the file and one key per field | `sensitivity: {default: private, birthday: public}` |
| List item in the frontmatter | `sensitivity:` inside the item (items of `dates` and `links`) | `- {label: …, date: …, sensitivity: sensitive}` |
| Section | Attribute on the heading | `## Health {sensitive}` |
| Entry | Attribute at the end of the entry | `- 2026-05-11: Thinking of quitting. {sensitive}` |

In attribute blocks (section 9.5) a bare level (`{sensitive}`) and the long form
(`{sensitivity=sensitive}`) mean the same.

### 6.3 Inheritance

The effective level of a piece of data is the **nearest explicit level**, looking outwards:

1. Frontmatter field: its key in the `sensitivity` map → the file level → `private`.
2. Item of `dates` or `links`: the item's `sensitivity` → the field's key in the map → the file
   level → `private`.
3. Section: its heading attribute → the file level → `private`.
4. Entry: its own attribute → its section → the file level → `private`.
5. Text in the body that is not an entry (paragraphs, sub-lists, the introduction before the first
   section): its section, or the file level for the introduction.

An explicit level can be lower than its parent's: a `public` birthday in a `private` file is
public. This lets the owner open up one fact without opening the whole file.

The file level is the string value of `sensitivity`, or its `default` key when it is a map.

### 6.4 Rules for consumers

1. A consumer MUST NOT output sensitive data unless the owner's **current request explicitly
   asks for it**: it names the person or topic and asks for that information ("what did Javi say
   about his surgery?") or asks to include sensitive data ("show everything about Luis, including
   sensitive notes"). A general request ("tell me about Javi", "brief me before meeting Javi",
   "gift ideas for Javi") is not explicit. The permission covers that request only.
2. When a consumer hands Lore content to a language model, it MUST remove sensitive data
   **before** the content reaches the model, unless rule 1 allows it for this request. Telling the
   model not to repeat it is not enough.
3. A consumer MAY say that it withheld sensitive items and how to ask for them ("1 sensitive note
   hidden: ask to see it"), without revealing their content.
4. Generated files and any output that is stored, sent or shared (the index, notifications,
   calendar events, share sheets, exports to other formats) MUST NOT contain sensitive data.
   Content the owner shares with other people MUST contain only `public` data unless the owner
   picks each item.
5. Private and sensitive data MUST NOT leave the owner's devices (for example, be sent to a remote
   service or model) without the owner's explicit, informed action.
6. A full backup of the folder (section 14) contains everything, because it is the owner's own
   data. Consumers SHOULD tell the owner that backups contain sensitive data.

### 6.5 Rules for producers

- Producers MUST NOT lower the level of existing data without the owner's explicit request.
- When capturing information that falls into the `sensitive` categories of section 6.1, a producer
  SHOULD mark it `sensitive` or ask the owner.
- Paths are never protected: `INDEX.md` lists every file by path. When the existence of a person
  is itself sensitive, producers SHOULD use a neutral slug (for example `contact-7`) and mark the
  `name` field sensitive.

## 7. The owner: `me.md`

`me.md` describes the owner and declares the spec version of the folder. Schema:
[`schemas/me.schema.json`](schemas/me.schema.json).

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `lore` | yes | string `"0.1"` | Spec version of the folder. MUST be a quoted string. |
| `name` | yes | string | The owner's name. |
| `aliases` | no | list of strings | Other names. |
| `pronouns` | no | string | For example `they/them`. |
| `birthday` | no | person date | |
| `language` | no | language tag | Language for replies and generated text. Content may be in any language. |
| `timezone` | no | time zone | Home time zone. Only used when the device's time zone is unknown (section 15.1). |
| `leap_day` | no | `feb28` or `mar1` | When 29 February dates are observed in common years. Default `feb28`. |
| `sensitivity` | no | level or map | Section 6.2. |
| `<namespace>.<field>` | no | any | Extension fields (section 12). |

The body is free Markdown about the owner. Lore 0.1 defines no sections for it.

<!-- example: me -->
```markdown
---
lore: "0.1"
name: Alex Moreno
pronouns: they/them
birthday: 1991-05-23
language: es
timezone: Europe/Madrid
kin.export_every_days: 30
---

# Alex Moreno

Product designer in Madrid.
```

## 8. People: `people/<slug>.md`

One file per person the owner wants to remember. The slug is the person's identifier: other files
refer to the person by slug, and it does not change when their name does. Schema:
[`schemas/person.schema.json`](schemas/person.schema.json).

### 8.1 Slugs

- A slug follows the type in section 5.
- Producers SHOULD derive it from the name: lowercase, letters with diacritics replaced by their
  base letter (`á` → `a`, `ñ` → `n`, `ß` → `ss`), any other run of characters replaced by one
  hyphen, leading and trailing hyphens removed, cut to 64 characters. If the slug is taken, they
  append `-2`, `-3`, and so on.
- Renaming a slug means renaming the file and updating every `links` entry that points to it.

### 8.2 Frontmatter

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `name` | yes | string | Display name, e.g. `Marta Ruiz`. |
| `aliases` | no | list of strings | Nicknames, diminutives, other spellings, e.g. `[Martita]`. Used to recognise the person. |
| `pronouns` | no | string | For example `she/her`. |
| `relationship` | no | string | Relationship to the owner, in a word or two: `friend`, `mother`, `colleague`. Any language. |
| `birthday` | no | person date | `1990-04-12`, or `--04-12` when the year is unknown. |
| `dates` | no | list of date items | Other yearly dates (below). |
| `contact_cadence` | no | cadence | How often the owner wants to be in touch, e.g. `2w`. |
| `last_contact` | no | full date | When they were last in touch. |
| `links` | no | list of links | Relationships to other people in the folder (below). |
| `sensitivity` | no | level or map | Section 6.2. Keys of the map: `default` and the field names above. |
| `<namespace>.<field>` | no | any | Extension fields (section 12). |

**Date items** (`dates`):

| Key | Required | Type | Meaning |
| --- | --- | --- | --- |
| `label` | yes | string | What the date is: `Wedding anniversary`, `Santo`, `Name day`. |
| `date` | yes | person date | |
| `recurring` | no | boolean | `true` (default): repeats every year on the same month and day. `false`: happens once. A yearless date is always recurring. |
| `kind` | no | `anniversary`, `name_day`, `memorial`, `other` | Lets consumers group dates. |
| `sensitivity` | no | level | |

Name days ("santo") are written as yearless dates. Lore 0.1 has no movable dates (for example,
dates relative to Easter).

**Links** (`links`): `{person: <slug>, type: <type>}` means "*person* is this person's *type*".
In `marta-ruiz.md`, `{person: luis-ortega, type: partner}` says that Luis is Marta's partner.

- `type` is lowercase ASCII words joined by hyphens. Consumers SHOULD understand this vocabulary:

  | Type | Inverse |
  | --- | --- |
  | `partner` | `partner` |
  | `spouse` | `spouse` |
  | `ex-partner` | `ex-partner` |
  | `parent` | `child` |
  | `child` | `parent` |
  | `sibling` | `sibling` |
  | `grandparent` | `grandchild` |
  | `grandchild` | `grandparent` |
  | `aunt-uncle` | `niece-nephew` |
  | `niece-nephew` | `aunt-uncle` |
  | `cousin` | `cousin` |
  | `in-law` | `in-law` |
  | `friend` | `friend` |
  | `colleague` | `colleague` |
  | `manager` | `report` |
  | `report` | `manager` |
  | `neighbor` | `neighbor` |

- Producers SHOULD write both directions: when Luis is Marta's partner, Marta is also Luis's
  partner. For types outside the table they write only the direction they know.
- `person` MUST be the slug of a file in `people/`. Consumers MUST tolerate links to missing files
  (for example after a manual delete) and SHOULD report them.
- The owner is not linked this way; `relationship` describes the owner's side.

### 8.3 Sections

A person file's body MAY start with a level-1 heading (usually the name) and a short introduction.
After that come sections. Lore 0.1 defines these, in this recommended order:

| Id | Canonical heading | Entries |
| --- | --- | --- |
| `likes` | `Likes & dislikes` | Free text. The words carry the meaning: `Loves jazz`, `Dislikes strong perfume`. |
| `sizes` | `Sizes` | `Label: value`, e.g. `Shoes: EU 38`. |
| `diet` | `Dietary restrictions` | Free text, e.g. `Vegetarian`, `Allergic to peanuts`. |
| `gift-ideas` | `Gift ideas` | Pending ideas. Date = when noted. Attributes: `price`, `occasion`. |
| `gifts-given` | `Gifts given` | Date REQUIRED (entry date). Text = the item. Attribute: `occasion`, `price`. |
| `plan-ideas` | `Plan ideas` | Things to do together. Optional checkbox; date = when noted. |
| `follow-ups` | `Follow-ups` | Things to ask about later. Checkbox REQUIRED; date = when noted; attribute `due`. |
| `promises` | `Promises` | Checkbox REQUIRED; date = when made. Attributes: `type` (`promised` default, `lent`, `borrowed`), `status`, `due`. |
| `notes` | `Notes log` | Dated notes. Date REQUIRED. Newest first. |

Details:

- **Gift ideas** are pending. When an idea is given, producers move it to *Gifts given* with the
  date it was given.
- **Promises** cover what the owner promised the person (`type=promised`), lent them
  (`type=lent`) or borrowed from them (`type=borrowed`). `[ ]` is open; `[x]` is kept or
  returned. `status=cancelled` closes an entry that was not kept.
- **Follow-ups** are open while unchecked. `due` is an optional full date.
- **Notes log** entries SHOULD be newest first, so a reader that stops early sees the latest.
  Consumers MUST NOT rely on the order of entries in any section.
- Sections may appear in any order, and any section may be missing or empty.
- Producers MAY add other sections. Consumers MUST preserve sections they do not know and MAY
  show them to the owner, respecting their sensitivity.

### 8.4 Example

<!-- example: person -->
```markdown
---
name: Marta Ruiz
aliases: [Martita]
pronouns: she/her
relationship: friend
birthday: 1990-04-12
dates:
  - label: Santa Marta
    date: --07-29
    kind: name_day
contact_cadence: 2w
last_contact: 2026-09-28
links:
  - person: luis-ortega
    type: partner
---

# Marta Ruiz

Friend from university. Architect.

## Likes & dislikes

- Loves handmade ceramics
- Jazz, especially Chet Baker
- Dislikes strong perfume

## Sizes

- Shoes: EU 38

## Dietary restrictions

- Vegetarian

## Gift ideas

- 2026-09-28: Pottery class, she wants to learn {price="60 EUR"}

## Gifts given

- 2025-12-24: Ceramic mug from a local workshop {occasion=Christmas}

## Plan ideas

- [ ] Visit the Sorolla museum together

## Follow-ups

- [ ] 2026-09-28: Ask how the new job is going {due=2026-10-15}

## Promises

- [ ] 2026-09-28: Send her the paella recipe
- [ ] 2026-07-02: Lent her "The Left Hand of Darkness" {type=lent}

## Notes log

- 2026-09-28: Coffee. Started a new job at a small studio.
- 2026-08-10: Dinner with Luis and Marta. Planning a trip to Lisbon.
```

## 9. Body syntax

These rules make the body easy to parse without losing what people write by hand.

### 9.1 Sections

- A section starts at a line that begins with `## ` (exactly two `#` and a space) and ends before
  the next such line or the end of the file. Deeper headings (`###`) belong to the current
  section.
- The heading text MAY end with an attribute block (section 9.5).
- A section is identified by:
  1. an `#id` in its attribute block, if present (`## Ideas de regalo {#gift-ideas}`);
  2. otherwise its heading text, compared with the canonical headings case-insensitively after
     trimming spaces.
- Headings can therefore be written in any language with an `#id`. Producers SHOULD write the
  canonical English heading unless the owner chose another language, and then SHOULD include the
  `#id`.
- If two sections have the same id, consumers MUST treat their entries as one section, in file
  order, and producers SHOULD add new entries to the first one.

### 9.2 Entries

An entry is a list item at the start of a line (no indentation) inside a section:

```text
- [ ] 2026-09-28: Ask how the new job is going {due=2026-10-15}
│ │   │           │                          └ attribute block (9.5), optional
│ │   │           └ text
│ │   └ entry date (9.4), optional: "YYYY-MM-DD: ", "YYYY-MM: " or "YYYY: "
│ └ checkbox (9.3), optional
└ list marker
```

- Producers MUST write `- ` as the list marker. Consumers SHOULD also accept `* ` and `+ `.
- An entry SHOULD fit on one line. Lines after it that are indented by at least two spaces belong
  to the entry (a continuation). A blank line followed by an unindented line ends it.
- The text is inline Markdown. It MUST NOT be empty once the checkbox, date and attributes are
  removed.
- Content inside a section that is not an entry (paragraphs, tables, quotes) is allowed and MUST
  be preserved. It is not an entry.

### 9.3 Checkboxes

`[ ]` marks an open entry and `[x]` (or `[X]`) a done one, as in GitHub task lists. The checkbox
comes right after the list marker and is followed by a space.

### 9.4 Entry dates

An entry date is a full date, `YYYY-MM` or `YYYY` (section 5), at the start of the text (after the
checkbox), followed by a colon and a space. Text that merely starts with a number is not a date:
`- 2 tickets for the concert` has no date.

### 9.5 Attribute blocks

An attribute block is `{…}` at the very end of a heading or of an entry's first line, preceded by a
space. Inside, tokens are separated by single spaces:

| Token | Meaning | Where |
| --- | --- | --- |
| `public`, `private`, `sensitive` | Sensitivity level | headings, entries |
| `#<id>` | Section id | headings |
| `key=value` | Attribute with a value without spaces, braces or quotes | headings, entries |
| `key="value"` | Attribute with any value. Inside quotes, `\"` is a quote and `\\` a backslash. | headings, entries |

- Keys are lowercase: a letter followed by letters, digits, `_` or `-`. Extension keys add a
  namespace (`kin.source=voice`, section 12).
- A key MUST NOT appear twice in a block.
- If the braces at the end of a line do not parse as an attribute block, they are ordinary text.
  To end an entry with literal braces, add a final full stop or other character after them.

Attributes defined in 0.1:

| Key | Value | Used in |
| --- | --- | --- |
| `sensitivity` | level | anywhere (same as the bare level) |
| `due` | full date | follow-ups, promises |
| `type` | `promised`, `lent`, `borrowed` | promises |
| `status` | `cancelled` | promises, follow-ups, plan ideas |
| `occasion` | text | gift ideas, gifts given |
| `price` | text, e.g. `"60 EUR"` | gift ideas, gifts given |

Consumers MUST preserve attributes they do not know.

## 10. The index: `INDEX.md`

`INDEX.md` lets a model with little context find the right file without opening every file. It is
**generated**: producers regenerate it after every change, and hand edits are lost. Schema:
[`schemas/index.schema.json`](schemas/index.schema.json).

Frontmatter:

| Field | Required | Meaning |
| --- | --- | --- |
| `lore` | yes | Spec version, as in `me.md`. |
| `generated` | yes | Date-time of generation (UTC). |
| `generator` | no | Program name and version. |

Body:

- A level-1 heading and at most one short paragraph, then one entry per Lore file in the folder
  (except `INDEX.md` itself and files under `extensions/`):
  `- <path> — <summary>`, with the path relative to the folder and ` — ` (space, em dash, space)
  between path and summary.
- Order: `me.md`, then the other top-level files alphabetically, then `people/` files
  alphabetically by path.
- The summary SHOULD be under 120 characters and SHOULD help decide whether to open the file. For
  people: name, aliases, relationship and links.
- The index MUST NOT contain sensitive data (section 6.4, rule 4). When a person's `name` is
  sensitive, the summary is just `sensitive`.
- The index MAY contain private data. It is part of the folder and stays on the owner's devices.

<!-- example: index -->
```markdown
---
lore: "0.1"
generated: "2026-10-13T16:00:00Z"
generator: lore-core 0.1.0
---

# Lore index

Generated. Do not edit. Open only the files you need.

- me.md — Alex Moreno (owner)
- people/luis-ortega.md — Luis Ortega — friend; partner of Marta Ruiz
- people/marta-ruiz.md — Marta Ruiz (aka Martita) — friend; partner of Luis Ortega
```

## 11. Other life areas (reserved)

Lore will grow beyond people. Lore 0.1 reserves these files and gives each a skeleton so early
adopters can write compatible content. Consumers MUST preserve them. Their frontmatter follows
[`schemas/area.schema.json`](schemas/area.schema.json): `sensitivity` and extension fields are
defined; any other field is allowed and kept.

| File | Purpose | Default level | Suggested sections |
| --- | --- | --- | --- |
| `body.md` | Health and body data | `sensitive` (producers SHOULD set it explicitly) | `Measurements` (dated entries), `Conditions`, `Medications`, `Allergies` |
| `training.md` | Exercise | `private` | `Goals`, `Plan`, `Log` (dated entries) |
| `nutrition.md` | Eating | `private` | `Goals`, `Restrictions`, `Log` (dated entries) |
| `routines.md` | Daily and weekly habits | `private` | `Morning`, `Evening`, `Weekly` |
| `preferences.md` | The owner's own tastes, so others' gifts and plans fit | `private` | `Food`, `Brands`, `Style`, `Travel`, `Gift ideas for me` |

Entries in these files follow section 9. Their fields and section ids will be defined in later
versions.

## 12. Extensions

Programs can add their own data in a **namespace**, using one rule everywhere: an extension name is
`<namespace>.<name>`, and the namespace is everything before the last dot.

| Where | Form | Example |
| --- | --- | --- |
| Frontmatter field | `<namespace>.<field>: value` | `kin.export_every_days: 30` |
| Item in `dates` or `links` | `<namespace>.<key>: value` | `kin.source: voice` |
| Attribute of a heading or entry | `<namespace>.<key>=value` | `{kin.source=voice}` |
| Section id | `{#<namespace>.<id>}` | `## Reminders {#kin.reminders}` |
| Files | `extensions/<namespace>/…` | `extensions/kin/state.json` |

- A namespace is either a **registered name** (one lowercase segment, listed below) or a
  **reverse domain name** the author controls (two or more segments, e.g. `com.example.fitness`).
  Unregistered one-segment namespaces are reserved.
- Extension values MAY be any YAML value.
- Consumers MUST ignore extensions they do not understand, and producers MUST preserve them
  (section 4.4).
- An extension MUST NOT change the meaning of core fields, and MUST NOT make data less sensitive
  than it is. Extension data has the level of the place it sits in.
- Ideas that prove useful may move into the core in a later version, without the namespace.

**Registry**

| Namespace | Owner | Purpose |
| --- | --- | --- |
| `kin` | [Kin](https://github.com/QuantumBBoy/lore) | Settings and capture metadata of the Kin app. |

To register a namespace, open a pull request that adds a row.

## 13. Versioning and compatibility

- The spec has versions `MAJOR.MINOR`. Before 1.0, any minor version MAY break compatibility; each
  release documents migrations in Appendix B. From 1.0 on, a minor version only adds optional
  fields, sections, attributes, areas or values, and a major version may break.
- A folder declares its version in `me.md` (`lore: "0.1"`). It applies to every file in the
  folder.
- A consumer that supports the declared version reads the folder normally.
- A consumer that finds a version it does not support:
  - MAY read the folder on a best-effort basis and SHOULD tell the owner;
  - MUST NOT write to it, unless both versions are 1.0 or later with the same major version, in
    which case it writes following section 4.4.
- Upgrading a folder to a new version is an explicit action of the owner, done by a program that
  supports both versions.
- The JSON Schemas of each version are published under `https://quantumbboy.github.io/lore/spec/<version>/`
  and never change after release, except for errata.

## 14. Packaging

A **Lore archive** carries a whole folder as one file, for backups and moving between programs.

- It is a ZIP file whose entries are under one top-level directory named `lore/`, containing the
  folder exactly as on disk, including unknown files and `extensions/`.
- File names in the archive are UTF-8.
- An archive MUST contain `lore/me.md`. Importers MUST ignore other top-level entries.
- The suggested file name is `lore-YYYY-MM-DD.zip`.
- Importers MUST NOT silently overwrite existing data. They SHOULD ask the owner whether to
  replace the folder or merge, and on merge SHOULD keep both versions of conflicting files.

## 15. Computation rules

Consumers that offer these features SHOULD follow these rules, so the same folder gives the same
answers in every program.

### 15.1 Today

- "Today" MUST come from the device clock, in the device's time zone. If the time zone is
  unknown, use `me.md`'s `timezone`, then UTC. A language model MUST NOT be the source of the
  current date.

### 15.2 Upcoming dates

- Birthdays always recur. An item of `dates` recurs unless `recurring: false`.
- The next occurrence of a recurring date is this year's month and day if it is today or later,
  otherwise next year's.
- In a common year, `--02-29` (or a full date on 29 February) is observed on 28 February, or on
  1 March when `me.md` sets `leap_day: mar1`.
- A non-recurring date occurs once, on its full date.
- "Upcoming in the next N days" includes today and today + N days.
- An age or anniversary number is given only when the year is known: occurrence year minus the
  date's year.

### 15.3 Contact cadence

- The next contact is due on `last_contact` plus `contact_cadence`. Adding months or years keeps the
  day of the month, moving to the last day of the month when it does not exist (31 January + 1m =
  28 or 29 February).
- A person is **overdue** when today is after that due date. Days overdue = today − due date.
- A person with a cadence and no `last_contact` is reported separately as "no contact recorded".

### 15.4 Matching gifts

To avoid repeating gifts, compare texts after normalising them: Unicode NFKD, remove diacritics,
lowercase, replace punctuation with spaces, collapse spaces. A pending idea that equals, or
contains, or is contained in a given gift's text is a likely repeat.

### 15.5 Recognising people

When the owner names someone, consumers SHOULD match the name against `name` and `aliases` of
every person, ignoring case and diacritics. If more than one person matches equally well, the
consumer MUST ask the owner which one they mean, and MUST NOT write anything until they answer.

## 16. Privacy and consent

A Lore folder holds information about people other than its owner, who never agreed to be in it.

- Store what helps you be a better friend, partner or relative. Do not store what you would be
  uncomfortable for them to read.
- Mark what was shared in confidence as `sensitive`.
- Keep it accurate. Delete what you no longer need.
- Do not share a person's data with others without a good reason, and never their sensitive data.

Producers SHOULD make it easy to review, correct and delete what is stored about a person.

## 17. Open questions

To be settled in later versions:

- Archived people (deceased, lost contact) and how they affect reminders.
- Groups and households, and data shared between owners.
- Pets.
- Movable dates (for example, relative to Easter) and dates in other calendars.
- Contact details, and how Lore relates to vCard.
- Section ids and fields for the reserved life areas (section 11).

## Appendix A: reading Lore with a small model

For programs that let a model read Lore directly:

1. Read `INDEX.md` first. Open only the files needed for the request.
2. Read frontmatter for facts, and only the sections needed (for a gift: `likes`, `gift-ideas`,
   `gifts-given`).
3. Apply section 6 before the model sees anything: drop sensitive data unless the owner asked for
   it explicitly.
4. Compute dates in code (section 15), not in the model.

## Appendix B: changelog

### 0.1 (draft, 2026-10-13)

First version: folder layout, `me.md`, people, `INDEX.md`, sensitivity, body syntax, reserved life
areas, extensions, versioning, packaging and computation rules.
