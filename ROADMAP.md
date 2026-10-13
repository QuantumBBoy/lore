# Roadmap

Where Lore and Kin are going, roughly in order. These are directions, not promises: open an issue
to discuss any of them, or to propose something else.

Two rules hold for everything below. Data stays on devices the owner controls unless the owner
explicitly sends it somewhere. Sensitive data is filtered before any model sees it.

## Done in 0.2: Kin speaks first

Reminders before dates, a daily or weekly summary, calendar export and a mistake log for evals
([CHANGELOG.md](CHANGELOG.md)).

## Now: Kin in real use

- **Notifications on iPhone.** Check whether the iPhone app has `schedule-notification` and
  `create-calendar-event` ([research](docs/research/builtin-skills.md)). If it does not, the
  calendar alerts are how Kin reminds you on iPhone.
- **Chaining.** Measure how often the model calls `run_intent` after Kin in the same turn, and
  shorten the fallback sentence if people use it.
- **Triage the mistake log.** Turn reported mistakes into `evals/cases.jsonl` cases and fix them.
- **Storage over time.** Check that Kin's data is still there after eight or more days without
  opening it (Safari's seven-day rule for script-written storage may or may not apply in apps).
- **Offline.** Check whether Kin works without a connection once the app has loaded it before.
- **Android.** Test the same skill URL in the Android version of the Gallery app.
- **Model size.** Compare Gemma 4 E2B and E4B on the [phone test](docs/kin/PHONE-TEST.md).
- **Listing.** Share Kin in the Gallery app's community skills list.
- **Feedback.** Fix what first users run into, especially wrong actions and misread names.

## v1: bring in what you already have

Typing everything into Kin is slow. Much of it is already in your mail and calendar.

- **Gmail and Google Calendar, through a local MCP server.** A small
  [MCP](https://modelcontextprotocol.io) server that runs on your own computer, reads your mail
  and calendar with your permission, and proposes Lore entries: birthdays from calendar events,
  last contact from emails and meetings, things you promised or said you would ask. You review
  every proposal before it is written, and nothing goes to a server other than Google's own APIs,
  which you already use. The same server lets desktop assistants read your Lore folder, with the
  sensitivity rules applied before anything reaches the model.
- **Moving data between computer and phone.** Kin's backup format is the bridge: the server
  writes a Lore folder, and Kin imports it as a backup (merge, with undo).
- **Retrieval with EmbeddingGemma.** Find notes by meaning, not only by name: "who likes hiking?",
  "what did someone recommend for my knee?". Embeddings computed on the device with
  [EmbeddingGemma](https://ai.google.dev/gemma/docs/embeddinggemma), stored as derived data next
  to the folder, and never computed for sensitive entries unless the owner opts in.

## Other life areas

The spec already reserves `body/`, `training/`, `nutrition/`, `routines/` and `preferences/`
(see [section 11](spec/SPEC.md#11-other-life-areas-reserved)). Each needs fields, section ids and a
first app that proves them, as Kin did for people. Candidates: a training log a coach model can
read, food preferences and restrictions that a recipe assistant respects, routines a planning
assistant works around.

## Shared household mode

Some context belongs to more than one person: family birthdays, gift lists for the kids, a
shared calendar of visits. A household mode would let two owners share part of their folders
(chosen people or sections, never sensitive data by default) and keep them in step without a
central server, through files they already sync. This depends on the spec's open questions about
groups, households and data shared between owners.

## The spec, toward 1.0

- Settle the [open questions](spec/SPEC.md#17-open-questions): archived people, groups and
  households, pets, movable dates and other calendars, contact details and vCard.
- A conformance suite: example folders with the expected results of each computation rule, so
  other implementations can check themselves.
- A second implementation in another language, to find what the spec leaves ambiguous.
- More languages in Kin.

## Not planned

- A cloud service, accounts or sync servers run by this project.
- Sending Lore data to remote models by default.
- Ads, analytics or tracking of any kind.
