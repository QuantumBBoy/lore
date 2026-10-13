# Changelog

Kin, lore-core and the Lore spec, newest first. The spec has its own changelog in
[Appendix B](spec/SPEC.md#appendix-b-changelog).

## Kin 0.2.0, lore-core 0.2.0, Lore spec 0.2 (draft) · 2026-10-13

Kin speaks first, through what the Gallery app offers
([research](docs/research/builtin-skills.md)).

### Kin

- **`digest`**: a summary of at most six lines: dates in the next 14 days, the three people you
  have not talked to for longest, open promises, and the backup reminder when it is due. One line
  when nothing is pending. With `every` and `at` ("cada lunes", "9:00") it sets up a notification
  that opens it: daily repeats in the app; weekly is a one-shot that each summary renews, because
  the app cannot repeat weekly. `"every": "never"` stops it.
- **`remind`**: plans reminders before dates for a person or a group (partner, family, friends,
  colleagues, everyone), at lead times by relationship (partner 14 days, family 7, friends 3,
  colleagues 1, everyone else 3) and a time of day (9:00). Both change by conversation and are
  kept in the Lore folder: `before` sets the lead time of a group (`kin.lead_days` in `me.md`) or
  of one person (in their file); `at` sets the time for a group or everyone (`kin.remind_at`), or
  for one request when it names a person.
  Each reminder comes as a line `run_intent schedule_notification {…}` with exact parameters for
  the app, at most three at a time. Kin never hands over a time in the past, never a sensitive
  date, and asks before handing over the same reminder twice. The result ends with a sentence the
  owner can say if the model did not schedule it.
- **Calendar export** (`remind` with `"calendar": true`, or the action `calendar`): a panel shares
  an `.ics` file with every birthday and date as an all-day, yearly event, with an alert at the
  lead time. What was exported is recorded in the Lore folder (`kin.calendar_birthday`,
  `kin.calendar`), so the next export has only what is new or changed; event UIDs never change.
- **`feedback`**: Kin remembers its last call. When the owner says it was wrong ("no era eso"),
  Kin stores the call and the correction. The backup panel shares the log as `cases.jsonl`, with
  names replaced by stable placeholders (`person_1`…), e-mail addresses and phone numbers removed,
  and sensitive calls emptied.
- `brief` without a person is the summary.
- `SKILL.md`: three actions and one rule for `run_intent`. 2382 → 2969 characters (about 596 →
  742 tokens).
- Kin reads and writes Lore 0.1 folders as 0.1, and refuses to change a folder from a newer
  version than it knows.

### Evals

- `evals/cases.jsonl`: logged mistakes, seeded with cases reconstructed from the 0.1 phone test.
- `tools/replay-evals.mjs` (`npm run evals`, in CI): replays how Kin reads each call against the
  current code. Cases where the model chose wrong are tracked and can only be re-run on the phone.

### lore-core 0.2.0

- Supports Lore 0.1 and 0.2: each folder is validated against the schemas of the version it
  declares, and keeps that version, `INDEX.md` included. New folders are 0.2.
- `LoreFolder#updateMe(patch)`, `version`, `writable`; `SUPPORTED_VERSIONS`.
- `validate()` no longer reports `INDEX.md` as out of date only because another program or version
  generated it.

### Lore spec 0.2

Only adds to 0.1: reminders (15.6), calendar export (15.7), the `kin` namespace's fields, and how
programs that support 0.2 treat 0.1 folders. The 0.1 spec and schemas are frozen in `spec/0.1/`
and still published at `/spec/0.1/`.

## Kin 0.1.0, lore-core 0.1.0, Lore spec 0.1 (draft) · 2026-10-13

First release: the Lore 0.1 spec and JSON Schemas, lore-core, and Kin with capture, person,
brief, gift_context, upcoming, overdue, done, update, link, delete and backup. Tested on an iPhone
([results](docs/kin/RESULTS.md)).
