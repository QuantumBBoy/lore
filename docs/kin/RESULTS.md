# Phase 4 results

Phone test of Kin (see [PHONE-TEST.md](PHONE-TEST.md)) on an iPhone with Google AI Edge Gallery and
Gemma 4, on 2026-10-13. The model size (E2B or E4B) was not recorded.

| Check | Result |
| --- | --- |
| Conversation, steps 1–15: capture, person, brief, gift context, done, link, update, overdue | Works, replies in Spanish |
| Step 16, upcoming, late in a long chat | **Model output turned to noise**; the app showed the broken tool call as text and Kin never ran |
| Step 16 again, in a new chat | Works |
| Step 17, delete, after raising *Max tokens* to 32,000 | **Model output was noise from the first token** |
| Step 17 again, with *Max tokens* back to its earlier value, new chat | Works |
| Data after fully closing and reopening the app | Persists |
| Backup panel: share a `.zip` to Files | Works |
| Backup panel: copy as text | Works |
| Backup panel: file picker, preview, merge, undo | Works |
| Backup panel layout | Had to scroll to see all of it |

## What we learned

- **Long chats break the model.** Each Kin call adds the call, Kin's result and the reply to the
  chat. After about fifteen of them, the on-device model ran out of context and produced noise.
  A new chat fixes it, and Kin's data does not depend on the chat. The README and the test script
  now say to start a new chat every few requests.
- **Do not raise *Max tokens* far above the default.** At 32,000 the model produced noise at once,
  probably because the on-device model or the phone's memory does not support that context size.
- **The model should not count days.** "Los próximos 12 meses" required the model to turn months
  into days; that was not the cause of the failure (it worked in a new chat), but it is a step a
  small model can get wrong. `upcoming` now takes the user's words, like dates already did.

## Changes after the test

- The backup panel has Save and Restore tabs and a card about as tall as it is wide; a test checks
  that every state fits at iPhone widths without scrolling.
- `upcoming` accepts "este mes", "next 3 months", "el año que viene" and similar.
- `SKILL.md` is shorter, and a test keeps it in step with Kin's actions.
- Anything the user dates in the past ("ayer Marta me dijo...") now counts as the last contact,
  not only notes. Undated captures, birthdays and future dates do not.

## Still open

- Long gap: read Kin's data again after 8+ days without using it.
- Which model size works better day to day (E2B or E4B).
