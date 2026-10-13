#!/usr/bin/env node
// Replay logged Kin mistakes (evals/cases.jsonl, exported from the backup panel) against the
// current code.
//
// Each case is one call the owner said was wrong: what the model sent (params), what Kin answered
// (result) and the owner's correction. After triage, a case says whose fault it was and what was
// expected:
//   "fault": "kin"     Kin misread what the model sent. "expected" lists what Kin should make of
//                      it, with the keys of kin/src/interpret.mjs: {"days": 365}, {"date": "…"}.
//   "fault": "model"   The model chose the wrong action or person, or sent broken JSON. That can
//                      only be re-run on the phone: the case is tracked here, not replayed.
//   "fault": "unknown" Not triaged yet. Kin's current reading is printed to help triage.
//
// Every case is also run through Kin, on a folder with only placeholder people, to check that Kin
// still answers in the shape the app expects.
//
// Usage: node tools/replay-evals.mjs [evals/cases.jsonl]   (exit code 1 when a case fails)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LoreFolder } from '../lore-core/src/folder.mjs';
import { interpret } from '../kin/src/interpret.mjs';
import { handle } from '../kin/src/kin.mjs';
import { MemoryStorage, saveFolder } from '../kin/src/store.mjs';

const DEFAULT_FILE = fileURLToPath(new URL('../evals/cases.jsonl', import.meta.url));
const PERSON_PARAMS = ['person', 'name', 'who', 'other'];

/** Parse JSON Lines; blank lines are skipped. Throws with the line number on bad JSON. */
export function parseCases(text) {
  const cases = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      cases.push(JSON.parse(line));
    } catch (e) {
      throw new Error(`line ${i + 1}: ${e.message}`);
    }
  });
  return cases;
}

/** A folder with the owner and the placeholder people a case names (person_1, …). */
function placeholderFolder(c) {
  const folder = LoreFolder.create({ name: 'owner', language: c.lang ?? 'en' });
  const names = new Set();
  for (const p of PERSON_PARAMS) {
    const v = c.params?.[p];
    if (typeof v === 'string') for (const m of v.matchAll(/person_\d+/g)) names.add(m[0]);
  }
  for (const name of names) folder.createPerson({ name });
  return folder;
}

/** Does Kin still answer this call in the shape the app expects? */
function smoke(c) {
  const storage = new MemoryStorage();
  saveFolder(storage, placeholderFolder(c));
  const now = new Date(c.call_ts ?? c.ts ?? `${c.today}T12:00:00Z`);
  const data = c.params && !('raw' in c.params) ? JSON.stringify(c.params) : String(c.params?.raw ?? '');
  try {
    const out = JSON.parse(handle(data, { storage, now }));
    return typeof out.result === 'string' ? null : 'no result text';
  } catch (e) {
    return `Kin crashed: ${e.message}`;
  }
}

/**
 * @returns {{id, action, status: 'pass'|'fail'|'device-only'|'untriaged', details: string, reading: object}}
 */
export function replayCase(c) {
  const reading = c.params && !('raw' in c.params) ? interpret(c.params, c.today) : { action: null, parse: 'invalid' };
  const base = { id: c.id, action: c.action ?? reading.action };
  const broken = smoke(c);
  if (broken) return { ...base, status: 'fail', details: broken, reading };
  if (c.fault === 'model') return { ...base, status: 'device-only', details: 'the model chose this; re-run it on the phone', reading };
  if (!c.expected || typeof c.expected !== 'object') return { ...base, status: 'untriaged', details: `Kin reads it as ${JSON.stringify(reading)}`, reading };
  const wrong = Object.entries(c.expected)
    .filter(([key, want]) => JSON.stringify(reading[key] ?? null) !== JSON.stringify(want))
    .map(([key, want]) => `${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(reading[key] ?? null)}`);
  return { ...base, status: wrong.length ? 'fail' : 'pass', details: wrong.join('; '), reading };
}

export function replay(cases) {
  const results = cases.map(replayCase);
  const count = (s) => results.filter((r) => r.status === s).length;
  return { results, pass: count('pass'), fail: count('fail'), deviceOnly: count('device-only'), untriaged: count('untriaged') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] ?? DEFAULT_FILE;
  const { results, pass, fail, deviceOnly, untriaged } = replay(parseCases(readFileSync(file, 'utf8')));
  for (const r of results) console.log(`${r.status.padEnd(11)} ${String(r.id).padEnd(16)} ${String(r.action ?? '-').padEnd(12)} ${r.details}`);
  console.log(`\n${results.length} cases: ${pass} pass, ${fail} fail, ${deviceOnly} device-only (model side, re-run on the phone), ${untriaged} untriaged.`);
  process.exitCode = fail ? 1 : 0;
}
