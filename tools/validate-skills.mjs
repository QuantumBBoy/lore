#!/usr/bin/env node
// Strict validator for Google AI Edge Gallery skills.
//
// The Gallery app parses SKILL.md with a naive `content.split("---")` and reads `name:` /
// `description:` lines verbatim (no YAML unquoting, no multi-line values). Skills that look
// fine to a YAML parser can still fail to load, or load with garbage names. This validator
// accepts only the subset of syntax that every known parser reads the same way, and then
// cross-checks the result against a line-by-line port of the app's parser.
//
// Usage:
//   node tools/validate-skills.mjs [skillsDir]     validate every skill folder (default: skills)
//   node tools/validate-skills.mjs --site <dir>    validate a built Pages site (<dir>/skills, .nojekyll)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;
// The whole SKILL.md body lands in the context window of a small on-device model.
export const MAX_SKILL_MD_BYTES = 8192;

const TOP_LEVEL_KEYS = new Set(['name', 'description', 'metadata']);
const METADATA_KEYS = new Set(['homepage', 'require-secret', 'require-secret-description']);
const ALLOWED_SKILL_ENTRIES = new Set(['SKILL.md', 'README.md', 'scripts', 'assets']);
const YAML_RESERVED = new Set(['~', 'null', 'true', 'false', 'yes', 'no', 'on', 'off', 'y', 'n']);
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Port of `SkillManager.convertSkillMdToProto` from the Android app
 * (google-ai-edge/gallery, Android/src/app/src/main/java/com/google/ai/edge/gallery/skills/SkillManager.kt).
 * Keep it behaviourally identical: it is the reference for what the app will actually load.
 */
export function galleryParse(md) {
  const parts = md.split('---');
  if (parts.length < 3) {
    return { skill: null, errors: ["Invalid format: Expected at least two '---' sections."] };
  }
  const header = parts[1].trim();
  let name = null;
  let description = null;
  let requireSecret = false;
  let requireSecretDescription = '';
  let homepage = null;
  let startMetadata = false;
  for (const line of header.split(/\r\n|\n|\r/)) {
    const t = line.trim();
    if (t === 'metadata:') {
      startMetadata = true;
      continue;
    }
    if (!startMetadata) {
      if (t.startsWith('name:')) name = t.slice('name:'.length).trim();
      else if (t.startsWith('description:')) description = t.slice('description:'.length).trim();
    } else if (t.startsWith('require-secret:')) {
      requireSecret = t.slice('require-secret:'.length).trim().toLowerCase() === 'true';
    } else if (t.startsWith('require-secret-description:')) {
      requireSecretDescription = t.slice('require-secret-description:'.length).trim();
    } else if (t.startsWith('homepage:')) {
      homepage = t.slice('homepage:'.length).trim();
    }
  }
  const errors = [];
  if (!name) errors.push("Missing or empty 'name' in the header.");
  if (!description) errors.push("Missing or empty 'description' in the header.");
  const instructions = parts.slice(2).join('---').trim();
  if (errors.length) return { skill: null, errors };
  return {
    skill: { name, description, instructions, requireSecret, requireSecretDescription, homepage: homepage ?? '' },
    errors: [],
  };
}

/** Rules for a value that must be read identically by the app (raw text) and by YAML parsers. */
function checkPlainScalar(key, value, errors) {
  if (value === '') {
    errors.push(`'${key}' is empty.`);
    return;
  }
  if (/^["'`]/.test(value)) {
    errors.push(`'${key}' is quoted. The app keeps the quotes as part of the value; write it unquoted.`);
  }
  if (/^[|>]/.test(value)) {
    errors.push(`'${key}' uses a YAML block scalar (| or >). The app only reads single-line values.`);
  }
  if (/^[&*!%@,[\]{}#?-](\s|$)|^[&*!%@,[\]{}#]/.test(value)) {
    errors.push(`'${key}' starts with a YAML indicator character ('${value[0]}').`);
  }
  if (/:(\s|$)/.test(value)) {
    errors.push(`'${key}' contains ": " or ends with ":". YAML parsers read that as a nested mapping.`);
  }
  if (/\s#/.test(value)) {
    errors.push(`'${key}' contains " #". YAML parsers drop it as a comment; the app keeps it.`);
  }
  if (YAML_RESERVED.has(value.toLowerCase())) {
    errors.push(`'${key}' is the YAML keyword '${value}', which is not read as a string.`);
  }
}

/**
 * Validate the text of one SKILL.md.
 * @param {string|Uint8Array} input file contents
 * @param {string} folderName name of the folder that contains it
 * @returns {{errors: string[], warnings: string[], skill: object|null}}
 */
export function validateSkillMd(input, folderName) {
  const errors = [];
  const warnings = [];
  let md;
  if (typeof input === 'string') {
    md = input;
  } else {
    try {
      md = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      return { errors: ['SKILL.md is not valid UTF-8.'], warnings, skill: null };
    }
  }

  const bytes = new TextEncoder().encode(md).length;
  if (bytes > MAX_SKILL_MD_BYTES) {
    errors.push(`SKILL.md is ${bytes} bytes; the limit is ${MAX_SKILL_MD_BYTES}. Small on-device models need short instructions.`);
  }
  if (md.charCodeAt(0) === 0xfeff) {
    errors.push('SKILL.md starts with a byte order mark (BOM). Save it as UTF-8 without BOM.');
    md = md.slice(1);
  }
  if (md.includes('\r')) {
    errors.push('SKILL.md contains CR characters. Use LF line endings only.');
    md = md.replace(/\r\n?/g, '\n');
  }

  const lines = md.split('\n');
  if (lines[0] !== '---') {
    errors.push(`The first line must be exactly '---' (found ${JSON.stringify(lines[0])}).`);
    return { errors, warnings, skill: null };
  }
  const close = lines.indexOf('---', 1);
  if (close === -1) {
    errors.push("The frontmatter is not closed by a line that is exactly '---'.");
    return { errors, warnings, skill: null };
  }
  const front = lines.slice(1, close);
  const body = lines.slice(close + 1).join('\n');

  const seen = new Map();
  const metadata = {};
  let inMetadata = false;
  front.forEach((line, i) => {
    const where = `frontmatter line ${i + 2}`;
    if (line.includes('---')) {
      errors.push(`${where} contains '---'. The app splits the whole file on '---', so this breaks parsing.`);
      return;
    }
    if (line.includes('\t')) {
      errors.push(`${where} contains a tab. Use spaces.`);
      return;
    }
    if (line.trim() === '') return;
    if (line !== line.trimEnd()) {
      errors.push(`${where} has trailing whitespace.`);
    }
    const top = /^([A-Za-z0-9_-]+):(?: (.*))?$/.exec(line.trimEnd());
    const nested = /^ {2}([A-Za-z0-9_-]+):(?: (.*))?$/.exec(line.trimEnd());
    if (top) {
      const [, key, rawValue = ''] = top;
      const value = rawValue.trim();
      if (!TOP_LEVEL_KEYS.has(key)) {
        errors.push(`${where}: unknown key '${key}'. Allowed: ${[...TOP_LEVEL_KEYS].join(', ')}.`);
        return;
      }
      if (seen.has(key)) {
        errors.push(`${where}: duplicate key '${key}'.`);
        return;
      }
      if (inMetadata) {
        errors.push(`${where}: '${key}' comes after 'metadata:'. The app ignores name/description there; put them first.`);
        return;
      }
      seen.set(key, value);
      if (key === 'metadata') {
        if (value !== '') errors.push(`${where}: 'metadata:' must have nothing after the colon.`);
        inMetadata = true;
      } else {
        checkPlainScalar(key, value, errors);
      }
    } else if (nested && inMetadata) {
      const [, key, rawValue = ''] = nested;
      const value = rawValue.trim();
      if (!METADATA_KEYS.has(key)) {
        errors.push(`${where}: unknown metadata key '${key}'. Allowed: ${[...METADATA_KEYS].join(', ')}.`);
        return;
      }
      if (key in metadata) {
        errors.push(`${where}: duplicate metadata key '${key}'.`);
        return;
      }
      metadata[key] = value;
      if (key === 'require-secret') {
        if (value !== 'true' && value !== 'false') errors.push(`${where}: 'require-secret' must be true or false.`);
      } else {
        checkPlainScalar(key, value, errors);
        if (key === 'homepage' && !/^https:\/\/[^\s]+$/.test(value)) {
          errors.push(`${where}: 'homepage' must be an https:// URL.`);
        }
      }
    } else if (/^\s+#|^#/.test(line)) {
      errors.push(`${where}: comments are not allowed in the frontmatter.`);
    } else {
      errors.push(`${where}: expected 'key: value' (metadata entries indented by exactly two spaces), got ${JSON.stringify(line)}.`);
    }
  });

  const name = seen.get('name');
  const description = seen.get('description');
  if (name === undefined) errors.push("Missing 'name'.");
  if (description === undefined) errors.push("Missing 'description'.");
  if (seen.has('metadata') && Object.keys(metadata).length === 0) {
    errors.push("'metadata:' block is empty; remove it.");
  }

  if (name) {
    if (!NAME_RE.test(name)) {
      errors.push(`'name' must be kebab-case (lowercase letters, digits, single hyphens): ${JSON.stringify(name)}.`);
    }
    if (name.length > MAX_NAME_LENGTH) errors.push(`'name' is longer than ${MAX_NAME_LENGTH} characters.`);
    if (folderName !== undefined && name !== folderName) {
      errors.push(`'name' (${name}) must match the folder name (${folderName}).`);
    }
  }
  if (folderName !== undefined && !NAME_RE.test(folderName)) {
    errors.push(`Folder name must be kebab-case: ${JSON.stringify(folderName)}.`);
  }
  if (description) {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`'description' is longer than ${MAX_DESCRIPTION_LENGTH} characters.`);
    }
    if (description.length < 20) warnings.push("'description' is very short; the model uses it to decide when to call the skill.");
  }
  if (body.trim() === '') errors.push('SKILL.md has no instructions after the frontmatter.');

  // Cross-check: what the app itself would load must equal what we validated.
  const app = galleryParse(md);
  if (app.errors.length) {
    errors.push(...app.errors.map((e) => `App parser: ${e}`));
  } else if (errors.length === 0) {
    if (app.skill.name !== name) errors.push(`App parser reads name as ${JSON.stringify(app.skill.name)}.`);
    if (app.skill.description !== description) {
      errors.push(`App parser reads description as ${JSON.stringify(app.skill.description)}.`);
    }
    if ((metadata.homepage ?? '') !== app.skill.homepage) {
      errors.push(`App parser reads homepage as ${JSON.stringify(app.skill.homepage)}.`);
    }
  }

  return { errors, warnings, skill: errors.length ? null : { ...app.skill, metadata } };
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** Validate one skill folder: SKILL.md plus the layout the app expects for JS skills. */
export function validateSkillDir(dir, folderName) {
  const errors = [];
  const warnings = [];
  const entries = readdirSync(dir);
  if (!entries.includes('SKILL.md')) {
    const wrongCase = entries.find((e) => e.toLowerCase() === 'skill.md');
    errors.push(wrongCase ? `Found '${wrongCase}'; the file must be named exactly 'SKILL.md'.` : 'Missing SKILL.md.');
    return { errors, warnings, skill: null };
  }
  for (const e of entries) {
    if (!ALLOWED_SKILL_ENTRIES.has(e)) {
      errors.push(`Unexpected entry '${e}'. A skill folder may contain only: ${[...ALLOWED_SKILL_ENTRIES].join(', ')}.`);
    }
  }
  for (const file of listFiles(dir)) {
    const rel = relative(dir, file);
    for (const part of rel.split(/[\\/]/)) {
      if (!FILE_NAME_RE.test(part)) {
        errors.push(`File name '${rel}' must use only letters, digits, '.', '_' and '-' and must not start with a dot.`);
        break;
      }
    }
  }

  const md = validateSkillMd(readFileSync(join(dir, 'SKILL.md')), folderName);
  errors.push(...md.errors);
  warnings.push(...md.warnings);
  if (!md.skill) return { errors, warnings, skill: null };

  const instructions = md.skill.instructions;
  const scriptsDir = join(dir, 'scripts');
  const hasScripts = existsSync(scriptsDir) && statSync(scriptsDir).isDirectory();
  const mentionsRunJs = /\brun_js\b/.test(instructions);
  if (mentionsRunJs && !hasScripts) errors.push("Instructions mention run_js but there is no 'scripts/' folder.");
  if (hasScripts && !mentionsRunJs) errors.push("There is a 'scripts/' folder but the instructions never tell the model to call run_js.");

  if (hasScripts) {
    const referenced = new Set();
    for (const m of instructions.matchAll(/script name\W{0,6}([A-Za-z0-9._-]+\.html)/gi)) referenced.add(m[1]);
    if (referenced.size === 0) referenced.add('index.html');
    for (const script of referenced) {
      const p = join(scriptsDir, script);
      if (!existsSync(p)) {
        errors.push(`Instructions reference script '${script}' but scripts/${script} does not exist.`);
        continue;
      }
      // The entry function may live in a local .js file that the page loads.
      const html = readFileSync(p, 'utf8');
      const sources = [html];
      for (const m of html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) {
        const local = join(scriptsDir, m[1]);
        if (!/^([a-z]+:)?\/\//i.test(m[1]) && existsSync(local)) sources.push(readFileSync(local, 'utf8'));
      }
      if (!sources.some((s) => s.includes('ai_edge_gallery_get_result'))) {
        errors.push(`scripts/${script} never defines window.ai_edge_gallery_get_result.`);
      }
    }
    // Every page a script hands to the app as a webview must exist in assets/.
    for (const file of listFiles(scriptsDir)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/url\s*:\s*[`'"]([A-Za-z0-9._-]+\.html)/g)) {
        if (!existsSync(join(dir, 'assets', m[1]))) {
          errors.push(`${relative(dir, file)} returns webview '${m[1]}' but assets/${m[1]} does not exist.`);
        }
      }
    }
  }
  return { errors, warnings, skill: md.skill };
}

/** Validate every folder directly under a skills/ directory. */
export function validateSkillsRoot(root) {
  const results = [];
  if (!existsSync(root)) return [{ folder: root, errors: [`${root} does not exist.`], warnings: [] }];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      results.push({ folder: entry.name, errors: [`Unexpected file '${entry.name}' in ${root}; only skill folders belong here.`], warnings: [] });
      continue;
    }
    results.push({ folder: entry.name, ...validateSkillDir(join(root, entry.name), entry.name) });
  }
  if (results.length === 0) results.push({ folder: root, errors: ['No skills found.'], warnings: [] });
  return results;
}

/** Validate a built GitHub Pages site. */
export function validateSite(siteDir) {
  const results = validateSkillsRoot(join(siteDir, 'skills'));
  if (!existsSync(join(siteDir, '.nojekyll'))) {
    results.push({ folder: siteDir, errors: ['Missing .nojekyll at the site root; GitHub Pages would run Jekyll.'], warnings: [] });
  }
  return results;
}

function main(argv) {
  const site = argv[0] === '--site';
  const target = site ? argv[1] ?? '_site' : argv[0] ?? 'skills';
  const results = site ? validateSite(target) : validateSkillsRoot(target);
  let failed = 0;
  for (const r of results) {
    const ok = r.errors.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.folder}`);
    for (const e of r.errors) console.log(`       error: ${e}`);
    for (const w of r.warnings ?? []) console.log(`       warning: ${w}`);
  }
  console.log(failed ? `\n${failed} problem(s) in ${target}.` : `\nAll skills in ${target} are valid.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
