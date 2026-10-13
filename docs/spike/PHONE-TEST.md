# Phase 1 phone test: does Kin's storage survive on iPhone?

The `kin-spike` skill saves a short text to every storage API the app's webview offers
(localStorage, IndexedDB, Cache API, OPFS and a cookie), then reads them back. This test tells us
which of them survive closing the app. The core test (A to C) takes about 5 minutes.

**Skill URL** (paste it in the app):

```
https://quantumbboy.github.io/lore/skills/kin-spike
```

You need Google AI Edge Gallery with Gemma 4 E2B or E4B downloaded. E4B is better at calling tools.

## A. Load the skill

1. In Safari, open <https://quantumbboy.github.io/lore/skills/kin-spike/SKILL.md>.
   You should see plain text that starts with `---` and `name: kin-spike`.
   (<https://quantumbboy.github.io/lore/> has the same URL with a Copy button.)
2. In the Gallery app: **Agent Skills** → pick the model → tap the **Skills** chip → **(+)** →
   **Load skill from URL** → paste the skill URL → add it. Check that `kin-spike` is switched on.
   Switching the other skills off for this test helps the small model pick the right one.

Note: did it load? If not, write down the exact error text.

## B. Write and read

3. In a new chat, type: `spike write hello`

   Expected reply:

   ```
   Saved "hello" at 2026-10-13 17:02 (Europe/Madrid).
   localStorage ✓ · IndexedDB ✓ · Cache API ✓ · OPFS ✗ (…) · cookie ✓
   Total saved: 1. Next: close the app completely, reopen it, then say "spike read".
   ```

   ✓ and ✗ are both useful answers. If the model answers without running the skill, say
   `Use the kin-spike skill: spike write hello`. Expanding the skill panel under the reply shows
   the raw result and console logs.

4. Type: `spike read`

   You should get one line per storage type (`localStorage: 1 saved (first …), last "hello" …`),
   and an inline panel **Kin spike · storage check** that says
   **Same storage as the runner: YES** or **NO**.

Take a screenshot of the reply and the panel.

## C. Restart (the real test)

5. Close the app completely: swipe up from the bottom edge, pause, then swipe the Gallery card
   up and away.
6. Wait about 10 seconds, reopen the app and start a new chat with the same model.
7. Type: `spike read`

- **PASS:** `localStorage: 1 saved … last "hello"` (or more).
- **FAIL:** `localStorage: EMPTY`.

Take a screenshot showing all five storage lines and the `Origin …` line.

## D. Optional extras (about 5 minutes; each answers a question for Phase 4)

8. **Webview → runner.** In the panel from step 7, tap **Save "from webview"**, then type
   `spike read`. Does the reply now end with `last "from webview"`?
9. **Export.** In the panel, try **Download file**, **Share file**, **Copy text** and
   **Show text**. For each one, note what happened: a save dialog, a share sheet, a preview,
   or nothing? The log under the buttons shows what the page saw.
10. **Import.** Tap **Pick a file to import** and choose any small file from Files. Does the log
    show `Pick: read "…"`?
11. **Reboot.** Restart the phone, then `spike read` again.
12. **Long gap (start today, check in 8+ days).** Don't use the skill for at least 8 days, then
    run `spike read`. Safari deletes data that scripts wrote after 7 days without interaction
    with the site. Nobody has confirmed whether that rule applies inside apps, and this check
    answers it.

## E. Optional: "Import local skill"

13. In Safari open <https://quantumbboy.github.io/lore/>, tap `kin-spike-local.zip` and
    download it. In the Files app, tap the zip to unpack it into a `kin-spike-local` folder.
14. In Gallery: **Skills** → **(+)** → **Import local skill** → choose the `kin-spike-local`
    folder. This copy has a different name, so it can sit next to the URL one.
15. Type `local write hello`, then `local read`. Close the app completely, reopen it, then
    `local read` again. (The skill's reply will still say "spike read": type `local read` instead.)

Note: did it import, did the data survive, and what does the `Origin` line say?

## What to send back

Copy and fill in:

```
iPhone model / iOS version:
Gallery app version:
Model: E2B / E4B
A  Loaded from URL: yes / no (error: …)
B  Write line: localStorage ? · IndexedDB ? · Cache API ? · OPFS ? · cookie ?
B  Read worked: yes / no · panel shown: yes / no · panel says: YES / NO
C  After restart:
   localStorage:
   IndexedDB:
   Cache API:
   OPFS:
   cookie:
   Origin line:
D8  Webview write seen by runner: yes / no
D9  Download: … · Share: … · Copy: … · Show: …
D10 File picker read the file: yes / no
D11 After reboot: …
E   Local import: loaded yes / no · survived restart yes / no · origin: …
Anything odd (model didn't call the tool, errors in the skill panel, …):
```
