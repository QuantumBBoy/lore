import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { crc32, createZip } from './zip.mjs';

describe('zip writer', () => {
  test('crc32 matches the reference value', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  });

  test('produces an archive that unzip accepts', (t) => {
    try {
      execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    } catch {
      t.skip('unzip is not installed');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'lore-zip-'));
    try {
      const file = join(dir, 'a.zip');
      const data = new TextEncoder().encode('héllo\n');
      writeFileSync(file, createZip([{ path: 'x/' }, { path: 'x/a.txt', data }]));
      assert.match(execFileSync('unzip', ['-t', file]).toString(), /No errors detected/);
      assert.equal(execFileSync('unzip', ['-p', file, 'x/a.txt']).toString(), 'héllo\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
