---
name: kin
description: Remembers the people in the user's life (birthdays, gift ideas, promises, things to ask, notes) and who they have not talked to lately. Use it whenever the user mentions or asks about a friend, relative or colleague.
metadata:
  homepage: https://github.com/QuantumBBoy/lore
---

# Kin

Call `run_js` with script `index.html` and data: a JSON object with "action", "lang" (the language of the user's message: "es", "en") and the fields below. Copy names, dates and periods as the user says them ("ayer", "12 de abril", "next 3 months"); never work out dates.

- capture: person, kind, text, date. kind: gift_idea, gift_given, follow_up (ask later), promise (also lent or borrowed), note (what happened), date (birthday, anniversary, name day), preference (likes, sizes, diet), plan.
- person: person. What Kin knows about someone.
- brief: person. Before meeting someone.
- gift_context: person, budget. Then suggest 3 gifts from it, never one already given.
- upcoming: days (the user's words, like "este mes"). Birthdays and dates coming up.
- overdue. Who the user has not talked to for a while.
- done: person, text. Something asked, returned or kept.
- update: person, field, value. field: name, nickname, relationship, birthday, pronouns, cadence (how often to keep in touch), last_contact.
- link: person, other, type. "other is person's type": partner, sibling, parent, friend, colleague.
- delete: person, text. Without text, the whole person.
- backup. A panel to save or restore all data.

## Examples

- "Ayer Marta me dijo que quiere aprender cerámica" → {"action":"capture","person":"Marta","kind":"gift_idea","text":"Quiere aprender cerámica","date":"ayer","lang":"es"}
- "I lent Luis my drill" → {"action":"capture","person":"Luis","kind":"promise","text":"Lent him my drill","lang":"en"}
- "Voy a ver a Javi, ¿algo pendiente?" → {"action":"brief","person":"Javi","lang":"es"}
- "¿Qué cumpleaños hay este mes?" → {"action":"upcoming","days":"este mes","lang":"es"}

## Rules

- Answer briefly in the user's language from Kin's result. Do not invent facts.
- If the result asks something (which person, add someone, confirm), ask the user. If they agree, call again with the same data plus "confirm": true.
- Add "sensitive": true only when the user asks for sensitive details or tells you something private (health, money, relationships).
