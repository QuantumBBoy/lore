# Draft: post for the AI Edge Gallery Skills discussions

For the "Share Your Skill" form in the
[Skills category](https://github.com/google-ai-edge/gallery/discussions/categories/skills) of
google-ai-edge/gallery. Copy each field into the form. Before posting, check that the
[skill URL](https://quantumbboy.github.io/lore/skills/kin/SKILL.md) opens in a browser, and add a
screenshot or two from the phone if you can.

---

**Title**

```
Kin: remember the people in your life, fully on-device
```

**Skill Webhost Path**

```
https://quantumbboy.github.io/lore/skills/kin
```

**Skill Source Repository**

```
https://github.com/QuantumBBoy/lore/tree/main/skills/kin
```

**Skill Description**

```markdown
Kin helps you remember the people in your life: birthdays and other dates, gift ideas and gifts
already given, things to ask someone next time, promises and things lent, likes, sizes, food
restrictions, and who you haven't talked to in a while. Just talk about people in a chat and the
model calls Kin.

It can also speak first: it plans reminders before birthdays (lead times by relationship, set by
talking) and hands them to the schedule-notification skill, sends you a daily or weekly summary,
and exports your dates to the calendar as yearly all-day events with alerts.

It is local-first and makes no network requests: everything stays in the app's storage on your
phone, and every page has a Content-Security-Policy that blocks all connections. No API key or
account needed. Sensitive notes (health, money, relationships) are kept away from the model unless
you ask for them. A backup panel lets you save everything as a .zip through the share sheet, or copy
it as text, and restore it later.

Kin stores its data in Lore, an open format for personal context (Markdown files with YAML
frontmatter), so your notes are readable files you can take elsewhere:
https://github.com/QuantumBBoy/lore

**Try it** (English or Spanish, it answers in the language you write in):

- "Yesterday Marta told me she wants to learn pottery" → asks whether to add Marta, then saves a gift idea
- "Marta's birthday is April 12"
- "I lent Luis my drill"
- "I'm seeing Marta tomorrow, anything I should remember?"
- "What should I get Marta? Around 40 euros"
- "Any birthdays in the next 3 months?"
- "Who haven't I talked to in a while?"
- "Remind me two weeks before my family's birthdays"
- "Send me a summary every Monday at 9"
- "Put the birthdays in my calendar"
- "Backup" → a panel to save or restore everything

**Tips**

- Gemma 4 E4B picks the right action more often than E2B.
- Start a new chat every few requests: long chats fill the on-device model's context. Kin's data
  does not depend on the chat.
- Leave Max tokens at its default; very high values made the model output noise on an iPhone.

Tested on iPhone. Kin keeps its data in the webview's localStorage for the skill's origin, so it is
kept across app restarts; back up now and then, since deleting the app deletes the data.
Open source, Apache-2.0. Feedback and issues welcome.
```
