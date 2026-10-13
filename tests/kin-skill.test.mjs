// Kin's SKILL.md is what the model reads before calling the skill: it must list exactly the actions
// Kin has, its examples must be calls Kin accepts, and it must stay short, because it takes up
// room in the on-device model's context for the rest of the chat.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ACTIONS } from '../kin/src/actions.mjs';
import { handle } from '../kin/src/kin.mjs';
import { MemoryStorage } from '../kin/src/store.mjs';
import { readFolder } from '../lore-core/src/node.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL_MD = readFileSync(join(ROOT, 'skills', 'kin', 'SKILL.md'), 'utf8');

test('SKILL.md stays short', () => {
  assert.ok(Buffer.byteLength(SKILL_MD) <= 2600, `${Buffer.byteLength(SKILL_MD)} bytes; keep it under 2600`);
});

test('SKILL.md lists exactly the actions Kin has', () => {
  const listed = [...SKILL_MD.matchAll(/^- ([a-z_]+)[.:]/gm)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), Object.keys(ACTIONS).sort());
});

test('every example in SKILL.md is a call Kin accepts', () => {
  const examples = [...SKILL_MD.matchAll(/^- ".+" → (\{.+\})$/gm)].map((m) => m[1]);
  assert.ok(examples.length >= 3);
  for (const example of examples) {
    const storage = new MemoryStorage();
    for (const [path, text] of readFolder(join(ROOT, 'examples', 'lore')).toFiles()) storage.setItem(`lore:v1:file:${path}`, text);
    const out = JSON.parse(handle(example, { storage, now: new Date('2026-10-13T12:00:00') }));
    assert.equal(out.error, undefined, `${example}: ${out.error}`);
    assert.ok(out.result, example);
  }
});
