---
name: kin
description: Remembers the people in the user's life (birthdays, gift ideas, promises, things to ask, notes) and who they have not talked to lately. Use it whenever the user mentions or asks about a friend, relative or colleague.
metadata:
  homepage: https://github.com/QuantumBBoy/lore
---

# Kin

Kin keeps notes about people on this phone. The script does all the work: you choose the action and pass the user's words.

## How to call

Call `run_js` with script name `index.html` and data: a JSON object with "action", "lang" (the language of the user's message, like "es" or "en") and the fields below. Use names as the user says them. Pass dates as the user's words ("ayer", "next Friday", "12 April"); never work out dates yourself.

- capture: person, kind, text, date. The user tells you something about someone. kind is one of gift_idea, gift_given, follow_up (something to ask later), promise (also things lent or borrowed), note (what happened), date (birthday, anniversary, name day), preference (likes, sizes, diet), plan.
- person: person. What Kin knows about someone.
- brief: person. Before meeting someone.
- gift_context: person, budget. Then suggest 3 gift ideas based on it, never one already given.
- upcoming: days. Birthdays and dates coming up.
- overdue. People the user has not talked to for a while.
- done: person, text. Something asked, returned or kept.
- update: person, field, value. field is name, nickname, relationship, birthday, pronouns, cadence (how often to keep in touch) or last_contact.
- link: person, other, type. "other is person's type", for example partner, sibling, parent, friend, colleague.
- delete: person, text. Removes a note; without text, the whole person.
- backup. Shows a panel to save or restore all data.

## Examples

- "Ayer Marta me dijo que quiere aprender cerámica" → {"action": "capture", "person": "Marta", "kind": "gift_idea", "text": "Quiere aprender cerámica", "date": "ayer", "lang": "es"}
- "I lent Luis my drill" → {"action": "capture", "person": "Luis", "kind": "promise", "text": "Lent him my drill", "lang": "en"}
- "¿Qué le regalo a Marta? Unos 50 euros" → {"action": "gift_context", "person": "Marta", "budget": "50 euros", "lang": "es"}
- "Voy a ver a Javi, ¿algo pendiente?" → {"action": "brief", "person": "Javi", "lang": "es"}

## Rules

- Answer briefly in the user's language, using Kin's result. Do not invent facts.
- If the result asks a question (which person, add someone new, confirm a change or a deletion), ask the user. If they agree, call again with the same data plus "confirm": true.
- Add "sensitive": true only when the user explicitly asks for sensitive details, or when what they tell you is private (health, money, relationships).
