# Phase 4 phone test: Kin

About 15 minutes. You need Google AI Edge Gallery with Gemma 4 (E4B calls tools more reliably
than E2B).

**Skill URL** (Skills → + → Load skill from URL):

```
https://quantumbboy.github.io/lore/skills/kin
```

Turn `kin-spike` off so the model only sees Kin. Kin keeps its data under its own keys, so the
spike's test data does not interfere.

## A. Conversation

Type these one at a time, in a new chat, and note what Kin answers. Kin asks before creating a
person, before overwriting and before deleting: answer "sí" when it asks.

1. `Ayer Marta me dijo que quiere aprender cerámica` → asks whether to add Marta → `sí` →
   *Guardado en Marta (ideas de regalo): …*
2. `El cumpleaños de Marta es el 12 de abril`
3. `Le presté a Marta mi libro de Dune`
4. `Tengo que preguntarle a Marta qué tal su nuevo trabajo`
5. `A Marta le encanta el jazz` and `Marta es vegetariana`
6. `¿Qué sabes de Marta?`
7. `Mañana veo a Marta, ¿algo pendiente?`
8. `¿Qué le regalo a Marta? Unos 40 euros` → the model should suggest gifts using Kin's context.
9. `Marta ya me devolvió el libro`
10. `Luis es la pareja de Marta` → asks whether to add Luis → `sí`
11. `Quiero hablar con Marta cada dos semanas`
12. `¿Qué cumpleaños hay en los próximos meses?` (try `upcoming` with a few people)
13. `¿Con quién hace tiempo que no hablo?`
14. `Borra a Luis` → asks first → `sí`

## B. Data survives

15. Close the app completely, reopen it, new chat: `¿Qué sabes de Marta?`

## C. Backup

16. `Haz una copia de seguridad` → a panel appears.
17. **Compartir archivo** → in the share sheet, *Guardar en Archivos*. Did it save
    `lore-YYYY-MM-DD.zip`?
18. **Copiar como texto** → paste in Notes. Does text appear?
19. **Elegir un archivo de copia** → pick the zip from step 17. Does it show *Esta copia
    tiene N personas…*? Then **Fusionar**, tap again to confirm, then **Deshacer la última
    importación**.

## What to send back

```
Model: E2B / E4B
A  Steps that did not do what you expected (number + what happened):
A  Did the model ever answer without calling Kin, or call the wrong action?
A  Replies in Spanish: yes / no
B  Data after reopening: yes / no
C17 Share → saved to Files: yes / no
C18 Copy → pasted text: yes / no
C19 File picker → preview shown: yes / no · merge: yes / no · undo: yes / no
Anything slow, confusing or wrong:
```
