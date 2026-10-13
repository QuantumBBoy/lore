// The body of a Lore file as sections and entries over its original lines (spec section 9).
// Edits splice lines in place, so text the program did not touch stays exactly as written.

import { formatAttributes, splitTrailingAttributes } from './attributes.mjs';
import { headingFor, sectionIdFor, sectionOrder } from './sections.mjs';

const ENTRY_START = /^[-*+] (?=\S)/;
const CHECKBOX = /^\[( |x|X)\] /;
const ENTRY_DATE = /^(\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?): /;
const isBlank = (line) => line.trim() === '';
const isIndented = (line) => /^ {2,}\S/.test(line);

/** Parse the first line of an entry: "- [ ] 2026-09-28: text {attrs}". */
export function parseEntryLine(line) {
  let rest = line.replace(ENTRY_START, '');
  let checked = null;
  const box = CHECKBOX.exec(rest);
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
  const { text, attrs } = splitTrailingAttributes(rest);
  return { checked, date, text, attrs };
}

/** Format an entry's first line. Text is made single-line. */
export function formatEntryLine({ checked = null, date = null, text, attrs = {} }) {
  const clean = String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();
  if (!clean) throw new Error('an entry needs text');
  const box = checked === null || checked === undefined ? '' : checked ? '[x] ' : '[ ] ';
  const day = date ? `${date}: ` : '';
  let line = `- ${box}${day}${clean}${formatAttributes(attrs)}`;
  // Text that happens to end in valid attribute syntax would be misread: end it with a full stop.
  if (!Object.keys(attrs).length && splitTrailingAttributes(clean).text !== clean) line += '.';
  return line;
}

function parseLines(lines) {
  const sections = [];
  const headings = [];
  lines.forEach((l, i) => {
    if (l.startsWith('## ')) headings.push(i);
  });
  headings.forEach((h, k) => {
    const end = k + 1 < headings.length ? headings[k + 1] : lines.length;
    const { text, attrs, id } = splitTrailingAttributes(lines[h].slice(3).trim());
    const title = text.trim();
    const section = { index: k, heading: h, end, title, attrs, attrId: id, id: sectionIdFor(title, id), entries: [] };
    for (let i = h + 1; i < end; i++) {
      if (!ENTRY_START.test(lines[i])) continue;
      let j = i + 1;
      while (j < end) {
        if (isIndented(lines[j])) {
          j++;
          continue;
        }
        if (isBlank(lines[j])) {
          let k2 = j;
          while (k2 < end && isBlank(lines[k2])) k2++;
          if (k2 < end && isIndented(lines[k2])) {
            j = k2;
            continue;
          }
        }
        break;
      }
      const parsed = parseEntryLine(lines[i]);
      section.entries.push({
        ...parsed,
        line: i,
        end: j,
        raw: lines[i],
        continuation: lines.slice(i + 1, j),
        sectionId: section.id,
        sectionIndex: k,
      });
      i = j - 1;
    }
    sections.push(section);
  });
  return { introEnd: headings.length ? headings[0] : lines.length, sections };
}

export class Body {
  constructor(text = '') {
    this.lines = String(text).split('\n');
    this.reparse();
  }

  reparse() {
    const { introEnd, sections } = parseLines(this.lines);
    this.introEnd = introEnd;
    this.sections = sections;
  }

  toString() {
    return this.lines.join('\n');
  }

  /** Lines before the first section (title and introduction). */
  get intro() {
    return this.lines.slice(0, this.introEnd);
  }

  sectionsWithId(id) {
    return this.sections.filter((s) => s.id === id);
  }

  /** Entries of every section with this id, in file order (spec 9.1). */
  entries(id) {
    return this.sectionsWithId(id).flatMap((s) => s.entries);
  }

  allEntries() {
    return this.sections.flatMap((s) => s.entries);
  }

  /** Insert lines and reparse. */
  splice(at, remove, ...insert) {
    this.lines.splice(at, remove, ...insert);
    this.reparse();
  }

  /** Make sure a section exists; create it in the recommended order. Returns the section. */
  ensureSection(id, { language = 'en' } = {}) {
    const existing = this.sectionsWithId(id)[0];
    if (existing) return existing;
    const { title, id: attrId } = headingFor(id, language);
    const block = [`## ${title}${attrId ? formatAttributes({}, attrId) : ''}`];
    const order = sectionOrder(id);
    const before = this.sections.find((s) => s.id !== null && sectionOrder(s.id) > order);
    let at;
    if (before) {
      at = before.heading;
      block.push('');
    } else {
      at = this.lines.length;
      if (this.lines[at - 1] === '') at--; // keep the final newline last
    }
    if (at > 0 && !isBlank(this.lines[at - 1])) block.unshift('');
    this.splice(at, 0, ...block);
    return this.sectionsWithId(id)[0];
  }

  /**
   * Add an entry to the first section with this id, creating the section if needed.
   * position: 'top' (newest first, used for notes) or 'bottom'.
   */
  addEntry(id, entry, { position = 'bottom', language = 'en' } = {}) {
    const section = this.ensureSection(id, { language });
    const line = formatEntryLine(entry);
    const { entries } = section;
    if (entries.length) {
      const at = position === 'top' ? entries[0].line : entries[entries.length - 1].end;
      this.splice(at, 0, line);
      return this.findEntryAtLine(at);
    }
    // Empty section: heading, one blank line, the entry, then a blank line before what follows.
    let at = section.heading + 1;
    const insert = [];
    if (at < section.end && isBlank(this.lines[at])) at++;
    else insert.push('');
    const entryAt = at + insert.length;
    insert.push(line);
    const next = this.lines[at];
    if (next === undefined || !isBlank(next)) insert.push('');
    this.splice(at, 0, ...insert);
    return this.findEntryAtLine(entryAt);
  }

  findEntryAtLine(lineIndex) {
    return this.allEntries().find((e) => e.line === lineIndex) ?? null;
  }

  checkFresh(entry) {
    if (this.lines[entry.line] !== entry.raw) throw new Error('the entry changed since it was read; read it again');
  }

  /** Rewrite an entry's first line with new fields; continuation lines are kept. */
  updateEntry(entry, changes) {
    this.checkFresh(entry);
    const next = {
      checked: 'checked' in changes ? changes.checked : entry.checked,
      date: 'date' in changes ? changes.date : entry.date,
      text: 'text' in changes ? changes.text : entry.text,
      attrs: 'attrs' in changes ? changes.attrs : entry.attrs,
    };
    const line = formatEntryLine(next);
    this.splice(entry.line, 1, line);
    return this.findEntryAtLine(entry.line);
  }

  /** Remove an entry with its continuation lines. */
  removeEntry(entry) {
    this.checkFresh(entry);
    this.splice(entry.line, entry.end - entry.line);
  }
}
