// Node.js helpers to load and save a Lore folder on disk. Not part of the browser build.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { LoreFolder } from './folder.mjs';

const TEXT = /\.(md|txt|json|yaml|yml)$/i;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/** Read a Lore folder from disk: Markdown and other text files as strings, the rest as bytes. */
export function readFolder(dir) {
  const files = new Map();
  for (const file of walk(dir)) {
    const path = relative(dir, file).split(sep).join('/');
    const bytes = readFileSync(file);
    files.set(path, TEXT.test(path) ? bytes.toString('utf8') : new Uint8Array(bytes));
  }
  return LoreFolder.fromFiles(files);
}

/** Write a folder to disk, replacing what is there. */
export function writeFolder(dir, folder) {
  rmSync(dir, { recursive: true, force: true });
  for (const [path, content] of folder.toFiles()) {
    const target = join(dir, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
