# Phone test: Kin

About 15 minutes. You need Google AI Edge Gallery with Gemma 4 (E4B calls tools more reliably
than E2B). Results of the first run: [RESULTS.md](RESULTS.md).

**Skill URL** (Skills → + → Load skill from URL):

```
https://quantumbboy.github.io/lore/skills/kin
```

Open the **Agent Skills** use case, tap the **Skills** chip and make sure `kin` is on. Turn
`kin-spike` off so the model only sees Kin. There is no run button: chat normally and the model
calls Kin when the message is about a person.

Two things the first run taught us:

- **Start a new chat every 8 messages or so**, and whenever the model starts writing nonsense.
  Long chats fill the on-device model's context. Kin's data does not depend on the chat.
- **Leave *Max tokens* at its default.** At 32,000 the model produced only noise.

If a step fails, expand the `run_js` block under the reply and copy what the model sent and what
Kin returned.

## A. Conversation

Type these one at a time and note what Kin answers. Kin asks before creating a person, before
overwriting and before deleting: answer "sí" when it asks. Start a new chat at step 9.

1. `Ayer Marta me dijo que quiere aprender cerámica` → asks whether to add Marta → `sí` →
   *Guardado en Marta (ideas de regalo): …*
2. `El cumpleaños de Marta es el 12 de abril`
3. `Le presté a Marta mi libro de Dune`
4. `Tengo que preguntarle a Marta qué tal su nuevo trabajo`
5. `A Marta le encanta el jazz`
6. `Marta es vegetariana`
7. `¿Qué sabes de Marta?` → birthday, the pottery idea, the lent book, the question, jazz,
   vegetarian.
8. `Mañana veo a Marta, ¿algo pendiente?` → a short brief: the question and the book.
9. *(new chat)* `¿Qué le regalo a Marta? Unos 40 euros` → 3 ideas from what Kin knows.
10. `Marta ya me devolvió el libro`
11. `Luis es la pareja de Marta` → asks whether to add Luis → `sí`
12. `Quiero hablar con Marta cada dos semanas`
13. `¿Con quién hace tiempo que no hablo?` → nobody: step 1 said "ayer", and anything you date in
    the past counts as the last time you were in touch.
14. `La última vez que hablé con Marta fue el 1 de septiembre`
15. `¿Con quién hace tiempo que no hablo?` → now Marta is overdue.
16. *(new chat)* `¿Qué cumpleaños tengo en los próximos 12 meses?` → Marta, 12 April.
17. `Borra a Luis` → asks first → `sí`

## B. Data survives

18. Close the app completely (swipe it away in the app switcher), reopen it, new chat:
    `¿Qué sabes de Marta?` → everything above, and no Luis.

## C. Backup

19. `Haz una copia de seguridad` → a panel appears. It should fit without scrolling.
20. **Guardar** tab → **Compartir archivo** → in the share sheet, *Guardar en Archivos*. Did it
    save `lore-YYYY-MM-DD.zip`?
21. **Copiar como texto** → paste in Notes. Does text appear?
22. **Recuperar** tab → **Elegir un archivo de copia** → pick the zip from step 20. Does it show
    *Esta copia tiene N personas…*? Then **Fusionar**, tap again to confirm, then **Deshacer la
    última importación**.

## What to send back

```
Model: E2B / E4B
A  Steps that did not do what you expected (number + what happened):
A  Did the model ever answer without calling Kin, or call the wrong action?
A  Replies in Spanish: yes / no
B  Data after reopening: yes / no
C19 Panel fits without scrolling: yes / no
C20 Share → saved to Files: yes / no
C21 Copy → pasted text: yes / no
C22 File picker → preview shown: yes / no · merge: yes / no · undo: yes / no
Anything slow, confusing or wrong:
```
