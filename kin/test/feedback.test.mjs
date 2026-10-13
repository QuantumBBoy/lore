// The mistake log: Kin remembers its last call, the feedback action stores it with the owner's
// correction, and the export replaces names with stable placeholders.

import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, test } from 'node:test';
import { readFolder } from '../../lore-core/src/node.mjs';
import { exportMistakes, stats } from '../src/backup.mjs';
import { MAX_CASES, readCases, readLastCall } from '../src/feedback.mjs';
import { handle } from '../src/kin.mjs';
import { MemoryStorage, loadFolder, saveFolder } from '../src/store.mjs';

const EXAMPLE = join(fileURLToPath(new URL('../..', import.meta.url)), 'examples', 'lore');
const NOW = new Date('2026-10-13T10:00:00Z');
const later = (minutes) => new Date(NOW.getTime() + minutes * 60000);

let storage;
const say = (data, now = NOW) => JSON.parse(handle(typeof data === 'string' ? data : JSON.stringify(data), { storage, now })).result;
const exported = () => exportMistakes(storage).text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

describe('feedback', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    saveFolder(storage, readFolder(EXAMPLE));
  });

  test('every call is remembered: what the model sent and what Kin answered', () => {
    say({ action: 'upcoming', days: 'el finde', lang: 'es' });
    assert.deepEqual(readLastCall(storage), {
      ts: '2026-10-13T10:00:00.000Z',
      today: '2026-10-13',
      time: '10:00',
      lang: 'es',
      action: 'upcoming',
      params: { action: 'upcoming', days: 'el finde', lang: 'es' },
      result: 'Noor Haddad: cumpleaños en 7 días (20 oct)\nLuis Ortega: cumpleaños en 21 días (3 nov)',
      error: false,
    });
    say('{"action": "upcoming": broken');
    assert.deepEqual(readLastCall(storage).params, { raw: '{"action": "upcoming": broken' });
    assert.equal(readLastCall(storage).error, true);
  });

  test('stores the last call with the correction, and does not replace it', () => {
    say({ action: 'upcoming', days: 'el finde', lang: 'es' });
    const r = say({ action: 'feedback', text: 'No era eso: quería este fin de semana', lang: 'es' }, later(2));
    assert.equal(r, 'Anotado, gracias (error 1, sobre «upcoming»). Para compartirlos: di «copia de seguridad» y toca «Compartir errores».');
    const [c] = readCases(storage);
    assert.equal(c.id, '2026-10-13-001');
    assert.equal(c.action, 'upcoming');
    assert.deepEqual(c.params, { action: 'upcoming', days: 'el finde', lang: 'es' });
    assert.equal(c.correction, 'No era eso: quería este fin de semana');
    assert.equal(c.minutes_since_call, 2);
    assert.equal(c.kin, '0.2.0');
    assert.equal(c.spec, '0.2');
    assert.equal(c.fault, 'unknown');
    assert.equal(readLastCall(storage).action, 'upcoming', 'feedback is not remembered as the last call');
    assert.equal(stats(storage).mistakes, 1);
  });

  test('"no era eso" as the action, a stale call, and nothing to correct', () => {
    say({ action: 'person', person: 'Marta', lang: 'en' });
    assert.match(say({ action: 'no era eso', text: 'Era Marta Ruiz', lang: 'es' }, later(45)), / La última llamada a Kin fue hace 45 minutos; he anotado esa\.$/);
    assert.equal(say({ action: 'feedback', lang: 'en' }), 'What was wrong? Tell me what you expected.');
    storage = new MemoryStorage();
    assert.equal(say({ action: 'feedback', text: 'wrong', lang: 'en' }), 'There is no earlier Kin answer to correct in this phone.');
  });

  test('keeps at most the last 500 cases', () => {
    say({ action: 'overdue', lang: 'en' });
    for (let i = 0; i < MAX_CASES + 3; i++) say({ action: 'feedback', text: `case ${i}`, lang: 'en' });
    const cases = readCases(storage);
    assert.equal(cases.length, MAX_CASES);
    assert.equal(cases.at(-1).correction, `case ${MAX_CASES + 2}`);
  });
});

describe('exporting the log for evals', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    saveFolder(storage, readFolder(EXAMPLE));
  });

  test('names become placeholders, stable from one export to the next', () => {
    say({ action: 'brief', person: 'Javi', lang: 'es' });
    say({ action: 'feedback', text: 'Quería a Javier Moreno, no a MARTA ruíz ni a Alex Moreno', lang: 'es' });
    const [c] = exported();
    assert.equal(c.params.person, 'person_2');
    assert.ok(!/Javier|Javi|Marta|Moreno|Alex/i.test(JSON.stringify(c)), JSON.stringify(c));
    assert.equal(c.correction, 'Quería a person_2, no a person_4 ni a owner');
    assert.match(c.result, /^Antes de ver a person_2:/);
    assert.equal(c.id, '2026-10-13-001', 'ids and dates are not touched');
    assert.deepEqual(exported(), [c], 'same placeholders next time');
  });

  test('new people get new numbers; names Kin does not know get one too', () => {
    say({ action: 'brief', person: 'Marta', lang: 'es' });
    say({ action: 'feedback', text: 'bien', lang: 'es' });
    const first = exported()[0].params.person;
    say({ action: 'capture', person: 'Paula', kind: 'note', text: 'Café', lang: 'es' });
    say({ action: 'feedback', text: 'Paula es nueva', lang: 'es' });
    const [a, b] = exported();
    assert.equal(a.params.person, first);
    assert.equal(b.params.person, 'person_7');
    assert.equal(b.correction, 'person_7 es nueva');
  });

  test('e-mail addresses and phone numbers go; sensitive calls keep no text', () => {
    say({ action: 'capture', person: 'Sam', kind: 'note', text: 'Wrote from sam@example.org, phone +34 600 123 456, on 2026-10-12', lang: 'en' });
    say({ action: 'feedback', text: 'wrong person', lang: 'en' });
    say({ action: 'capture', person: 'Luis', kind: 'note', text: 'Le van a operar de la rodilla', lang: 'es' });
    say({ action: 'feedback', text: 'Era la otra rodilla', lang: 'es' });
    const [plain, sensitive] = exported();
    assert.equal(plain.params.text, 'Wrote from [email], phone [phone], on 2026-10-12');
    assert.equal(plain.sensitive, false);
    assert.equal(sensitive.sensitive, true);
    assert.equal(sensitive.params.text, '[sensitive]');
    assert.equal(sensitive.result, '[sensitive]');
    assert.equal(sensitive.correction, '[sensitive]');
  });

  test('nothing logged, nothing exported', () => {
    assert.deepEqual(exportMistakes(storage), { text: '', count: 0 });
    assert.equal(stats(storage).mistakes, 0);
    assert.ok(loadFolder(storage).folder.slugs().length > 0);
  });
});
