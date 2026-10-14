// Each version on main becomes a GitHub release vX.Y.Z (.github/workflows/release.yml). Kin,
// lore-core and package.json share that version, and CHANGELOG.md must have its notes.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { VERSION as LORE_CORE_VERSION } from '../lore-core/src/folder.mjs';
import { KIN_VERSION } from '../kin/src/version.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const CHANGELOG = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

test('Kin, lore-core and package.json have the same version', () => {
  assert.equal(KIN_VERSION, version);
  assert.equal(LORE_CORE_VERSION, version);
});

test('CHANGELOG.md has notes for this version, newest first', () => {
  const headings = [...CHANGELOG.matchAll(/^## Kin (\d+\.\d+\.\d+),/gm)].map((m) => m[1]);
  assert.equal(headings[0], version);
  const section = CHANGELOG.split(/^## /m).find((s) => s.startsWith(`Kin ${version},`));
  assert.ok(section && section.split('\n').filter((l) => l.trim()).length > 3, 'the section has notes');
});
