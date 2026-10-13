import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { applyImport, archiveName, exportArchive, importArchive, planImport } from '../src/archive.mjs';
import { LoreFolder } from '../src/folder.mjs';
import { readFolder } from '../src/node.mjs';
import { createZip, readZip } from '../src/zip.mjs';

const EXAMPLE = join(fileURLToPath(new URL('../..', import.meta.url)), 'examples', 'lore');
const enc = new TextEncoder();
const zipOf = (files) => createZip(Object.entries(files).map(([path, data]) => (data === null ? { path } : { path, data: typeof data === 'string' ? enc.encode(data) : data })));

describe('export and import', () => {
  test('a folder survives export and import exactly, including unknown and binary files', async () => {
    const folder = readFolder(EXAMPLE);
    folder.setText('extensions/kin/state.json', '{"changes":3}');
    folder.raw.set('photos/marta.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
    folder.addEntry('marta-ruiz', 'notes', { date: '2026-10-13', text: 'Edited before export' });
    const zip = exportArchive(folder);
    const paths = (await readZip(zip)).map((e) => e.path);
    assert.ok(paths.every((p) => p.startsWith('lore/')));
    assert.ok(paths.includes('lore/people/') && paths.includes('lore/me.md'));
    const back = await importArchive(zip);
    const a = folder.toFiles();
    const b = back.toFiles();
    assert.deepEqual([...b.keys()], [...a.keys()]);
    for (const [path, content] of a) assert.deepEqual(b.get(path), content, path);
    assert.deepEqual(back.validate({ now: new Date() }).filter((i) => i.level === 'error'), []);
  });

  test('ignores entries outside lore/, such as __MACOSX', async () => {
    const zip = zipOf({ 'lore/': null, 'lore/me.md': '---\nlore: "0.1"\nname: A\n---\n', '__MACOSX/lore/._me.md': 'junk', 'README.txt': 'hi' });
    assert.deepEqual((await importArchive(zip)).paths(), ['me.md']);
  });

  test('explains what is wrong with a non-Lore archive', async () => {
    await assert.rejects(importArchive(zipOf({ 'me.md': '---\nname: A\n---\n' })), /lore\/me.md is missing\. The files must be inside a folder named "lore"/);
    await assert.rejects(importArchive(zipOf({ 'notes.txt': 'x' })), (e) => e.code === 'bad-archive' && !/folder named/.test(e.message));
    await assert.rejects(importArchive(enc.encode('nope')), (e) => e.code === 'bad-archive');
    await assert.rejects(importArchive(zipOf({ 'lore/me.md': 'x', 'lore/../evil.md': 'x' })), /Unsafe path/);
    await assert.rejects(importArchive(zipOf({ 'lore/me.md': new Uint8Array([0xff, 0xfe, 0x00]) })), /not UTF-8/);
  });

  test('suggested file name', () => {
    assert.equal(archiveName('2026-10-13'), 'lore-2026-10-13.zip');
  });
});

describe('import plans', () => {
  const current = () => LoreFolder.fromFiles({ 'me.md': 'me v1', 'people/a.md': 'a v1', 'people/b.md': 'b', 'people/c.md': 'c' });
  const incoming = () => LoreFolder.fromFiles({ 'me.md': 'me v1', 'people/a.md': 'a v2', 'people/b.md': 'b', 'people/d.md': 'd' });

  test('planImport lists what would change', () => {
    assert.deepEqual(planImport(current(), incoming()), {
      added: ['people/d.md'],
      changed: ['people/a.md'],
      removed: ['people/c.md'],
      unchanged: ['me.md', 'people/b.md'],
    });
  });

  test('replace makes the folder exactly the archive', () => {
    const out = applyImport(current(), incoming(), { mode: 'replace' });
    assert.deepEqual([...out.toFiles()], [...incoming().toFiles()]);
  });

  test('merge keeps everything and saves the old version of changed files', () => {
    const out = applyImport(current(), incoming(), { mode: 'merge', now: new Date('2026-10-13T16:00:00.123Z') }).toFiles();
    assert.equal(out.get('people/a.md'), 'a v2');
    assert.equal(out.get('conflicts/2026-10-13T16-00-00Z/people/a.md'), 'a v1');
    assert.equal(out.get('people/c.md'), 'c');
    assert.equal(out.get('people/d.md'), 'd');
  });

  test('an unknown mode is refused', () => {
    assert.throws(() => applyImport(current(), incoming(), { mode: 'overwrite' }), /replace" or "merge/);
  });
});
