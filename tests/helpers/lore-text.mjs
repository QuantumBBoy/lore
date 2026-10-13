// Minimal reader for Lore 0.1 files, used by the spec tests to check that the examples follow
// spec/SPEC.md. It is deliberately small and strict; the real library is lore-core (Phase 3).

import { isAlias, isNode, parseDocument, visit } from 'yaml';

export const LEVELS = ['public', 'private', 'sensitive'];

export const PERSON_SECTIONS = {
  likes: 'Likes & dislikes',
  sizes: 'Sizes',
  diet: 'Dietary restrictions',
  'gift-ideas': 'Gift ideas',
  'gifts-given': 'Gifts given',
  'plan-ideas': 'Plan ideas',
  'follow-ups': 'Follow-ups',
  promises: 'Promises',
  notes: 'Notes log',
};

export const INVERSE_LINK = {
  partner: 'partner', spouse: 'spouse', 'ex-partner': 'ex-partner', parent: 'child', child: 'parent',
  sibling: 'sibling', grandparent: 'grandchild', grandchild: 'grandparent', 'aunt-uncle': 'niece-nephew',
  'niece-nephew': 'aunt-uncle', cousin: 'cousin', 'in-law': 'in-law', friend: 'friend',
  colleague: 'colleague', manager: 'report', report: 'manager', neighbor: 'neighbor',
};

/** Split a Lore file into frontmatter data and body, following section 4.2. */
export function readLoreFile(text) {
  if (text.charCodeAt(0) === 0xfeff) throw new Error('BOM is not allowed');
  if (text.includes('\r')) throw new Error('CR line endings are not allowed');
  const lines = text.split('\n');
  if (lines[0] !== '---') throw new Error("first line must be '---'");
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error('frontmatter is not closed');
  const yamlText = lines.slice(1, end).join('\n');
  const doc = parseDocument(yamlText, { schema: 'core', uniqueKeys: true, prettyErrors: true });
  if (doc.errors.length) throw new Error(`YAML: ${doc.errors[0].message}`);
  visit(doc, (_key, node) => {
    if (isAlias(node)) throw new Error('YAML aliases are not allowed');
    if (isNode(node) && node.anchor) throw new Error('YAML anchors are not allowed');
    if (isNode(node) && node.tag) throw new Error('YAML tags are not allowed');
  });
  const data = doc.toJS() ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('frontmatter must be a mapping');
  return { data, body: lines.slice(end + 1).join('\n') };
}

const ATTR_TOKEN = /^(?:(public|private|sensitive)|#([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*)|([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*)=(?:"((?:[^"\\]|\\.)*)"|([^\s{}"]+)))(?: |$)/;

/** Parse the content of `{…}`; null if it is not a valid attribute block (section 9.5). */
export function parseAttributes(inner) {
  const attrs = {};
  let id = null;
  let rest = inner;
  if (rest === '' || rest.startsWith(' ') || rest.endsWith(' ')) return null;
  while (rest.length) {
    const m = ATTR_TOKEN.exec(rest);
    if (!m) return null;
    const [whole, level, anchor, key, quoted, plain] = m;
    if (level) {
      if ('sensitivity' in attrs) return null;
      attrs.sensitivity = level;
    } else if (anchor) {
      if (id !== null) return null;
      id = anchor;
    } else {
      if (key in attrs) return null;
      attrs[key] = quoted !== undefined ? quoted.replace(/\\(.)/g, '$1') : plain;
    }
    rest = rest.slice(whole.length);
  }
  return { attrs, id };
}

/** Split "text {attrs}" into text and attributes, if the trailing braces parse. */
function splitTrailingAttributes(line) {
  const m = / \{([^{}]*)\}$/.exec(line);
  if (m) {
    const parsed = parseAttributes(m[1]);
    if (parsed) return { text: line.slice(0, m.index), ...parsed };
  }
  return { text: line, attrs: {}, id: null };
}

const ENTRY_DATE = /^(\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?): /;

/** Parse the body into sections and entries (section 9). */
export function parseBody(body) {
  const sections = [];
  const intro = [];
  let current = null;
  let lastEntry = null;
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) {
      const { text, attrs, id } = splitTrailingAttributes(line.slice(3).trim());
      const byTitle = Object.keys(PERSON_SECTIONS).find((k) => PERSON_SECTIONS[k].toLowerCase() === text.trim().toLowerCase());
      current = { title: text.trim(), id: id ?? byTitle ?? null, attrs, entries: [], other: [] };
      sections.push(current);
      lastEntry = null;
      continue;
    }
    const item = /^[-*+] (.*)$/.exec(line);
    if (current && item) {
      let rest = item[1];
      let checked = null;
      const box = /^\[( |x|X)\] /.exec(rest);
      if (box) {
        checked = box[1] !== ' ';
        rest = rest.slice(box[0].length);
      }
      let date = null;
      const d = ENTRY_DATE.exec(rest);
      if (d) {
        date = d[1];
        rest = rest.slice(d[0].length);
      }
      const { text, attrs, id } = splitTrailingAttributes(rest);
      lastEntry = { raw: line, checked, date, text, attrs, idInEntry: id, continuation: [] };
      current.entries.push(lastEntry);
    } else if (lastEntry && /^ {2,}\S/.test(line)) {
      lastEntry.continuation.push(line);
    } else {
      if (line.trim() !== '' && !/^ /.test(line)) lastEntry = null;
      (current ? current.other : intro).push(line);
    }
  }
  return { intro, sections };
}

/** File-level and per-field sensitivity from the frontmatter (section 6.2). */
export function frontmatterSensitivity(data) {
  const s = data.sensitivity;
  if (s === undefined) return { file: 'private', fields: {} };
  if (typeof s === 'string') return { file: s, fields: {} };
  const { default: file = 'private', ...fields } = s;
  return { file, fields };
}

const effective = (level) => (LEVELS.includes(level) ? level : 'sensitive');

/** Every entry with its effective sensitivity (section 6.3). */
export function entriesWithSensitivity(data, parsedBody) {
  const { file } = frontmatterSensitivity(data);
  const out = [];
  for (const section of parsedBody.sections) {
    const sectionLevel = section.attrs.sensitivity ?? file;
    for (const entry of section.entries) {
      out.push({ section, entry, level: effective(entry.attrs.sensitivity ?? sectionLevel) });
    }
  }
  return out;
}
