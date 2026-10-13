#!/usr/bin/env node
// Assemble the GitHub Pages site in _site/:
//   _site/.nojekyll                  serve SKILL.md raw (no Jekyll processing)
//   _site/index.html                 landing page with the URL to paste into the app
//   _site/skills/<name>/...          every skill, byte-for-byte
//   _site/downloads/<name>-local.zip copy of a skill renamed <name>-local, for testing "Import local skill"
//   _site/spec/<version>/            SPEC.md and the JSON Schemas, so schema $id URLs resolve
//
// Usage: node tools/build-site.mjs [outDir]

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from '../lore-core/src/zip.mjs';
import { validateSkillMd, validateSkillsRoot } from './validate-skills.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');
const SPEC_DIR = join(ROOT, 'spec');
// Skills that get a renamed copy for the local-import test. The app refuses two skills with the
// same name, so the copy must be called differently from the one loaded by URL.
const LOCAL_IMPORT_VARIANTS = ['kin-spike'];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Build `<name>-local.zip` holding `<name>-local/` with the name rewritten in SKILL.md. */
export function buildLocalVariantZip(skillDir, name) {
  const localName = `${name}-local`;
  const entries = [{ path: `${localName}/` }];
  const dirs = new Set();
  for (const file of listFiles(skillDir).sort()) {
    const rel = relative(skillDir, file).split(sep).join('/');
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) {
      const d = `${localName}/${parts.slice(0, i).join('/')}/`;
      if (!dirs.has(d)) {
        dirs.add(d);
        entries.push({ path: d });
      }
    }
    let data = readFileSync(file);
    if (rel === 'SKILL.md') {
      const md = data.toString('utf8');
      const renamed = md
        .replace(new RegExp(`^name: ${name}$`, 'm'), `name: ${localName}`)
        .replace(/^description: (.*)$/m, (_, d) => `description: LOCAL IMPORT COPY. ${d.replaceAll('spike ', 'local ')}`)
        .replaceAll('"spike write', '"local write')
        .replaceAll('"spike read', '"local read');
      const check = validateSkillMd(renamed, localName);
      if (check.errors.length) throw new Error(`${localName}/SKILL.md is invalid: ${check.errors.join(' ')}`);
      data = Buffer.from(renamed, 'utf8');
    }
    entries.push({ path: `${localName}/${rel}`, data });
  }
  return { fileName: `${localName}.zip`, zip: createZip(entries) };
}

/** Spec version, from the version constant in common.schema.json. */
export function specVersion() {
  const common = JSON.parse(readFileSync(join(SPEC_DIR, 'schemas', 'common.schema.json'), 'utf8'));
  return common.$defs.version.const;
}

function landingPage(skills, downloads, version) {
  const items = skills
    .map(
      (s) => `    <li>
      <h2>${escapeHtml(s.name)}</h2>
      <p>${escapeHtml(s.description)}</p>
      <p class="label">Paste this in the app (Skills → + → Load skill from URL):</p>
      <p><code data-path="skills/${escapeHtml(s.name)}">skills/${escapeHtml(s.name)}</code>
      <button type="button" data-copy="skills/${escapeHtml(s.name)}">Copy</button></p>
      <p><a href="skills/${escapeHtml(s.name)}/SKILL.md">View SKILL.md</a></p>
    </li>`,
    )
    .join('\n');
  const dl = downloads
    .map((d) => `    <li><a href="downloads/${escapeHtml(d)}" download>${escapeHtml(d)}</a> (for the "Import local skill" test)</li>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Lore skills</title>
<style>
  :root { --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: #d2d2d7; --code: #f2f2f7; --accent: #0a66c2; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #000; --fg: #f5f5f7; --muted: #a1a1a6; --line: #38383a; --code: #1c1c1e; --accent: #60a5fa; }
  }
  body { margin: 0 auto; max-width: 640px; padding: 16px; background: var(--bg); color: var(--fg);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--accent); }
  ul { list-style: none; padding: 0; }
  li { border-top: 1px solid var(--line); padding: 8px 0; }
  h2 { font-size: 18px; margin: 8px 0 4px; }
  .label { color: var(--muted); font-size: 14px; margin-bottom: 0; }
  code { display: block; background: var(--code); padding: 8px; border-radius: 8px; word-break: break-all; font-size: 14px; }
  button { margin-top: 6px; min-height: 40px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--code); color: var(--fg); font: inherit; }
</style>
</head>
<body>
<h1>Lore skills</h1>
<p>Skills for <a href="https://github.com/google-ai-edge/gallery">Google AI Edge Gallery</a>, from
<a href="https://github.com/QuantumBBoy/lore">github.com/QuantumBBoy/lore</a>.
They run on your phone and never send your data anywhere.</p>
<ul>
${items}
</ul>
${downloads.length ? `<h2>Downloads</h2>\n<ul>\n${dl}\n</ul>` : ''}
<h2>Lore spec</h2>
<p><a href="spec/${version}/SPEC.md">Lore ${version} specification</a> and its
<a href="https://github.com/QuantumBBoy/lore/tree/main/spec/schemas">JSON Schemas</a>.</p>
<script>
  for (const el of document.querySelectorAll('[data-path]')) {
    el.textContent = new URL(el.dataset.path, location.href).href;
  }
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(new URL(b.dataset.copy, location.href).href);
        b.textContent = 'Copied';
      } catch {
        b.textContent = 'Copy failed: select the text above';
      }
    });
  }
</script>
</body>
</html>
`;
}

export function buildSite(outDir = join(ROOT, '_site')) {
  const results = validateSkillsRoot(SKILLS_DIR);
  const bad = results.filter((r) => r.errors.length);
  if (bad.length) {
    throw new Error(`Invalid skills, run "npm run validate": ${bad.map((r) => r.folder).join(', ')}`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'skills'), { recursive: true });
  cpSync(SKILLS_DIR, join(outDir, 'skills'), { recursive: true });
  writeFileSync(join(outDir, '.nojekyll'), '');

  const downloads = [];
  for (const name of LOCAL_IMPORT_VARIANTS) {
    const { fileName, zip } = buildLocalVariantZip(join(SKILLS_DIR, name), name);
    mkdirSync(join(outDir, 'downloads'), { recursive: true });
    writeFileSync(join(outDir, 'downloads', fileName), zip);
    downloads.push(fileName);
  }

  const version = specVersion();
  const specOut = join(outDir, 'spec', version);
  mkdirSync(specOut, { recursive: true });
  cpSync(join(SPEC_DIR, 'SPEC.md'), join(specOut, 'SPEC.md'));
  for (const f of readdirSync(join(SPEC_DIR, 'schemas'))) cpSync(join(SPEC_DIR, 'schemas', f), join(specOut, f));

  const skills = results.map((r) => r.skill).sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(outDir, 'index.html'), landingPage(skills, downloads, version));
  return { outDir, skills: skills.map((s) => s.name), downloads, specVersion: version };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ? join(process.cwd(), process.argv[2]) : undefined;
  const { outDir, skills, downloads, specVersion: version } = buildSite(out);
  const size = listFiles(outDir).reduce((n, f) => n + statSync(f).size, 0);
  console.log(`Built ${relative(process.cwd(), outDir) || '.'}: skills [${skills.join(', ')}], downloads [${downloads.join(', ')}], spec ${version}, ${size} bytes.`);
}
