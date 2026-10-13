// What the backup panel (assets/backup.html) does with storage: export the folder as a Lore
// archive (.zip) or as text, read a backup back, preview and apply an import, and undo it. It
// also shares the mistake log (feedback.mjs) for evals.

import { applyImport, archiveName, exportArchive, importArchive, planImport } from '../../lore-core/src/archive.mjs';
import { LoreError, LoreFolder } from '../../lore-core/src/folder.mjs';
import { caseCount, exportCases } from './feedback.mjs';
import { loadFolder, readMeta, readUndo, replaceFolder, clearUndo, saveUndo, writeMeta } from './store.mjs';

export { archiveName };

export function stats(storage) {
  const { folder } = loadFolder(storage);
  const meta = readMeta(storage);
  return { people: folder.slugs().length, lastExport: meta.lastExport, changesSinceExport: meta.changesSinceExport, hasUndo: readUndo(storage) !== null, mistakes: caseCount(storage) };
}

/** The mistake log as evals/cases.jsonl, with names replaced by placeholders. */
export function exportMistakes(storage) {
  return exportCases(storage, loadFolder(storage).folder);
}

/** The whole folder as a Lore archive. */
export function exportZip(storage) {
  return exportArchive(loadFolder(storage).folder);
}

const encodeBytes = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The whole folder as text, for copying when a file cannot be shared. */
export function exportText(storage, today) {
  const files = {};
  for (const [path, content] of loadFolder(storage).folder.toFiles()) {
    files[path] = typeof content === 'string' ? content : { base64: encodeBytes(content) };
  }
  return JSON.stringify({ lore_backup: 1, created: today, files }, null, 1);
}

export function markExported(storage, today) {
  const meta = readMeta(storage);
  meta.lastExport = today;
  meta.changesSinceExport = 0;
  writeMeta(storage, meta);
}

/** Read a backup: a Lore archive (bytes) or the text from exportText. */
export async function readBackup(input) {
  if (typeof input !== 'string') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return importArchive(bytes);
    input = new TextDecoder().decode(bytes);
  }
  let data;
  try {
    data = JSON.parse(input.trim());
  } catch {
    throw new LoreError('bad-archive', 'This is not a Kin backup.');
  }
  if (!data || data.lore_backup !== 1 || typeof data.files !== 'object') throw new LoreError('bad-archive', 'This is not a Kin backup.');
  const files = new Map();
  for (const [path, content] of Object.entries(data.files)) {
    if (typeof content === 'string') files.set(path, content);
    else if (content && typeof content.base64 === 'string') {
      const s = atob(content.base64);
      files.set(path, Uint8Array.from(s, (c) => c.charCodeAt(0)));
    }
  }
  if (!files.has('me.md')) throw new LoreError('bad-archive', 'This backup has no me.md.');
  return LoreFolder.fromFiles(files);
}

/** What an import would change, and how many people the backup has. */
export function preview(storage, incoming) {
  const plan = planImport(loadFolder(storage).folder, incoming);
  return { ...plan, people: incoming.slugs().length };
}

/** Apply an import ('merge' or 'replace'), keeping the current data for undo. */
export function applyBackup(storage, incoming, mode, { today, now = new Date() } = {}) {
  const current = loadFolder(storage).folder;
  const next = applyImport(current, incoming, { mode, now });
  next.regenerateIndex({ now });
  saveUndo(storage, mode, today);
  replaceFolder(storage, next);
  return { people: next.slugs().length };
}

export function undoImport(storage) {
  const undo = readUndo(storage);
  if (!undo) return false;
  replaceFolder(storage, undo.folder);
  clearUndo(storage);
  return true;
}
