// Kin keeps the Lore folder in the webview's localStorage, one key per file, all under "lore:v1:"
// (PRIVACY.md: every key is namespaced). Only files that changed are written back.

import { LoreError, LoreFolder } from '../../lore-core/src/folder.mjs';
import { daysBetween } from '../../lore-core/src/dates.mjs';

export const PREFIX = 'lore:v1:';
const FILE = `${PREFIX}file:`;
const BIN = `${PREFIX}bin:`;
const META = `${PREFIX}meta`;
const UNDO = `${PREFIX}undo`;
const SCHEDULE = `${PREFIX}schedule`;

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function storageKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
  return keys;
}

/** Files currently stored, as path -> text or bytes. */
export function readFiles(storage) {
  const files = new Map();
  for (const key of storageKeys(storage)) {
    if (key.startsWith(FILE)) files.set(key.slice(FILE.length), storage.getItem(key));
    else if (key.startsWith(BIN)) files.set(key.slice(BIN.length), fromBase64(storage.getItem(key)));
  }
  return files;
}

export const hasFolder = (storage) => storage.getItem(`${FILE}me.md`) !== null;

/** Load the folder and a snapshot to compare against when saving. */
export function loadFolder(storage) {
  const files = readFiles(storage);
  return { folder: LoreFolder.fromFiles(files), snapshot: files };
}

const sameContent = (a, b) =>
  typeof a === 'string' || typeof b === 'string' ? a === b : a.length === b.length && a.every((v, i) => v === b[i]);

function guard(fn) {
  try {
    return fn();
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      throw new LoreError('storage-full', 'Storage is full.');
    }
    throw e;
  }
}

function writeFile(storage, path, content) {
  if (typeof content === 'string') {
    storage.setItem(`${FILE}${path}`, content);
    storage.removeItem(`${BIN}${path}`);
  } else {
    storage.setItem(`${BIN}${path}`, toBase64(content));
    storage.removeItem(`${FILE}${path}`);
  }
}

/** Write what changed since `snapshot`. Returns the number of files written or removed. */
export function saveFolder(storage, folder, snapshot = new Map()) {
  return guard(() => {
    const files = folder.toFiles();
    let n = 0;
    for (const [path, content] of files) {
      if (snapshot.has(path) && sameContent(snapshot.get(path), content)) continue;
      writeFile(storage, path, content);
      n++;
    }
    for (const path of snapshot.keys()) {
      if (files.has(path)) continue;
      storage.removeItem(`${FILE}${path}`);
      storage.removeItem(`${BIN}${path}`);
      n++;
    }
    return n;
  });
}

/** Replace everything stored with this folder. */
export function replaceFolder(storage, folder) {
  return guard(() => {
    for (const key of storageKeys(storage)) {
      if (key.startsWith(FILE) || key.startsWith(BIN)) storage.removeItem(key);
    }
    for (const [path, content] of folder.toFiles()) writeFile(storage, path, content);
  });
}

// ------------------------------------------------------------------------------- meta and undo

const DEFAULT_META = { firstUse: null, lastExport: null, changesSinceExport: 0, lastNudge: null };

export function readMeta(storage) {
  try {
    return { ...DEFAULT_META, ...JSON.parse(storage.getItem(META) ?? '{}') };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function writeMeta(storage, meta) {
  guard(() => storage.setItem(META, JSON.stringify(meta)));
}

/**
 * Should Kin remind the owner to back up? After `everyChanges` changes, or `everyDays` days with
 * unsaved changes since the last backup (or since first use), and at most once a day.
 */
export function needsNudge(meta, today, { everyDays = 30, everyChanges = 20 } = {}) {
  if (!meta.changesSinceExport) return false;
  if (meta.lastNudge === today) return false;
  if (meta.changesSinceExport >= everyChanges) return true;
  const since = meta.lastExport ?? meta.firstUse;
  return Boolean(since) && daysBetween(since, today) >= everyDays;
}

// ------------------------------------------------------------------------------- schedule

// What Kin handed over to the app's notification scheduler. It belongs to this phone, not to the
// Lore folder: notifications do not travel with a backup. The app cannot list or cancel them, so
// this is how Kin avoids handing over the same reminder twice (spec 15.6).
//   reminders: { id: 'YYYY-MM-DD' (day it was handed over) }
//   digestNext: 'YYYY-MM-DDTHH:MM' (when the next weekly summary notification fires) or null
const DEFAULT_SCHEDULE = { reminders: {}, digestNext: null };

export function readSchedule(storage) {
  try {
    const s = JSON.parse(storage.getItem(SCHEDULE) ?? '{}');
    return { ...DEFAULT_SCHEDULE, ...s, reminders: { ...(s.reminders ?? {}) } };
  } catch {
    return { ...DEFAULT_SCHEDULE, reminders: {} };
  }
}

export function writeSchedule(storage, schedule, today) {
  // Forget reminders whose day has passed: they can no longer be handed over twice.
  for (const id of Object.keys(schedule.reminders)) {
    const at = id.split('|').pop();
    if (today && at.slice(0, 10) < today) delete schedule.reminders[id];
  }
  guard(() => storage.setItem(SCHEDULE, JSON.stringify(schedule)));
}

/** Keep the current folder so an import can be undone. */
export function saveUndo(storage, label, today) {
  const files = {};
  for (const [path, content] of readFiles(storage)) files[path] = typeof content === 'string' ? content : { base64: toBase64(content) };
  guard(() => storage.setItem(UNDO, JSON.stringify({ label, date: today, files })));
}

export function readUndo(storage) {
  try {
    const undo = JSON.parse(storage.getItem(UNDO) ?? 'null');
    if (!undo) return null;
    const files = new Map(Object.entries(undo.files).map(([p, c]) => [p, typeof c === 'string' ? c : fromBase64(c.base64)]));
    return { label: undo.label, date: undo.date, folder: LoreFolder.fromFiles(files) };
  } catch {
    return null;
  }
}

export function clearUndo(storage) {
  storage.removeItem(UNDO);
}

/** In-memory Web Storage, for tests and for running Kin outside a browser. */
export class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(i) {
    return [...this.map.keys()][i] ?? null;
  }

  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    this.map.set(k, String(v));
  }

  removeItem(k) {
    this.map.delete(k);
  }

  clear() {
    this.map.clear();
  }
}
