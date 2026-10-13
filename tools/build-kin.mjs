#!/usr/bin/env node
// Build the Kin skill's pages. lore-core and Kin are written as ES modules; the skill's pages must
// carry all their code inline (the Content-Security-Policy allows no script files, and a page
// imported as a local skill may not load them). This tiny bundler wraps each module in a function,
// in dependency order, and turns imports and exports into plain variables. It only accepts the
// module syntax this repository uses, and fails loudly on anything else.
//
//   node tools/build-kin.mjs           write skills/kin/scripts/index.html and assets/backup.html
//   node tools/build-kin.mjs --check   fail if they are out of date (CI runs this as a test)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const REEXPORT = /^export\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const LOCAL_EXPORT = /^export\s*\{([^}]*)\};?[ \t]*$/gm;
const DECLARATION = /^export\s+((?:async\s+)?function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;
const FORBIDDEN = [
  [/^export\s+default\b/m, 'export default'],
  [/^export\s*\*/m, 'export *'],
  [/^import\s+[^{'"\s]/m, 'default or namespace import'],
  [/^import\s*['"]/m, 'side-effect import'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/\bimport\.meta\b/, 'import.meta'],
];

const id = (file) => relative(ROOT, file).split(sep).join('/');

/** "a, b as c" → [['a', 'a'], ['b', 'c']] as [local or imported name, exported/bound name]. */
function names(list) {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(s);
      if (!m) throw new Error(`cannot bundle "${s}"`);
      return [m[1], m[2] ?? m[1]];
    });
}

// Rough comment removal, only to look for unsupported syntax (comments may mention it).
const withoutComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function transform(file) {
  let src = readFileSync(file, 'utf8');
  const code = withoutComments(src);
  for (const [re, what] of FORBIDDEN) if (re.test(code)) throw new Error(`${id(file)}: ${what} is not supported by build-kin`);
  const deps = [];
  const exports = [];
  const depId = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`${id(file)}: only relative imports can be bundled ("${spec}")`);
    const target = resolve(dirname(file), spec);
    deps.push(target);
    return id(target);
  };
  src = src.replace(IMPORT, (_, list, spec) => `const { ${names(list).map(([a, b]) => (a === b ? a : `${a}: ${b}`)).join(', ')} } = __m[${JSON.stringify(depId(spec))}];`);
  src = src.replace(REEXPORT, (_, list, spec) => {
    const pairs = names(list);
    for (const [, exported] of pairs) exports.push([exported, exported]);
    return `const { ${pairs.map(([a, b]) => (a === b ? a : `${a}: ${b}`)).join(', ')} } = __m[${JSON.stringify(depId(spec))}];`;
  });
  src = src.replace(LOCAL_EXPORT, (_, list) => {
    for (const [local, exported] of names(list)) exports.push([exported, local]);
    return '';
  });
  src = src.replace(DECLARATION, (_, kind, name) => {
    exports.push([name, name]);
    return `${kind} ${name}`;
  });
  if (/^export\b/m.test(src)) throw new Error(`${id(file)}: an export form build-kin does not understand`);
  const ret = exports.map(([exported, local]) => (exported === local ? exported : `${exported}: ${local}`)).join(', ');
  return { deps, code: `${src.trimEnd()}\nreturn { ${ret} };` };
}

/** Bundle an entry module into an expression that evaluates to its exports. */
export function bundle(entry) {
  const order = [];
  const done = new Set();
  const active = new Set();
  const cache = new Map();
  const visit = (file) => {
    if (done.has(file)) return;
    if (active.has(file)) throw new Error(`import cycle through ${id(file)}`);
    active.add(file);
    const t = transform(file);
    cache.set(file, t);
    for (const dep of t.deps) visit(dep);
    active.delete(file);
    done.add(file);
    order.push(file);
  };
  visit(resolve(entry));
  const modules = order.map((file) => `// ${id(file)}\n__m[${JSON.stringify(id(file))}] = (() => {\n${cache.get(file).code}\n})();`);
  return `(() => {\n'use strict';\nconst __m = Object.create(null);\n${modules.join('\n\n')}\nreturn __m[${JSON.stringify(id(resolve(entry)))}];\n})()`;
}

const PAGES = [
  { template: 'kin/index.template.html', entry: 'kin/src/kin.mjs', out: 'skills/kin/scripts/index.html' },
  { template: 'kin/backup.template.html', entry: 'kin/src/backup.mjs', out: 'skills/kin/assets/backup.html' },
];

/** Build every page. Returns [{out, html}]. */
export function buildKin() {
  return PAGES.map(({ template, entry, out }) => {
    const tpl = readFileSync(join(ROOT, template), 'utf8');
    if (!tpl.includes('/*BUNDLE*/')) throw new Error(`${template} has no /*BUNDLE*/ placeholder`);
    const html = tpl.replace('/*BUNDLE*/', () => bundle(join(ROOT, entry)));
    return { out, html };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const { out, html } of buildKin()) {
    const path = join(ROOT, out);
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // missing
    }
    if (current === html) continue;
    if (check) {
      console.error(`${out} is out of date: run node tools/build-kin.mjs`);
      stale++;
    } else {
      writeFileSync(path, html);
      console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
    }
  }
  process.exitCode = stale ? 1 : 0;
}
