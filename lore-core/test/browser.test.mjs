// Runs lore-core inside real browser engines: Chromium always, and WebKit (the iPhone's engine)
// when it is installed, as it is in CI. Results must match what Node computes.

import { strict as assert } from 'node:assert';
import { deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { chromium, webkit } from 'playwright';
import { readFolder } from '../src/node.mjs';
import { brief, upcoming, overdue, matchPerson } from '../src/index.mjs';
import { startStaticServer } from '../../tests/helpers/static-server.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TODAY = '2026-10-13';
const NOW = '2026-10-13T16:00:00Z';

let server;
before(async () => {
  server = await startStaticServer(ROOT, '/');
});
after(async () => server?.close());

// A zip with one DEFLATE entry, built by hand so the browser has to inflate it.
function deflatedZip(path, text) {
  const data = Buffer.from(text);
  const comp = deflateRawSync(data);
  const name = Buffer.from(path);
  const crc = (() => {
    let c = 0xffffffff;
    for (const b of data) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  })();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const cdOffset = local.length + name.length + comp.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(cdOffset, 16);
  return [...Buffer.concat([local, name, comp, central, name, end])];
}

const engines = [['chromium', chromium], ['webkit', webkit]];

for (const [label, engine] of engines) {
  describe(`lore-core in ${label}`, () => {
    let browser = null;
    before(async () => {
      try {
        browser = await engine.launch();
      } catch {
        browser = null;
      }
    });
    after(async () => browser?.close());

    test('gives the same answers as in Node', async (t) => {
      if (!browser) {
        // CI sets LORE_REQUIRE_BROWSERS so a missing engine fails there instead of skipping.
        if (process.env.LORE_REQUIRE_BROWSERS) assert.fail(`${label} could not be launched`);
        t.skip(`${label} is not installed here (CI installs it)`);
        return;
      }
      const folder = readFolder(join(ROOT, 'examples', 'lore'));
      const files = Object.fromEntries(folder.toFiles());
      const expected = {
        issues: folder.validate({ now: new Date(NOW) }),
        index: folder.buildIndex({ now: new Date(NOW) }),
        upcoming: upcoming(folder, { today: TODAY }),
        overdue: overdue(folder, { today: TODAY }),
        brief: brief(folder, 'marta-ruiz', { today: TODAY }),
        match: matchPerson(folder, 'Moreno'),
      };
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.url('lore-core/test/browser/blank.html'));
      const actual = await page.evaluate(
        async ({ files, TODAY, NOW, zipBytes }) => {
          const L = await import('/lore-core/src/index.mjs');
          const folder = L.LoreFolder.fromFiles(files);
          folder.addEntry('sam-okafor', 'notes', { date: TODAY, text: 'Café con Sam — añadido en el navegador' });
          const exported = L.exportArchive(folder);
          const back = await L.importArchive(exported);
          const inflated = await L.readZip(new Uint8Array(zipBytes));
          const fresh = L.LoreFolder.fromFiles(files);
          return {
            issues: fresh.validate({ now: new Date(NOW) }),
            index: fresh.buildIndex({ now: new Date(NOW) }),
            upcoming: L.upcoming(fresh, { today: TODAY }),
            overdue: L.overdue(fresh, { today: TODAY }),
            brief: L.brief(fresh, 'marta-ruiz', { today: TODAY }),
            match: L.matchPerson(fresh, 'Moreno'),
            roundTrip: back.getText('people/sam-okafor.md') === folder.getText('people/sam-okafor.md'),
            inflated: new TextDecoder().decode(inflated[0].data),
            today: L.today(),
            madrid: L.today({ now: new Date('2026-10-13T23:30:00Z'), timeZone: 'Europe/Madrid' }),
          };
        },
        { files, TODAY, NOW, zipBytes: deflatedZip('lore/me.md', 'comprimido ñ') },
      );
      for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], key);
      assert.equal(actual.roundTrip, true, 'export/import round trip');
      assert.equal(actual.inflated, 'comprimido ñ', 'DEFLATE via DecompressionStream');
      assert.match(actual.today, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(actual.madrid, '2026-10-14');
      assert.deepEqual(errors, []);
    });
  });
}
