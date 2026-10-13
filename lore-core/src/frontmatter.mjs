// Frontmatter that can be edited one key at a time. Every top-level key owns a block of lines
// (its leading comments, the key line and its indented continuation). Changing a key rewrites
// only its block, so the rest stays byte-for-byte as written (spec section 4.4).

import { formatEntry, parseYaml, splitKey } from './yaml.mjs';

export class LoreFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LoreFormatError';
  }
}

/**
 * Split a Lore file into frontmatter lines and body (spec 4.1, 4.2). A BOM is dropped and CRLF
 * becomes LF, as producers must write LF.
 */
export function splitLoreText(text) {
  let t = String(text);
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.replace(/\r\n/g, '\n');
  const lines = t.split('\n');
  if (lines[0] !== '---') throw new LoreFormatError("the first line must be exactly '---'");
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new LoreFormatError("the frontmatter is not closed by a line that is exactly '---'");
  const hasBody = lines.length > end + 1;
  return { yamlLines: lines.slice(1, end), body: hasBody ? lines.slice(end + 1).join('\n') : null };
}

/** Join frontmatter lines and body back into file text. */
export function joinLoreText(yamlLines, body) {
  const fm = yamlLines.length ? `${yamlLines.join('\n')}\n` : '';
  return `---\n${fm}---${body === null ? '' : `\n${body}`}`;
}

const isTopLevelKeyLine = (line) => /^[^\s#]/.test(line) && !/^-(\s|$)/.test(line);

function splitBlocks(lines) {
  const blocks = [];
  let pending = null;
  let current = null;
  lines.forEach((line, i) => {
    if (isTopLevelKeyLine(line)) {
      const kv = splitKey(line);
      if (current) current.end = pending ?? i;
      current = { key: kv.key, start: pending ?? i, keyLine: i, end: lines.length };
      blocks.push(current);
      pending = null;
    } else if (line.trim() === '' || line.startsWith('#')) {
      if (pending === null) pending = i;
    } else {
      pending = null;
    }
  });
  if (current) current.end = pending ?? lines.length;
  return blocks;
}

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class Frontmatter {
  /** @param {string[]} lines YAML lines between the two `---` lines */
  constructor(lines = [], { firstLine = 2 } = {}) {
    this.firstLine = firstLine;
    this.load(lines);
  }

  load(lines) {
    const data = parseYaml(lines.join('\n'), { firstLine: this.firstLine });
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new LoreFormatError('the frontmatter must be a YAML mapping (key: value lines)');
    }
    this.lines = lines;
    this.data = data;
    this.blocks = splitBlocks(lines);
  }

  get(key) {
    return this.data[key];
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }

  /** Set a top-level key, rewriting only its lines (comments above it are kept). */
  set(key, value) {
    if (value === undefined) return this.delete(key);
    if (this.has(key) && deepEqual(this.data[key], value)) return false;
    const fresh = formatEntry(key, value);
    const block = this.blocks.find((b) => b.key === key);
    const lines = [...this.lines];
    if (block) {
      lines.splice(block.keyLine, block.end - block.keyLine, ...fresh);
    } else {
      const at = this.blocks.length ? this.blocks[this.blocks.length - 1].end : lines.length;
      lines.splice(at, 0, ...fresh);
    }
    this.load(lines);
    if (!deepEqual(this.data[key], value)) throw new Error(`internal error: "${key}" did not survive writing`);
    return true;
  }

  /** Remove a top-level key with its block, including the comments just above it. */
  delete(key) {
    const block = this.blocks.find((b) => b.key === key);
    if (!block) return false;
    const lines = [...this.lines];
    let start = block.start;
    while (start < block.keyLine && lines[start].trim() === '') start++; // keep separating blank lines
    lines.splice(start, block.end - start);
    this.load(lines);
    return true;
  }
}
