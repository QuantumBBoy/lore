// Kin end to end in Node: the JSON the model sends in, the JSON the app gets back, and what ends up
// in storage. The same scenarios run in a browser in tests/kin.browser.test.mjs.

import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, test } from 'node:test';
import { readFolder } from '../../lore-core/src/node.mjs';
import { handle } from '../src/kin.mjs';
import { MemoryStorage, loadFolder, readMeta, saveFolder } from '../src/store.mjs';
import { appOutcome } from '../../tests/helpers/gallery-app.mjs';

const EXAMPLE = join(fileURLToPath(new URL('../..', import.meta.url)), 'examples', 'lore');
const NOW = new Date('2026-10-13T10:00:00Z');

let storage;
function call(data, { now = NOW, raw = false } = {}) {
  const out = handle(raw ? data : JSON.stringify(data), { storage, now });
  const outcome = appOutcome(out);
  assert.ok(outcome.parsed, `the app could not parse: ${out}`);
  return outcome;
}
const say = (data, opts) => call(data, opts).result;
const fileText = (path) => storage.getItem(`lore:v1:file:${path}`);
const folder = () => loadFolder(storage).folder;

function withExample() {
  storage = new MemoryStorage();
  saveFolder(storage, readFolder(EXAMPLE));
}

describe('an empty phone', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  test('read actions say there is nothing yet', () => {
    assert.equal(say({ action: 'upcoming', lang: 'en' }), 'Kin has no data yet. Tell me something about someone to start.');
    assert.equal(storage.length, 0);
  });

  test('asks before creating the first person, then creates the folder', () => {
    const ask = say({ action: 'capture', person: 'Marta', kind: 'gift_idea', text: 'Wants to learn pottery', lang: 'en' });
    assert.equal(ask, 'I don\'t know anyone called "Marta". Should I add "Marta" as a new person?');
    assert.equal(storage.length, 0, 'nothing written before confirmation');
    const ok = say({ action: 'capture', person: 'marta ruiz', kind: 'gift_idea', text: 'Wants to learn pottery', lang: 'en', confirm: true });
    assert.equal(ok, 'Added Marta Ruiz. Saved for Marta Ruiz (gift ideas): Wants to learn pottery');
    assert.match(fileText('me.md'), /^---\nlore: "0\.1"\nname: Me\nlanguage: en\n/);
    assert.match(fileText('people/marta-ruiz.md'), /## Gift ideas\n\n- 2026-10-13: Wants to learn pottery\n/);
    assert.match(fileText('INDEX.md'), /- people\/marta-ruiz\.md — Marta Ruiz\n/);
    for (let i = 0; i < storage.length; i++) assert.ok(storage.key(i).startsWith('lore:v1:'), storage.key(i));
    assert.deepEqual(folder().validate({ now: NOW }), []);
  });
});

describe('capture', () => {
  beforeEach(withExample);

  test('the brief example: "Yesterday Marta said she wants to learn pottery"', () => {
    const before = fileText('people/marta-ruiz.md');
    const r = say({ action: 'capture', person: 'Marta', kind: 'gift_idea', text: 'Quiere aprender cerámica', date: 'ayer', lang: 'es' });
    assert.equal(r, 'Guardado en Marta Ruiz (ideas de regalo): Quiere aprender cerámica');
    const after = fileText('people/marta-ruiz.md');
    assert.equal(after, before.replace('- 2026-06-02: Vinyl of "Chet Baker Sings"\n', '- 2026-06-02: Vinyl of "Chet Baker Sings"\n- 2026-10-13: Quiere aprender cerámica\n'));
  });

  test('replies in English when asked to', () => {
    assert.equal(say({ action: 'capture', person: 'Sam', kind: 'note', text: 'Lunch at the office', lang: 'en' }), 'Saved for Sam Okafor (notes): Lunch at the office');
  });

  test('ambiguous names are a question, and nothing changes', () => {
    const before = fileText('people/javier-moreno.md');
    assert.equal(say({ action: 'capture', person: 'Moreno', kind: 'note', text: 'x', lang: 'es' }), '¿A quién te refieres con "Moreno": Carmen Moreno o Javier Moreno?');
    assert.equal(fileText('people/javier-moreno.md'), before);
  });

  test('unknown people: suggestions, then creation only with confirm', () => {
    assert.equal(say({ action: 'capture', person: 'Paula', kind: 'note', text: 'Met at the gym', lang: 'en' }), 'I don\'t know anyone called "Paula". Should I add "Paula" as a new person?');
    assert.equal(say({ action: 'capture', person: 'Marte', kind: 'note', text: 'x', lang: 'en' }), 'I don\'t know anyone called "Marte". Did you mean Marta Ruiz? Should I add "Marte" as a new person?');
    assert.match(say({ action: 'capture', person: 'Paula', kind: 'note', text: 'Met at the gym', lang: 'en', confirm: true }), /^Added Paula\. Saved for Paula \(notes\)/);
    assert.ok(fileText('people/paula.md'));
  });

  test('promises: lent and borrowed from the words, due dates in the future', () => {
    say({ action: 'capture', person: 'Luis', kind: 'promise', text: 'Le presté mi taladro', lang: 'es' });
    say({ action: 'capture', person: 'Luis', kind: 'promise', text: 'Me prestó su tienda de campaña', lang: 'es' });
    say({ action: 'capture', person: 'Luis', kind: 'promise', text: 'Mandarle las fotos del viaje', date: 'el viernes que viene', lang: 'es' });
    const text = fileText('people/luis-ortega.md');
    assert.match(text, /- \[ \] 2026-10-13: Le presté mi taladro \{type=lent\}/);
    assert.match(text, /- \[ \] 2026-10-13: Me prestó su tienda de campaña \{type=borrowed\}/);
    assert.match(text, /- \[ \] 2026-10-13: Mandarle las fotos del viaje \{due=2026-10-16\}/);
    say({ action: 'capture', person: 'Luis', kind: 'lent', text: 'A book', lang: 'en' });
    assert.match(fileText('people/luis-ortega.md'), /A book \{type=lent\}/);
  });

  test('notes record the contact on their date', () => {
    say({ action: 'capture', person: 'Noor', kind: 'note', text: 'Videollamada', date: 'ayer', lang: 'es' });
    assert.equal(folder().person('noor-haddad').get('last_contact'), '2026-10-12');
    assert.match(fileText('people/noor-haddad.md'), /## Notes log\n\n- 2026-10-12: Videollamada\n- 2026-02-02:/);
  });

  test('preferences go to sizes, diet or tastes', () => {
    say({ action: 'capture', person: 'Sam', kind: 'preference', text: 'Talla M de camiseta', lang: 'es' });
    say({ action: 'capture', person: 'Sam', kind: 'preference', text: 'Allergic to nuts', lang: 'en' });
    say({ action: 'capture', person: 'Sam', kind: 'preference', text: 'Loves sci-fi novels', lang: 'en' });
    const text = fileText('people/sam-okafor.md');
    assert.match(text, /## Tallas \{#sizes\}\n\n- Talla M de camiseta\n/, 'new sections use the owner language (es) with an id');
    assert.match(text, /## Dietary restrictions\n\n- No pork\n- Allergic to nuts\n/);
    assert.match(text, /- Dislikes surprises at work\n- Loves sci-fi novels\n/);
  });

  test('dates: birthdays (asking before overwriting) and other yearly dates', () => {
    assert.equal(say({ action: 'capture', person: 'Luis', kind: 'date', text: 'Su cumpleaños', date: '3 de noviembre de 1988', lang: 'es' }), 'Cumpleaños de Luis Ortega: 3 nov. ¿Lo cambio a 3 nov 1988?');
    assert.equal(say({ action: 'capture', person: 'Luis', kind: 'date', text: 'Su cumpleaños', date: '3 de noviembre de 1988', lang: 'es', confirm: true }), 'Guardado el cumpleaños de Luis Ortega: 3 nov 1988.');
    assert.equal(folder().person('luis-ortega').get('birthday'), '1988-11-03');
    assert.equal(say({ action: 'capture', person: 'Noor', kind: 'date', text: 'Aniversario con su pareja el 2 de mayo', lang: 'es' }), 'Guardado para Noor Haddad: Aniversario con su pareja el 2 de mayo, 2 may.');
    assert.deepEqual(folder().person('noor-haddad').get('dates').at(-1), { label: 'Aniversario con su pareja el 2 de mayo', date: '--05-02', kind: 'anniversary' });
    assert.match(say({ action: 'capture', person: 'Sam', kind: 'birthday', text: 'birthday', date: '29 February 1996', lang: 'en' }), /already that/);
    assert.match(say({ action: 'capture', person: 'Noor', kind: 'date', text: 'Su padre falleció', date: '3 de marzo', lang: 'es' }), /marcado como sensible/);
    assert.equal(say({ action: 'capture', person: 'Noor', kind: 'date', text: 'Una fecha', date: 'algún día', lang: 'es' }), 'No entiendo la fecha "algún día". Usa una fecha como 2026-04-12, "ayer" o "12 de abril".');
  });

  test('sensitive information is marked and kept out of briefs', () => {
    assert.equal(say({ action: 'capture', person: 'Sam', kind: 'note', text: 'Told me about a health scare, going to hospital next week', lang: 'en' }), 'Saved for Sam Okafor (notes): Told me about a health scare, going to hospital next week (marked sensitive)');
    assert.match(fileText('people/sam-okafor.md'), /going to hospital next week \{sensitive\}/);
    const brief = say({ action: 'brief', person: 'Sam', lang: 'en' });
    assert.ok(!brief.includes('hospital'));
    assert.match(brief, /1 sensitive item hidden/);
    assert.match(say({ action: 'brief', person: 'Sam', lang: 'en', sensitive: true }), /hospital/);
    say({ action: 'capture', person: 'Sam', kind: 'note', text: 'Something private', lang: 'en', sensitive: true });
    assert.match(fileText('people/sam-okafor.md'), /Something private \{sensitive\}/);
  });

  test('gifts: warns about repeats and moves given ideas', () => {
    assert.match(say({ action: 'capture', person: 'Marta', kind: 'gift_idea', text: 'Ceramic mug', lang: 'en' }), /Careful: you already gave "Ceramic mug from a local workshop" \(Dec 24, 2025\)\./);
    assert.match(say({ action: 'capture', person: 'Marta', kind: 'gift_given', text: 'Pottery class', date: 'yesterday', lang: 'en' }), /Removed it from gift ideas\./);
    const text = fileText('people/marta-ruiz.md');
    assert.ok(!text.includes('- 2026-09-28: Pottery class'));
    assert.match(text, /- 2026-10-12: Pottery class\n/);
  });

  test('names with filler words, and captures without a kind', () => {
    assert.equal(say({ action: 'capture', person: 'a Marta', kind: 'note', text: 'Hablamos', lang: 'es' }), 'Guardado en Marta Ruiz (notas): Hablamos');
    assert.equal(say({ action: 'capture', person: "Sam's", text: 'Likes chess', lang: 'en' }), 'Saved for Sam Okafor (notes): Likes chess');
  });

  test('bad input is explained', () => {
    assert.equal(say({ action: 'capture', person: 'Marta', kind: 'recipe', text: 'x', lang: 'en' }), 'I don\'t know what kind of note "recipe" is. Use one of: gift_idea, gift_given, follow_up, promise, note, date, preference, plan.');
    assert.equal(say({ action: 'capture', kind: 'note', text: 'x', lang: 'en' }), 'Which person?');
    assert.equal(say({ action: 'capture', person: 'Marta', kind: 'note', lang: 'en' }), 'What should I save?');
    assert.match(say({ action: 'capture', person: 'Marta', kind: 'note', text: 'x', date: 'whenever', lang: 'en' }), /couldn't understand the date "whenever"/);
  });
});

describe('reading', () => {
  beforeEach(withExample);

  test('person', () => {
    assert.equal(
      say({ action: 'person', person: 'Martita', lang: 'es' }),
      ['Marta Ruiz (Martita) — friend', 'Cumpleaños: 12 abr 1990 (en 181 días, cumple 37)', 'Último contacto: hace 15 días, 1 día más de lo que querías', 'Pendiente: 1 pregunta, 2 promesas, 2 ideas de regalo', 'Personas: pareja: Luis Ortega'].join('\n'),
    );
    assert.match(say({ action: 'person', person: 'Luis', lang: 'en' }), /1 sensitive item hidden/);
  });

  test('brief', () => {
    assert.equal(
      say({ action: 'brief', person: 'Marta', lang: 'en' }),
      ['Before you see Marta Ruiz:', '- Follow-up: Ask how the new job is going (by Oct 15)', '- Promise: Send her the paella recipe', '- Lent (not returned): Lent her "The Left Hand of Darkness"', '- Last note (Sep 28): Coffee. Started a new job at a small studio.', '- Last contact 15 days ago, 1 day past your usual'].join('\n'),
    );
  });

  test('gift context', () => {
    const r = say({ action: 'gift_context', person: 'Marta', budget: '50 EUR', lang: 'en' });
    assert.equal(r, [
      'Gift context for Marta Ruiz (friend).',
      'Budget: 50 EUR.',
      'Likes: Loves handmade ceramics; Jazz, especially Chet Baker; Dislikes strong perfume',
      'Diet: Vegetarian',
      'Sizes: Shoes: EU 38; Ring: 14 (Spanish sizes)',
      'Saved ideas: Pottery class, she wants to learn (60 EUR); Vinyl of "Chet Baker Sings"',
      'Already given, do not repeat: Ceramic mug from a local workshop (2025-12); Book "Las ciudades invisibles" (2025-04)',
    ].join('\n'));
  });

  test('upcoming and overdue', () => {
    assert.equal(say({ action: 'upcoming', lang: 'es' }), 'Noor Haddad: cumpleaños en 7 días (20 oct)\nLuis Ortega: cumpleaños en 21 días (3 nov)');
    assert.equal(say({ action: 'upcoming', days: 3, lang: 'en' }), 'Nothing in the next 3 days.');
    // The model passes the user's words for the period and Kin counts the days.
    assert.equal(say({ action: 'upcoming', days: 'este mes', lang: 'es' }), 'Noor Haddad: cumpleaños en 7 días (20 oct)');
    assert.match(say({ action: 'upcoming', days: 'los próximos 12 meses', lang: 'es' }), /Marta Ruiz: cumpleaños en 181 días \(12 abr, cumple 37\)/);
    assert.equal(say({ action: 'upcoming', days: 'pronto', lang: 'es' }), say({ action: 'upcoming', lang: 'es' }));
    assert.equal(
      say({ action: 'overdue', lang: 'en' }),
      [
        'Noor Haddad: 253 days since you last talked (you wanted every 3 months)',
        'Luis Ortega: 64 days since you last talked (you wanted every month)',
        'Javier Moreno: 23 days since you last talked (you wanted every 2 weeks)',
        'Marta Ruiz: 15 days since you last talked (you wanted every 2 weeks)',
      ].join('\n'),
    );
  });

  test('unknown people when reading', () => {
    assert.equal(say({ action: 'brief', person: 'Zoe', lang: 'en' }), 'I don\'t know anyone called "Zoe". Should I add "Zoe" as a new person?');
    assert.equal(fileText('people/zoe.md'), null, 'reading never creates people');
  });
});

describe('changes', () => {
  beforeEach(withExample);

  test('done: follow-ups, returned loans, given ideas', () => {
    assert.equal(say({ action: 'done', person: 'Marta', text: 'new job', lang: 'en' }), 'Done: Ask how the new job is going');
    assert.equal(say({ action: 'done', person: 'Marta', text: 'Left Hand', lang: 'en' }), 'Done: Lent her "The Left Hand of Darkness"');
    assert.equal(say({ action: 'done', person: 'Marta', text: 'vinyl', lang: 'en' }), 'Moved to gifts given: Vinyl of "Chet Baker Sings"');
    const text = fileText('people/marta-ruiz.md');
    assert.match(text, /- \[x\] 2026-09-28: Ask how the new job is going/);
    assert.match(text, /- \[x\] 2026-07-02: Lent her/);
    assert.match(text, /## Gifts given\n\n.*\n.*\n- 2026-10-13: Vinyl of "Chet Baker Sings"\n/);
  });

  test('done: no match lists what is open; several matches ask which', () => {
    assert.equal(say({ action: 'done', person: 'Marta', text: 'dentist', lang: 'en' }), 'Nothing open for Marta Ruiz matches "dentist". Open: Ask how the new job is going; Send her the paella recipe; Lent her "The Left Hand of Darkness"; Visit the Sorolla museum together');
    say({ action: 'capture', person: 'Marta', kind: 'follow_up', text: 'Ask about the new flat', lang: 'en' });
    assert.equal(say({ action: 'done', person: 'Marta', text: 'ask', lang: 'en' }), 'Several match: Ask how the new job is going; Ask about the new flat. Which one?');
  });

  test('update: confirm before overwriting, aliases and cadences in words', () => {
    assert.equal(say({ action: 'update', person: 'Marta', field: 'birthday', value: '13 de abril de 1990', lang: 'es' }), 'Cumpleaños de Marta Ruiz: 12 abr 1990. ¿Lo cambio a 13 abr 1990?');
    assert.equal(folder().person('marta-ruiz').get('birthday'), '1990-04-12');
    assert.equal(say({ action: 'update', person: 'Marta', field: 'birthday', value: '13 de abril de 1990', lang: 'es', confirm: true }), 'Actualizado Marta Ruiz: cumpleaños ahora es 13 abr 1990.');
    assert.equal(say({ action: 'update', person: 'Marta', field: 'apodo', value: 'Mar', lang: 'es' }), 'Ahora Marta Ruiz también se puede llamar "Mar".');
    assert.equal(say({ action: 'update', person: 'Mar', field: 'frecuencia', value: 'cada mes', lang: 'es', confirm: true }), 'Actualizado Marta Ruiz: cada cuánto hablar ahora es mes.');
    assert.equal(say({ action: 'update', person: 'Sam', field: 'cadence', value: 'whenever', lang: 'en' }), '"whenever" is not a valid how often to keep in touch. Say it like "every 2 weeks" (2w), "every month" (1m) or "every 10 days" (10d).');
    assert.equal(say({ action: 'update', person: 'Sam', field: 'last_contact', value: 'today', lang: 'en' }), "Updated Sam Okafor: last contact is now Oct 13.");
    assert.equal(say({ action: 'update', person: 'Sam', field: 'pronouns', value: 'none', lang: 'en' }), "Remove Sam Okafor's pronouns (they/them)?");
    assert.equal(say({ action: 'update', person: 'Sam', field: 'pronouns', value: 'none', lang: 'en', confirm: true }), 'Removed pronouns from Sam Okafor.');
    assert.equal(say({ action: 'update', person: 'Sam', field: 'shoe', value: '42', lang: 'en' }), 'What should I change: name, nickname, relationship, birthday, pronouns, how often to keep in touch, or last contact?');
  });

  test('link: both directions, Spanish words, confirm before changing', () => {
    assert.equal(say({ action: 'link', person: 'Sam', other: 'Javi', type: 'jefe', lang: 'es' }), 'Vinculado: Javier Moreno es jefa/jefe de Sam Okafor.');
    assert.deepEqual(folder().person('javier-moreno').get('links').at(-1), { person: 'sam-okafor', type: 'report' });
    assert.equal(say({ action: 'link', person: 'Marta', other: 'Luis', type: 'partner', lang: 'en' }), "Luis Ortega is already Marta Ruiz's partner.");
    assert.equal(say({ action: 'link', person: 'Marta', other: 'Luis', type: 'husband', lang: 'en' }), "Luis Ortega is already Marta Ruiz's partner. Change it to spouse?");
    assert.equal(say({ action: 'link', person: 'Marta', other: 'Luis', type: 'husband', lang: 'en', confirm: true }), "Linked: Luis Ortega is Marta Ruiz's spouse.");
    assert.equal(say({ action: 'link', person: 'Marta', other: 'Luis', lang: 'en' }), 'What is their relationship (for example partner, sibling, friend)?');
  });

  test('delete: always asks first', () => {
    assert.equal(say({ action: 'delete', person: 'Marta', text: 'paella', lang: 'en' }), 'Delete "Send her the paella recipe" from Marta Ruiz?');
    assert.ok(fileText('people/marta-ruiz.md').includes('paella'));
    assert.equal(say({ action: 'delete', person: 'Marta', text: 'paella', lang: 'en', confirm: true }), 'Deleted from Marta Ruiz: Send her the paella recipe');
    assert.ok(!fileText('people/marta-ruiz.md').includes('paella'));
    assert.equal(say({ action: 'delete', person: 'Luis', lang: 'en' }), 'Delete Luis Ortega and everything about them (7 entries)? Only a backup can bring it back.');
    assert.equal(say({ action: 'delete', person: 'Luis', lang: 'en', confirm: true }), 'Deleted Luis Ortega.');
    assert.equal(fileText('people/luis-ortega.md'), null);
    assert.ok(!fileText('people/marta-ruiz.md').includes('luis-ortega'));
    assert.ok(!fileText('INDEX.md').includes('luis'));
    assert.equal(say({ action: 'delete', person: 'Marta', text: 'zebra', lang: 'en' }), 'Nothing about Marta Ruiz matches "zebra".');
  });

  test('every change leaves a valid folder', () => {
    say({ action: 'capture', person: 'Marta', kind: 'note', text: 'Hi', lang: 'en' });
    say({ action: 'link', person: 'Sam', other: 'Marta', type: 'friend', lang: 'en' });
    say({ action: 'delete', person: 'Noor', lang: 'en', confirm: true });
    assert.deepEqual(folder().validate({ now: NOW }), []);
  });
});

describe('backup and reminders', () => {
  beforeEach(withExample);

  test('backup opens the panel in the user language', () => {
    const r = call({ action: 'backup', lang: 'es' });
    assert.equal(r.result, 'Aquí tienes el panel de copia de seguridad. 6 personas guardadas; aún sin copia.');
    assert.deepEqual(r.webview, { url: 'backup.html?lang=es', aspectRatio: 0.95 });
  });

  test('reminds to back up after 20 changes, once a day', () => {
    for (let i = 0; i < 19; i++) assert.ok(!say({ action: 'capture', person: 'Sam', kind: 'note', text: `n${i}`, lang: 'en' }).includes('backup'));
    assert.match(say({ action: 'capture', person: 'Sam', kind: 'note', text: 'n19', lang: 'en' }), /\nTip: it has been a while since your last backup\. Say "backup" to save a copy\.$/);
    assert.ok(!say({ action: 'capture', person: 'Sam', kind: 'note', text: 'n20', lang: 'en' }).includes('Tip'), 'once a day');
    assert.match(say({ action: 'person', person: 'Sam', lang: 'en' }, { now: new Date('2026-10-14T10:00:00Z') }), /Tip:/, 'again the next day');
    assert.equal(readMeta(storage).changesSinceExport, 21);
  });

  test('reminds after 30 days with unsaved changes', () => {
    say({ action: 'capture', person: 'Sam', kind: 'note', text: 'one change', lang: 'en' });
    assert.ok(!say({ action: 'overdue', lang: 'en' }, { now: new Date('2026-11-01T10:00:00Z') }).includes('Tip'));
    assert.match(say({ action: 'overdue', lang: 'en' }, { now: new Date('2026-11-12T10:00:00Z') }), /Tip:/);
  });
});

describe('the app contract', () => {
  beforeEach(withExample);

  test('unknown actions and broken JSON are explained', () => {
    assert.equal(say({ action: 'fly', lang: 'en' }), 'Unknown action "fly". Use one of: capture, person, brief, gift_context, upcoming, overdue, done, update, link, delete, backup.');
    const broken = call('{"action": "capture", ', { raw: true });
    assert.equal(broken.status, 'failed');
    assert.match(broken.error, /must be a JSON object/);
  });

  test('accepts double-encoded JSON and loose field names', () => {
    const r = call(JSON.stringify(JSON.stringify({ action: 'save', name: 'Sam', kind: 'note', value: 'Hola', confirm: 'yes' })), { raw: true });
    assert.equal(r.result, 'Guardado en Sam Okafor (notas): Hola');
  });

  test('a full storage is reported as such', () => {
    const real = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (k.includes('people/')) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      real(k, v);
    };
    const r = call({ action: 'capture', person: 'Sam', kind: 'note', text: 'x', lang: 'en' });
    assert.equal(r.status, 'failed');
    assert.equal(r.error, 'Kin has run out of space on this phone. Make a backup, then delete old notes.');
  });
});
