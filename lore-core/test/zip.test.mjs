import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { crc32, createZip, readZip } from '../src/zip.mjs';

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

const hasZipTool = () => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

describe('zip reader', () => {
  test('reads what the writer writes, including UTF-8 names and binary data', async () => {
    const bin = new Uint8Array([0, 255, 1, 254]);
    const zip = createZip([{ path: 'd/' }, { path: 'd/ñandú.md', data: new TextEncoder().encode('héllo') }, { path: 'd/b.bin', data: bin }]);
    const entries = await readZip(zip);
    assert.deepEqual(entries.map((e) => [e.path, e.directory]), [['d/', true], ['d/ñandú.md', false], ['d/b.bin', false]]);
    assert.equal(new TextDecoder().decode(entries[1].data), 'héllo');
    assert.deepEqual([...entries[2].data], [...bin]);
  });

  test('reads compressed archives with data descriptors, as made by other tools', async (t) => {
    if (!hasZipTool()) {
      t.skip('zip is not installed');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'lore-zipread-'));
    try {
      writeFileSync(join(dir, 'a.md'), 'x'.repeat(5000) + '\nñ\n');
      // Streaming to stdout makes zip write data descriptors, like macOS Archive Utility.
      const zip = execFileSync('zip', ['-q', '-9', '-', 'a.md'], { cwd: dir });
      const [entry] = await readZip(new Uint8Array(zip));
      assert.equal(entry.path, 'a.md');
      assert.equal(new TextDecoder().decode(entry.data), 'x'.repeat(5000) + '\nñ\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects damaged or foreign files', async () => {
    await assert.rejects(readZip(new TextEncoder().encode('not a zip at all, just text')), /not a zip file/);
    const zip = createZip([{ path: 'a.txt', data: new TextEncoder().encode('hello') }]);
    const broken = zip.slice();
    broken[30 + 'a.txt'.length] ^= 0xff; // flip a byte of the content
    await assert.rejects(readZip(broken), /checksum mismatch/);
    await assert.rejects(readZip(zip, { maxBytes: 3 }), /too large/);
  });
});
