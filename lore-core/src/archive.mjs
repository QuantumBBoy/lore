// Lore archives: the whole folder as one ZIP file, under a top-level `lore/` directory (spec 14).
// Markdown and other text files come back as strings, anything else as bytes.

import { LoreError, LoreFolder } from './folder.mjs';
import { isTextPath } from './text.mjs';
import { createZip, readZip } from './zip.mjs';

const PREFIX = 'lore/';
const encoder = new TextEncoder();

/** Suggested file name, e.g. lore-2026-10-13.zip. */
export const archiveName = (todayIso) => `lore-${todayIso}.zip`;

/** Pack the folder (all files, including unknown ones and extensions/) into a ZIP. */
export function exportArchive(folder) {
  const files = folder.toFiles();
  const dirs = new Set([PREFIX]);
  for (const path of files.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${PREFIX}${parts.slice(0, i).join('/')}/`);
  }
  const entries = [...dirs].sort().map((path) => ({ path }));
  for (const [path, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    entries.push({ path: PREFIX + path, data: typeof content === 'string' ? encoder.encode(content) : content });
  }
  return createZip(entries, new Date());
}

function safePath(path) {
  if (path.includes('\\') || path.includes('\0')) return false;
  const parts = path.split('/');
  return parts.every((p) => p !== '' && p !== '.' && p !== '..');
}

/**
 * Read a Lore archive. Entries outside lore/ are ignored (spec 14); Markdown files must be UTF-8.
 * Throws LoreError when the archive is not a Lore archive.
 */
export async function importArchive(bytes) {
  let entries;
  try {
    entries = await readZip(bytes);
  } catch (e) {
    throw new LoreError('bad-archive', e.message);
  }
  const files = new Map();
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  for (const entry of entries) {
    if (entry.directory || !entry.path.startsWith(PREFIX)) continue;
    const path = entry.path.slice(PREFIX.length);
    if (!safePath(path)) throw new LoreError('bad-archive', `Unsafe path in archive: ${entry.path}`);
    let text = null;
    if (isTextPath(path)) {
      try {
        text = utf8.decode(entry.data);
      } catch {
        if (/\.md$/i.test(path)) throw new LoreError('bad-archive', `${path} is not UTF-8 text.`);
      }
    }
    files.set(path, text ?? entry.data);
  }
  if (!files.has('me.md')) {
    const hint = entries.some((e) => e.path === 'me.md' || e.path.endsWith('/me.md'))
      ? ' The files must be inside a folder named "lore".'
      : '';
    throw new LoreError('bad-archive', `This is not a Lore archive: lore/me.md is missing.${hint}`);
  }
  return LoreFolder.fromFiles(files);
}

const same = (a, b) => {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  const x = typeof a === 'string' ? encoder.encode(a) : a;
  const y = typeof b === 'string' ? encoder.encode(b) : b;
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** What importing `incoming` over `current` would change. */
export function planImport(current, incoming) {
  const cur = current.toFiles();
  const inc = incoming.toFiles();
  const plan = { added: [], changed: [], removed: [], unchanged: [] };
  for (const [path, content] of inc) {
    if (!cur.has(path)) plan.added.push(path);
    else if (same(cur.get(path), content)) plan.unchanged.push(path);
    else plan.changed.push(path);
  }
  for (const path of cur.keys()) if (!inc.has(path)) plan.removed.push(path);
  return plan;
}

/**
 * Apply an import. 'replace' makes the folder exactly the archive. 'merge' adds new files, takes
 * the archive's version of changed files and keeps the current version of each changed file under
 * conflicts/<timestamp>/ (spec 14: never overwrite silently). Files missing from the archive stay.
 */
export function applyImport(current, incoming, { mode, now = new Date() } = {}) {
  if (mode === 'replace') return LoreFolder.fromFiles(incoming.toFiles());
  if (mode !== 'merge') throw new LoreError('invalid', 'Import mode must be "replace" or "merge".');
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
  const out = current.toFiles();
  const plan = planImport(current, incoming);
  const inc = incoming.toFiles();
  for (const path of plan.changed) {
    out.set(`conflicts/${stamp}/${path}`, out.get(path));
    out.set(path, inc.get(path));
  }
  for (const path of plan.added) out.set(path, inc.get(path));
  return LoreFolder.fromFiles(out);
}
