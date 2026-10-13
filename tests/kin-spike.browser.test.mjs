// Headless-browser test for the kin-spike skill. Builds the Pages site, serves it under /lore/
// like GitHub Pages does, and drives window.ai_edge_gallery_get_result the way the app does.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { buildSite } from '../tools/build-site.mjs';
import { startStaticServer } from './helpers/static-server.mjs';
import { appOutcome } from './helpers/gallery-app.mjs';

const SKILL = 'skills/kin-spike';

let site;
let server;
let browser;
const tmp = mkdtempSync(join(tmpdir(), 'lore-spike-'));

before(async () => {
  site = buildSite(join(tmp, 'site')).outDir;
  server = await startStaticServer(site, '/lore/');
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Open the hidden runner page and wait for the entry function, like the app does. */
async function openRunner(context, url = server.url(`${SKILL}/scripts/index.html`)) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.ai_edge_gallery_get_result === 'function', null, { timeout: 10000 });
  page.pageErrors = errors;
  return page;
}

/** Call the skill with a raw data string; return what the app would hand to the model. */
async function call(page, data) {
  const raw = await page.evaluate((d) => window.ai_edge_gallery_get_result(d, ''), data);
  assert.equal(typeof raw, 'string', 'the entry function must resolve to a string');
  const outcome = appOutcome(raw);
  assert.ok(outcome.parsed, `the app could not parse the response, the model would get raw JSON: ${raw}`);
  if (outcome.status === 'succeeded') assert.ok(outcome.result.length < 800, 'results must stay bite-sized');
  return outcome;
}

const json = (o) => JSON.stringify(o);

describe('kin-spike runner', () => {
  test('write then read, in the same page', async () => {
    const context = await browser.newContext();
    const page = await openRunner(context);

    const w = await call(page, json({ action: 'write', value: 'hello' }));
    assert.equal(w.status, 'succeeded');
    assert.match(w.result, /^Saved "hello" at \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(.+\)\./);
    for (const name of ['localStorage', 'IndexedDB', 'Cache API', 'OPFS', 'cookie']) {
      assert.match(w.result, new RegExp(`${name} ✓`), `${name} should work in Chromium`);
    }
    assert.match(w.result, /Total saved: 1\./);
    assert.equal(w.webview, undefined);

    const r = await call(page, json({ action: 'read' }));
    assert.equal(r.status, 'succeeded');
    assert.match(r.result, /^Kin spike read, /);
    assert.match(r.result, /localStorage: 1 saved \(first .+\), last "hello"/);
    assert.match(r.result, /IndexedDB: 1 saved/);
    assert.match(r.result, /Origin http:\/\/127\.0\.0\.1:\d+, persisted/);
    assert.match(r.result, /call 2\./);
    assert.match(r.webview.url, /^probe\.html\?r=/);
    assert.equal(typeof r.webview.aspectRatio, 'number');
    assert.deepEqual(page.pageErrors, []);
    await context.close();
  });

  test('data survives a full browser restart with the same profile', async () => {
    const profile = join(tmp, 'profile');
    let context = await chromium.launchPersistentContext(profile);
    let page = await openRunner(context);
    await call(page, json({ action: 'write', value: 'before restart' }));
    await context.close();

    context = await chromium.launchPersistentContext(profile);
    page = await openRunner(context);
    const r = await call(page, json({ action: 'read' }));
    for (const name of ['localStorage', 'IndexedDB', 'Cache API', 'OPFS', 'cookie']) {
      assert.match(r.result, new RegExp(`${name}: 1 saved .*last "before restart"`), `${name} lost data`);
    }
    await context.close();
  });

  test('a fresh profile starts empty', async () => {
    const context = await browser.newContext();
    const page = await openRunner(context);
    const r = await call(page, json({ action: 'read' }));
    assert.match(r.result, /localStorage: EMPTY/);
    assert.match(r.result, /IndexedDB: EMPTY/);
    await context.close();
  });

  test('accepts the inputs a small model tends to send', async () => {
    const context = await browser.newContext();
    const page = await openRunner(context);
    const cases = [
      ['{}', /^Kin spike read/],
      ['', /^Kin spike read/],
      [json(json({ action: 'write', value: 'double encoded' })), /^Saved "double encoded"/],
      ['write plain text', /^Saved "plain text"/],
      ['spike write with prefix', /^Saved "with prefix"/],
      ['spike read', /^Kin spike read/],
      [json({ action: ' WRITE ', text: 'text field' }), /^Saved "text field"/],
      [json({ action: 'save', value: 'alias' }), /^Saved "alias"/],
      [json({ value: 'no action' }), /^Saved "no action"/],
      [json({ action: 'write' }), /^Saved "ping"/],
      [json({ action: 'write', value: 'x'.repeat(500) }), new RegExp(`^Saved "${'x'.repeat(120)}" at`)],
      [json({ action: 'write', value: 'Ñandú — café ☕' }), /^Saved "Ñandú — café ☕"/],
    ];
    for (const [data, expected] of cases) {
      const out = await call(page, data);
      assert.equal(out.status, 'succeeded', `input ${data}`);
      assert.match(out.result, expected, `input ${data}`);
    }
    await context.close();
  });

  test('errors reach the app as failures with a readable message', async () => {
    const context = await browser.newContext();
    const page = await openRunner(context);
    for (const [data, expected] of [
      [json({ action: 'delete' }), /unknown action "delete"/],
      [json({ action: 'constructor' }), /unknown action "constructor"/],
      ['{"action": "write", ', /not valid JSON/],
    ]) {
      const out = await call(page, data);
      assert.equal(out.status, 'failed', `input ${data}`);
      assert.match(out.error, expected);
    }
    await context.close();
  });

  test('works without http(s), as a local import might load it', async () => {
    const context = await browser.newContext();
    const page = await openRunner(context, pathToFileURL(join(site, SKILL, 'scripts/index.html')).href);
    const w = await call(page, json({ action: 'write', value: 'local' }));
    assert.equal(w.status, 'succeeded');
    assert.match(w.result, /localStorage ✓/);
    assert.match(w.result, /Cache API ✗ \(unavailable\)/);
    assert.match(w.result, /cookie ✗ \(unavailable\)/);
    const r = await call(page, json({ action: 'read' }));
    assert.match(r.result, /Origin (null|file:)/);
    await context.close();
  });
});

describe('Pages site', () => {
  test('the landing page shows the skill URL; the zip, SKILL.md and spec are served', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e));
    await page.goto(server.url(''));
    assert.equal(await page.locator('code[data-path="skills/kin-spike"]').textContent(), server.url('skills/kin-spike'));
    const zip = await page.request.get(server.url('downloads/kin-spike-local.zip'));
    assert.equal(zip.status(), 200);
    const skillMd = await page.request.get(server.url('skills/kin-spike/SKILL.md'));
    assert.match(await skillMd.text(), /^---\nname: kin-spike\n/);
    // Schema $id URLs of every version resolve on the published site.
    for (const version of ['0.1', '0.2']) {
      for (const name of ['common', 'me', 'person', 'index', 'area']) {
        const res = await page.request.get(server.url(`spec/${version}/${name}.schema.json`));
        assert.equal(res.status(), 200, `${version}/${name}.schema.json`);
        const schema = await res.json();
        assert.equal(new URL(schema.$id).pathname, `/lore/spec/${version}/${name}.schema.json`);
        if (name === 'common') assert.equal(schema.$defs.version.const, version);
      }
      assert.match(await (await page.request.get(server.url(`spec/${version}/SPEC.md`))).text(), new RegExp(`\\*\\*Version ${version.replace('.', '\\.')} \\(draft\\)\\*\\*`));
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
});

describe('kin-spike privacy', () => {
  test('makes no requests beyond its own page', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const urls = [];
    page.on('request', (req) => urls.push(req.url()));
    await page.goto(server.url(`${SKILL}/scripts/index.html`));
    await page.waitForFunction(() => typeof window.ai_edge_gallery_get_result === 'function');
    await call(page, json({ action: 'write', value: 'x' }));
    await call(page, json({ action: 'read' }));
    assert.deepEqual(urls, [server.url(`${SKILL}/scripts/index.html`)]);
    await context.close();
  });

  test('the Content-Security-Policy blocks network access', async () => {
    const context = await browser.newContext();
    const page = await openRunner(context);
    const before = server.requests.length;
    const violations = await page.evaluate(async () => {
      const seen = [];
      document.addEventListener('securitypolicyviolation', (e) => seen.push(e.effectiveDirective));
      const target = location.origin + '/lore/leak';
      await fetch(target).catch(() => {});
      await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', target);
        xhr.onloadend = resolve;
        xhr.send();
      });
      navigator.sendBeacon(target, 'x');
      try { new WebSocket(target.replace(/^http/, 'ws')); } catch { /* blocked synchronously */ }
      const img = new Image();
      img.src = target;
      const script = document.createElement('script');
      script.src = target;
      document.body.appendChild(script);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return seen;
    });
    assert.deepEqual(server.requests.slice(before), [], 'no request may reach the server');
    for (const directive of ['connect-src', 'img-src', 'script-src-elem']) {
      assert.ok(violations.includes(directive), `expected a ${directive} violation, got ${violations}`);
    }
    await context.close();
  });
});

describe('kin-spike inline webview', () => {
  test('sees the same storage as the runner, and can write to it', async () => {
    const context = await browser.newContext();
    const runner = await openRunner(context);
    await call(runner, json({ action: 'write', value: 'one' }));
    const r = await call(runner, json({ action: 'read' }));

    // The app resolves a relative webview URL against <skill url>/assets/.
    const view = await context.newPage();
    const errors = [];
    view.on('pageerror', (e) => errors.push(e));
    await view.goto(server.url(`${SKILL}/assets/${r.webview.url}`));
    await view.locator('#verdict', { hasText: 'Same storage as the runner: YES' }).waitFor();
    assert.equal(await view.locator('#rows tr').count(), 5);

    await view.click('#write');
    await view.locator('#log li', { hasText: 'Saved from webview' }).waitFor();
    const after = await call(runner, json({ action: 'read' }));
    assert.match(after.result, /localStorage: 2 saved .*last "from webview"/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('reports a mismatch when it cannot see the runner data', async () => {
    const context = await browser.newContext();
    const view = await context.newPage();
    const handoff = encodeURIComponent(JSON.stringify({ t: Date.now(), o: 'x', c: { localStorage: 3, IndexedDB: 3 } }));
    await view.goto(server.url(`${SKILL}/assets/probe.html?r=${handoff}`));
    await view.locator('#verdict', { hasText: 'Same storage as the runner: NO' }).waitFor();
    await context.close();
  });

  test('the file picker reads an imported file', async () => {
    const context = await browser.newContext();
    const view = await context.newPage();
    await view.goto(server.url(`${SKILL}/assets/probe.html`));
    await view.setInputFiles('#pick', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from('{"ok":true}') });
    await view.locator('#log li', { hasText: 'Pick: read "backup.json" (11 bytes)' }).waitFor();
    await context.close();
  });
});
