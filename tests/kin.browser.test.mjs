// Kin as the Gallery app runs it: the built skill page served like GitHub Pages, called through
// window.ai_edge_gallery_get_result with the JSON a model would send, plus the backup panel.
// Runs in Chromium, and in WebKit (the iPhone's engine) when installed, as in CI.

import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { chromium, webkit } from 'playwright';
import { buildSite } from '../tools/build-site.mjs';
import { buildKin } from '../tools/build-kin.mjs';
import { readFolder } from '../lore-core/src/node.mjs';
import { exportArchive, readZip } from '../lore-core/src/index.mjs';
import { startStaticServer } from './helpers/static-server.mjs';
import { appOutcome } from './helpers/gallery-app.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL = 'skills/kin';
const EXAMPLE_FILES = Object.fromEntries(readFolder(join(ROOT, 'examples', 'lore')).toFiles());

let server;
const tmp = mkdtempSync(join(tmpdir(), 'lore-kin-'));
before(async () => {
  server = await startStaticServer(buildSite(join(tmp, 'site')).outDir, '/lore/');
});
after(async () => {
  await server?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('the skill pages are built from the current sources (run node tools/build-kin.mjs)', () => {
  for (const { out, html } of buildKin()) assert.equal(readFileSync(join(ROOT, out), 'utf8'), html, out);
});

/** A context whose storage holds the example folder, as if Kin had been used for a while. */
async function contextWithExample(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(server.url(`${SKILL}/scripts/index.html`));
  await page.evaluate((files) => {
    for (const [path, text] of Object.entries(files)) localStorage.setItem(`lore:v1:file:${path}`, text);
  }, EXAMPLE_FILES);
  await page.close();
  return context;
}

async function openRunner(context) {
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url(`${SKILL}/scripts/index.html`));
  await page.waitForFunction(() => typeof window.ai_edge_gallery_get_result === 'function', null, { timeout: 10000 });
  return { page, requests, errors };
}

async function kin(page, data) {
  const raw = await page.evaluate((d) => window.ai_edge_gallery_get_result(d, ''), typeof data === 'string' ? data : JSON.stringify(data));
  const outcome = appOutcome(raw);
  assert.ok(outcome.parsed, `the app could not parse: ${raw}`);
  if (outcome.status === 'succeeded') assert.ok(outcome.result.length < 1200, `result too long: ${outcome.result}`);
  return outcome;
}

for (const [label, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  describe(`Kin in ${label}`, () => {
    let browser = null;
    before(async () => {
      try {
        browser = await engine.launch();
      } catch {
        browser = null;
      }
    });
    after(async () => browser?.close());

    const needBrowser = (t) => {
      if (browser) return true;
      if (process.env.LORE_REQUIRE_BROWSERS) assert.fail(`${label} could not be launched`);
      t.skip(`${label} is not installed here (CI installs it)`);
      return false;
    };

    test('every action, as a model would call it', async (t) => {
      if (!needBrowser(t)) return;
      const context = await contextWithExample(browser);
      const { page, requests, errors } = await openRunner(context);
      const say = async (d) => (await kin(page, d)).result;

      // capture: the brief's example, an ambiguous name, an unknown person, then creating them
      assert.equal(await say({ action: 'capture', person: 'Marta', kind: 'gift_idea', text: 'Quiere aprender cerámica', date: 'ayer', lang: 'es' }), 'Guardado en Marta Ruiz (ideas de regalo): Quiere aprender cerámica');
      assert.equal(await say({ action: 'capture', person: 'Moreno', kind: 'note', text: 'Llamada', lang: 'es' }), '¿A quién te refieres con "Moreno": Carmen Moreno o Javier Moreno?');
      assert.equal(await say({ action: 'capture', person: 'Paula', kind: 'note', text: 'Met at the climbing gym', lang: 'en' }), 'I don\'t know anyone called "Paula". Should I add "Paula" as a new person?');
      assert.match(await say({ action: 'capture', person: 'Paula', kind: 'note', text: 'Met at the climbing gym', lang: 'en', confirm: true }), /^Added Paula\./);
      assert.match(await say({ action: 'capture', person: 'Luis', kind: 'promise', text: 'Le presté mi taladro', lang: 'es' }), /promesas/);
      assert.match(await say({ action: 'capture', person: 'Sam', kind: 'note', text: 'Going to hospital for tests', lang: 'en' }), /marked sensitive/);

      // reading
      assert.match(await say({ action: 'person', person: 'Javi', lang: 'en' }), /^Javier Moreno \(Javi\) — brother/);
      assert.match(await say({ action: 'brief', person: 'Marta', lang: 'es' }), /^Antes de ver a Marta Ruiz:\n- Pendiente: Ask how the new job is going/);
      const brief = await say({ action: 'brief', person: 'Sam', lang: 'en' });
      assert.ok(!brief.includes('hospital') && /sensitive item hidden/.test(brief));
      assert.match(await say({ action: 'gift_context', person: 'Marta', budget: '50 EUR', lang: 'en' }), /Already given, do not repeat: Ceramic mug/);
      assert.match(await say({ action: 'upcoming', lang: 'en' }), /^Noor Haddad: birthday in \d+ days/);
      assert.match(await say({ action: 'overdue', lang: 'en' }), /Noor Haddad: \d+ days since you last talked/);

      // changes, with confirmations
      assert.equal(await say({ action: 'done', person: 'Marta', text: 'new job', lang: 'en' }), 'Done: Ask how the new job is going');
      assert.match(await say({ action: 'update', person: 'Marta', field: 'birthday', value: '13 April 1990', lang: 'en' }), /Change it to Apr 13, 1990\?$/);
      assert.match(await say({ action: 'update', person: 'Marta', field: 'nickname', value: 'Mar', lang: 'en' }), /also be called "Mar"/);
      assert.match(await say({ action: 'link', person: 'Paula', other: 'Sam', type: 'friend', lang: 'en' }), /^Linked: Sam Okafor is Paula's friend\.$/);
      assert.match(await say({ action: 'delete', person: 'Paula', lang: 'en' }), /^Delete Paula and everything/);
      assert.equal(await say({ action: 'delete', person: 'Paula', lang: 'en', confirm: true }), 'Deleted Paula.');

      // backup opens the panel
      const backup = await kin(page, { action: 'backup', lang: 'es' });
      assert.deepEqual(backup.webview, { url: 'backup.html?lang=es', aspectRatio: 0.95 });

      // errors
      assert.match(await say({ action: 'teleport', lang: 'en' }), /^Unknown action "teleport"/);
      assert.match(await say({ action: 'capture', person: 'Marta', kind: 'poem', text: 'x', lang: 'en' }), /^I don't know what kind of note "poem" is/);
      assert.match(await say({ action: 'capture', person: 'Marta', kind: 'note', text: 'x', date: 'whenever', lang: 'en' }), /couldn't understand the date/);
      const broken = await kin(page, '{"action": ');
      assert.equal(broken.status, 'failed');

      assert.deepEqual(requests, [server.url(`${SKILL}/scripts/index.html`)], 'no network requests');
      assert.deepEqual(errors, []);
      await context.close();
    });

    test('data survives reloading the page', async (t) => {
      if (!needBrowser(t)) return;
      const context = await browser.newContext();
      let { page } = await openRunner(context);
      assert.equal((await kin(page, { action: 'upcoming', lang: 'en' })).result, 'Kin has no data yet. Tell me something about someone to start.');
      await kin(page, { action: 'capture', person: 'Ana Gil', kind: 'date', text: 'birthday', date: '2 March', lang: 'en', confirm: true });
      await page.close();
      ({ page } = await openRunner(context));
      assert.match((await kin(page, { action: 'person', person: 'Ana', lang: 'en' })).result, /^Ana Gil\nBirthday: Mar 2/);
      const keys = await page.evaluate(() => Object.keys(localStorage).sort());
      assert.deepEqual(keys, ['lore:v1:file:INDEX.md', 'lore:v1:file:me.md', 'lore:v1:file:people/ana-gil.md', 'lore:v1:meta']);
      await context.close();
    });

    test('backup panel: share a file, copy text, import with preview, merge, replace and undo', async (t) => {
      if (!needBrowser(t)) return;
      const context = await contextWithExample(browser);
      await context.addInitScript(() => {
        window.__shared = [];
        navigator.share = async (data) => {
          window.__shared.push({ name: data.files[0].name, bytes: [...new Uint8Array(await data.files[0].arrayBuffer())] });
        };
        navigator.canShare = () => true;
        window.__copied = null;
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s) => { window.__copied = s; } }, configurable: true });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(server.url(`${SKILL}/assets/backup.html?lang=es`));
      await page.locator('#stats', { hasText: '6 personas · última copia: nunca' }).waitFor();

      // Share a .zip
      await page.click('#share');
      await page.locator('#status', { hasText: 'Guardada.' }).waitFor();
      const [shared] = await page.evaluate(() => window.__shared);
      assert.match(shared.name, /^lore-\d{4}-\d{2}-\d{2}\.zip$/);
      const entries = await readZip(new Uint8Array(shared.bytes));
      assert.ok(entries.some((e) => e.path === 'lore/people/marta-ruiz.md'));
      await page.locator('#stats', { hasText: '0 cambios' }).waitFor();

      // Copy as text
      await page.click('#copy');
      await page.locator('#status', { hasText: 'Copiada.' }).waitFor();
      const copied = JSON.parse(await page.evaluate(() => window.__copied));
      assert.equal(copied.lore_backup, 1);
      assert.equal(copied.files['people/noor-haddad.md'], EXAMPLE_FILES['people/noor-haddad.md']);

      // Import a zip with one more person: preview, then merge (two taps)
      const folder = readFolder(join(ROOT, 'examples', 'lore'));
      folder.createPerson({ name: 'Ana Gil', relationship: 'neighbor' });
      await page.click('#tabRestore');
      await page.setInputFiles('#pick', { name: 'lore-backup.zip', mimeType: 'application/zip', buffer: Buffer.from(exportArchive(folder)) });
      await page.locator('#planText', { hasText: 'Esta copia tiene 7 personas: 1 archivo nuevo, 0 cambiados, 0 solo en este teléfono.' }).waitFor();
      await page.click('#merge');
      await page.locator('#merge', { hasText: 'Toca otra vez para confirmar' }).waitFor();
      await page.click('#merge');
      await page.locator('#status', { hasText: 'Importado: 7 personas. Puedes deshacerlo.' }).waitFor();
      assert.ok(await page.evaluate(() => localStorage.getItem('lore:v1:file:people/ana-gil.md')));

      // The runner sees the imported person
      const { page: runner } = await openRunner(context);
      assert.match((await kin(runner, { action: 'person', person: 'Ana', lang: 'en' })).result, /^Ana Gil — neighbor/);

      // Undo
      await page.click('#undo');
      await page.locator('#status', { hasText: 'Importación deshecha.' }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('lore:v1:file:people/ana-gil.md')), null);

      // Replace with pasted text that holds only the owner
      await page.fill('#paste', JSON.stringify({ lore_backup: 1, files: { 'me.md': EXAMPLE_FILES['me.md'] } }));
      await page.click('#read');
      await page.locator('#planText', { hasText: '0 personas' }).waitFor();
      await page.click('#replace');
      await page.click('#replace');
      await page.locator('#status', { hasText: 'Importado: 0 personas.' }).waitFor();
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lore:v1:file:people/')).length), 0);

      // Not a backup
      await page.fill('#paste', 'hello');
      await page.click('#read');
      await page.locator('#status', { hasText: 'Esto no es una copia de Kin, o está dañada.' }).waitFor();

      // Cancel a pending import: the file and paste controls come back
      await page.setInputFiles('#pick', { name: 'lore-backup.zip', mimeType: 'application/zip', buffer: Buffer.from(exportArchive(folder)) });
      await page.locator('#plan').waitFor();
      assert.equal(await page.isVisible('#paste'), false);
      await page.click('#cancel');
      await page.locator('#paste').waitFor();
      assert.equal(await page.isVisible('#plan'), false);
      assert.deepEqual(errors, []);
      await context.close();
    });

    test('backup panel without file sharing points to copying', async (t) => {
      if (!needBrowser(t)) return;
      const context = await contextWithExample(browser);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      });
      const page = await context.newPage();
      await page.goto(server.url(`${SKILL}/assets/backup.html?lang=en`));
      await page.click('#share');
      await page.locator('#status', { hasText: 'Sharing files is not available here; use "Copy as text".' }).waitFor();
      await context.close();
    });

    test('backup panel fits the card the app gives it, in every state, without scrolling', async (t) => {
      if (!needBrowser(t)) return;
      const folder = readFolder(join(ROOT, 'examples', 'lore'));
      folder.createPerson({ name: 'Ana Gil' });
      const zip = { name: 'lore-backup.zip', mimeType: 'application/zip', buffer: Buffer.from(exportArchive(folder)) };
      for (const lang of ['es', 'en']) {
        // iPhone widths in points; the app makes the card as wide as the screen.
        for (const width of [360, 375, 393, 430]) {
          const context = await contextWithExample(browser);
          await context.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
          const { page: runner } = await openRunner(context);
          const { aspectRatio } = (await kin(runner, { action: 'backup', lang })).webview;
          const page = await context.newPage();
          await page.setViewportSize({ width, height: Math.floor(width / aspectRatio) });
          await page.goto(server.url(`${SKILL}/assets/backup.html?lang=${lang}`));
          const fits = async (state) => {
            const { content, box } = await page.evaluate(() => ({ content: document.documentElement.scrollHeight, box: window.innerHeight }));
            assert.ok(content <= box, `${lang}, ${width} pt, ${state}: ${content} px of content in a ${box} px card`);
          };
          await page.click('#share'); // the longest status message
          await page.locator('#status.warn').waitFor();
          await fits('save');
          await page.click('#tabRestore');
          await page.setInputFiles('#pick', zip);
          await page.locator('#plan').waitFor();
          await fits('import preview');
          await page.click('#merge');
          await page.click('#merge');
          await page.locator('#undo').waitFor();
          await fits('after import, with undo');
          await page.fill('#paste', 'hello');
          await page.click('#read');
          await page.locator('#status.bad').waitFor();
          await fits('error');
          await context.close();
        }
      }
    });
  });
}
