// evals/cases.jsonl: Kin's logged mistakes. Every triaged case must pass against the current code;
// model-side cases are tracked and can only be re-run on the phone.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { readFolder } from '../lore-core/src/node.mjs';
import { exportMistakes } from '../kin/src/backup.mjs';
import { interpret } from '../kin/src/interpret.mjs';
import { handle } from '../kin/src/kin.mjs';
import { MemoryStorage, saveFolder } from '../kin/src/store.mjs';
import { parseCases, replay, replayCase } from '../tools/replay-evals.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CASES = readFileSync(join(ROOT, 'evals', 'cases.jsonl'), 'utf8');

describe('evals/cases.jsonl', () => {
  const cases = parseCases(CASES);

  test('every case has the fields the export writes, and no real names', () => {
    for (const c of cases) {
      for (const key of ['id', 'today', 'lang', 'action', 'params', 'result', 'correction', 'fault', 'expected']) assert.ok(key in c, `${c.id} has no ${key}`);
      assert.ok(['kin', 'model', 'unknown'].includes(c.fault), `${c.id}: fault ${c.fault}`);
      for (const p of ['person', 'other']) if (typeof c.params[p] === 'string') assert.match(c.params[p], /^(person_\d+|owner)$/, `${c.id}: ${p}`);
    }
  });

  test('no triaged case fails against the current code', () => {
    const { results, fail } = replay(cases);
    assert.equal(fail, 0, results.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.details}`).join('\n'));
  });
});

describe('replay', () => {
  const base = { id: 't', today: '2026-10-13', lang: 'es', result: '', correction: '' };

  test('pass, fail, device-only and untriaged', () => {
    const params = { action: 'upcoming', days: 'los próximos 3 meses', lang: 'es' };
    assert.equal(replayCase({ ...base, params, fault: 'kin', expected: { days: 92 } }).status, 'pass');
    const fail = replayCase({ ...base, params, fault: 'kin', expected: { days: 90, action: 'upcoming' } });
    assert.equal(fail.status, 'fail');
    assert.equal(fail.details, 'days: expected 90, got 92');
    assert.equal(replayCase({ ...base, params, fault: 'model', expected: { action: 'digest' } }).status, 'device-only');
    const untriaged = replayCase({ ...base, params, fault: 'unknown', expected: null });
    assert.equal(untriaged.status, 'untriaged');
    assert.equal(untriaged.details, 'Kin reads it as {"action":"upcoming","days":92}');
  });

  test('broken JSON from the model is tracked as the model\'s', () => {
    const r = replayCase({ ...base, params: { raw: '{"action": "upcoming": 2222' }, fault: 'model', expected: null });
    assert.equal(r.status, 'device-only');
    assert.deepEqual(r.reading, { action: null, parse: 'invalid' });
  });

  test('bad JSON Lines are reported with the line number', () => {
    assert.throws(() => parseCases('{"id":1}\n\n{oops\n'), /^Error: line 3:/);
  });
});

describe('interpret', () => {
  const today = '2026-10-13';

  test('reads what the model sent as Kin does', () => {
    assert.deepEqual(interpret({ action: 'capture', person: 'person_1', kind: 'gift_idea', text: 'x', date: 'ayer', lang: 'es' }, today), { action: 'capture', kind: 'gift_idea', date: '2026-10-12', contact: '2026-10-12' });
    assert.deepEqual(interpret({ action: 'capture', person: 'person_1', kind: 'follow_up', text: 'x', date: 'el viernes', lang: 'es' }, today), { action: 'capture', kind: 'follow_up', date: '2026-10-16', contact: null });
    assert.deepEqual(interpret({ action: 'capture', kind: 'birthday', date: '12 de abril', lang: 'es' }, today), { action: 'capture', kind: 'date:birthday', date: '--04-12', contact: null });
    assert.deepEqual(interpret({ action: 'capture', kind: 'note', text: 'x' }, today), { action: 'capture', kind: 'note', contact: today });
    assert.deepEqual(interpret({ action: 'update', field: 'cadence', value: 'cada dos semanas' }, today), { action: 'update', field: 'cadence', value: '2w' });
    assert.deepEqual(interpret({ action: 'link', type: 'pareja' }, today), { action: 'link', type: 'partner' });
    assert.deepEqual(interpret({ action: 'remind', person: 'familia', before: 'dos semanas', at: 'a las 8' }, today), { action: 'remind', group: 'family', lead: 14, at: '08:00' });
    assert.deepEqual(interpret({ action: 'calendar' }, today), { action: 'remind', calendar: true, group: 'everyone' });
    assert.deepEqual(interpret({ action: 'digest', every: 'cada lunes', at: '9' }, today), { action: 'digest', every: 'monday', at: '09:00' });
    assert.deepEqual(interpret('{"action":"vuela"}', today), { action: null });
  });
});

test('a case exported from the phone replays here', () => {
  const storage = new MemoryStorage();
  saveFolder(storage, readFolder(join(ROOT, 'examples', 'lore')));
  const now = new Date('2026-10-13T10:00:00Z');
  handle(JSON.stringify({ action: 'upcoming', days: 'el finde', lang: 'es' }), { storage, now });
  handle(JSON.stringify({ action: 'feedback', text: 'Quería el fin de semana', lang: 'es' }), { storage, now });
  const [c] = parseCases(exportMistakes(storage).text);
  assert.equal(replayCase(c).status, 'untriaged');
  assert.equal(replayCase({ ...c, fault: 'kin', expected: { days: 30 } }).status, 'pass');
});
