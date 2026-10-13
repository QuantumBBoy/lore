# Phone test: Kin 0.2 (reminders, summary, calendar, mistakes)

About 20 minutes on an iPhone with Google AI Edge Gallery and Gemma 4 E4B. It uses a made-up
person, "Prueba Kin", whom you delete at the end.

Start a new chat for each block, and whenever the model starts writing nonsense. If a step fails,
expand the tool calls under the reply and copy what the model sent and what Kin returned.

## 0. Before you start

1. `Haz una copia de seguridad` → **Compartir archivo** → *Guardar en Archivos*. Just in case.
2. Load the new `SKILL.md`: **Skills** → remove `kin` → **+** → **Load skill from URL** →
   `https://quantumbboy.github.io/lore/skills/kin` → switch it on. Your data stays.
3. In the **Skills** list, are `schedule-notification` and `create-calendar-event` there? Note
   yes or no: it decides whether Kin can schedule notifications on iPhone.

## A. A birthday reminder you receive and tap

4. `El cumpleaños de Prueba Kin es el <tomorrow's date, like "15 de octubre">` → asks whether to
   add them → `sí`.
5. Look at the clock and pick a time 3 minutes ahead, HH:MM.
   `Avísame del cumpleaños de Prueba Kin un día antes a las HH:MM`
   → *Hecho: Prueba Kin, 1 día antes.* and a reminder for today at HH:MM. The model should then
   call `run_intent` itself (look for it under the reply). If it does not, say the sentence at the
   end of Kin's answer.
6. Wait for the notification: *Kin · Cumpleaños de Prueba Kin mañana*. Tap it. Does the app open
   with *¿Qué le regalo a Prueba Kin?…* ready to send? Confirm it: Kin should answer with gift
   context.
7. Repeat step 5's sentence → *Ya te di este recordatorio… ¿Te lo doy otra vez?* → `no`.

## B. The weekly summary

8. `Mándame un resumen cada lunes a las 9` → *Hecho: un resumen cada lunes a las 09:00.* and a
   notification for next Monday (again through `run_intent`, or the sentence at the end).
9. `Kin: dame mi resumen` → at most 6 lines: dates in the next two weeks, who you haven't talked
   to, open promises.

## C. The calendar, twice

10. `Pon los cumpleaños en mi calendario` → a panel: *N nuevas o cambiadas*. Tap **Añadir N al
    calendario** → *Guardar en Archivos*. Open the file in Archivos: can you add the events to
    Calendar? Are they all-day, yearly, with an alert?
11. Ask again: `Pon los cumpleaños en mi calendario` → *Todas tus fechas (N) ya están en el
    calendario*, and the panel offers nothing new. In Calendar, Prueba Kin's birthday should be
    there once.

## D. A mistake for the evals

12. `¿Qué cumpleaños hay el finde?`
13. `No era eso, quería solo este fin de semana` → *Anotado, gracias (error 1…)*.
14. `Haz una copia de seguridad` → **Compartir errores para evals (1)** → *Guardar en Archivos*.
    Open `cases.jsonl`: are names replaced by `person_1`, `person_2`…?

## E. Clean up

15. `Borra a Prueba Kin` → `sí`. Delete Prueba Kin's event from Calendar.

## What to send back

```
Model: E2B / E4B
3  schedule-notification in Skills: yes / no · create-calendar-event: yes / no
5  Model called run_intent by itself: yes / no / had to say the sentence / failed
6  Notification arrived: yes / no · tap opened the prompt: yes / no · Kin answered: yes / no
7  Asked before repeating: yes / no
8  Weekly summary scheduled: yes / no (how)
9  Summary ≤ 6 lines and right: yes / no
10 .ics saved: yes / no · added to Calendar: yes / no · all-day / yearly / alert: yes / no
11 Second time nothing new, no duplicate: yes / no
14 cases.jsonl shared, names replaced: yes / no
Anything slow, confusing or wrong:
```
