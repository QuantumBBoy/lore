// A Lore folder held in memory as path → content. Storage (localStorage, disk, a zip) is up to
// the caller: load with LoreFolder.fromFiles(), save what toFiles() returns.

import { LoreFile } from './file.mjs';
import { SECTION_RULES, isKnownSection } from './sections.mjs';
import { SPEC_VERSION, formatErrors, validateFrontmatter } from './schema.mjs';
import { entryLevel, fieldLevel, fileLevel, isVisible, itemLevel } from './sensitivity.mjs';
import { SLUG_RE, slugify, truncate, uniqueSlug } from './text.mjs';
import { parsePersonDate } from './dates.mjs';

export const VERSION = '0.1.0';
export const GENERATOR = `lore-core ${VERSION}`;

export class LoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LoreError';
    this.code = code;
    Object.assign(this, details);
  }
}

/** Inverse link types (spec 8.2). */
export const INVERSE_LINK = {
  partner: 'partner', spouse: 'spouse', 'ex-partner': 'ex-partner', parent: 'child', child: 'parent',
  sibling: 'sibling', grandparent: 'grandchild', grandchild: 'grandparent', 'aunt-uncle': 'niece-nephew',
  'niece-nephew': 'aunt-uncle', cousin: 'cousin', 'in-law': 'in-law', friend: 'friend',
  colleague: 'colleague', manager: 'report', report: 'manager', neighbor: 'neighbor',
};

export const AREA_FILES = ['body.md', 'training.md', 'nutrition.md', 'routines.md', 'preferences.md'];

const PEOPLE = /^people\/([^/]+)\.md$/;

const PERSON_FIELD_ORDER = ['name', 'aliases', 'pronouns', 'relationship', 'birthday', 'dates', 'contact_cadence', 'last_contact', 'links', 'sensitivity'];

/** Fields in the order of spec section 8.2, then any others. */
function orderFields(data) {
  const rank = (k) => (PERSON_FIELD_ORDER.includes(k) ? PERSON_FIELD_ORDER.indexOf(k) : PERSON_FIELD_ORDER.length);
  return Object.fromEntries(Object.entries(data).sort(([a], [b]) => rank(a) - rank(b)));
}

export class LoreFolder {
  /** @param {Map<string, string|Uint8Array>|Object} files paths relative to the folder */
  constructor(files = new Map()) {
    this.raw = new Map(files instanceof Map ? files : Object.entries(files));
    this.parsed = new Map();
    this.changes = 0;
  }

  static fromFiles(files) {
    return new LoreFolder(files);
  }

  /** A new folder with only me.md. */
  static create({ name, language, timezone, ...rest } = {}) {
    if (!name) throw new LoreError('invalid', 'The owner needs a name.');
    const data = { lore: SPEC_VERSION, name, ...(language ? { language } : {}), ...(timezone ? { timezone } : {}), ...rest };
    const errors = validateFrontmatter('me', data);
    if (errors.length) throw new LoreError('invalid', formatErrors(errors).join('; '), { errors });
    const folder = new LoreFolder();
    folder.parsed.set('me.md', LoreFile.create(data, `\n# ${name}\n`, 'me.md'));
    folder.raw.set('me.md', '');
    return folder;
  }

  // -------------------------------------------------------------------------------- files

  paths() {
    return [...this.raw.keys()].sort();
  }

  has(path) {
    return this.raw.has(path);
  }

  /** Text of a file, including unsaved edits. */
  getText(path) {
    if (this.parsed.has(path)) return this.parsed.get(path).toString();
    const v = this.raw.get(path);
    if (v === undefined) return null;
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  }

  /** Replace a whole file. */
  setText(path, text) {
    this.parsed.delete(path);
    this.raw.set(path, text);
  }

  remove(path) {
    this.parsed.delete(path);
    return this.raw.delete(path);
  }

  /** Parsed Lore file at path (cached). Throws when it does not parse. */
  file(path) {
    if (!this.parsed.has(path)) {
      const text = this.getText(path);
      if (text === null) return null;
      this.parsed.set(path, LoreFile.parse(text, path));
    }
    return this.parsed.get(path);
  }

  /** Current contents of every file, with edits applied. */
  toFiles() {
    const out = new Map();
    for (const path of this.paths()) {
      out.set(path, this.parsed.has(path) ? this.parsed.get(path).toString() : this.raw.get(path));
    }
    return out;
  }

  get me() {
    const me = this.file('me.md');
    if (!me) throw new LoreError('no-owner', 'This folder has no me.md.');
    return me;
  }

  /** A setting from me.md, or undefined when me.md is missing or unreadable (queries keep working). */
  setting(key) {
    try {
      return this.file('me.md')?.get(key);
    } catch {
      return undefined;
    }
  }

  get language() {
    return this.setting('language') ?? 'en';
  }

  get leapDay() {
    return this.setting('leap_day') === 'mar1' ? 'mar1' : 'feb28';
  }

  // -------------------------------------------------------------------------------- people

  slugs() {
    return this.paths()
      .map((p) => PEOPLE.exec(p)?.[1])
      .filter(Boolean);
  }

  person(slug) {
    return this.has(`people/${slug}.md`) ? this.file(`people/${slug}.md`) : null;
  }

  requirePerson(slug) {
    const p = this.person(slug);
    if (!p) throw new LoreError('not-found', `No person "${slug}".`, { slug });
    return p;
  }

  /** Display name of a person, or null when their name is sensitive and not requested. */
  nameOf(slug, { includeSensitive = false } = {}) {
    const p = this.person(slug);
    if (!p) return null;
    const level = fieldLevel(p.data, 'name');
    return isVisible(level, { includeSensitive }) ? p.get('name') : null;
  }

  touch() {
    this.changes++;
  }

  /** Create a person. Returns their slug. */
  createPerson(fields) {
    const data = orderFields(Object.fromEntries(Object.entries(fields ?? {}).filter(([, v]) => v !== undefined && v !== null)));
    const errors = validateFrontmatter('person', data);
    if (errors.length) throw new LoreError('invalid', formatErrors(errors).join('; '), { errors });
    const slug = uniqueSlug(slugify(data.name), new Set(this.slugs()));
    const path = `people/${slug}.md`;
    this.raw.set(path, '');
    this.parsed.set(path, LoreFile.create(data, `\n# ${data.name}\n`, path));
    this.touch();
    return slug;
  }

  /**
   * Change frontmatter fields. A value of null removes the field. Throws LoreError('invalid')
   * without changing anything when the result would not be valid.
   */
  updatePerson(slug, patch) {
    const file = this.requirePerson(slug);
    const next = { ...file.data };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    const errors = validateFrontmatter('person', next);
    if (errors.length) throw new LoreError('invalid', formatErrors(errors).join('; '), { errors });
    let changed = 0;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) changed += file.delete(k) ? 1 : 0;
      else changed += file.set(k, v) ? 1 : 0;
    }
    if (changed) this.touch();
    return changed > 0;
  }

  /** Delete a person and every link to them. Returns the slugs whose links were removed. */
  deletePerson(slug) {
    this.requirePerson(slug);
    this.remove(`people/${slug}.md`);
    const updated = [];
    for (const other of this.slugs()) {
      const f = this.file(`people/${other}.md`);
      const links = f.get('links');
      if (!Array.isArray(links) || !links.some((l) => l?.person === slug)) continue;
      const kept = links.filter((l) => l?.person !== slug);
      if (kept.length) f.set('links', kept);
      else f.delete('links');
      updated.push(other);
    }
    this.touch();
    return updated;
  }

  /** Record that the owner was in touch with someone on `date` (keeps the latest date). */
  recordContact(slug, date) {
    const file = this.requirePerson(slug);
    const p = parsePersonDate(date);
    if (!p || p.year === null) throw new LoreError('invalid', `"${date}" is not a full date (YYYY-MM-DD).`);
    const current = file.get('last_contact');
    if (typeof current === 'string' && current >= date) return false;
    file.set('last_contact', date);
    this.touch();
    return true;
  }

  /** "b is a's type", written in both directions when the inverse type is known (spec 8.2). */
  link(a, b, type) {
    if (a === b) throw new LoreError('invalid', 'A person cannot be linked to themselves.');
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(type)) throw new LoreError('invalid', `"${type}" is not a link type (use words like partner, sibling, friend).`);
    const fa = this.requirePerson(a);
    const fb = this.requirePerson(b);
    const set = (file, person, t) => {
      const links = Array.isArray(file.get('links')) ? file.get('links') : [];
      const existing = links.find((l) => l?.person === person);
      if (existing?.type === t) return false;
      const next = existing ? links.map((l) => (l?.person === person ? { ...l, type: t } : l)) : [...links, { person, type: t }];
      file.set('links', next);
      return true;
    };
    let changed = set(fa, b, type);
    const inverse = INVERSE_LINK[type];
    if (inverse) changed = set(fb, a, inverse) || changed;
    if (changed) this.touch();
    return { inverse: inverse ?? null };
  }

  unlink(a, b) {
    let changed = false;
    for (const [x, y] of [[a, b], [b, a]]) {
      const f = this.requirePerson(x);
      const links = f.get('links');
      if (!Array.isArray(links) || !links.some((l) => l?.person === y)) continue;
      const kept = links.filter((l) => l?.person !== y);
      if (kept.length) f.set('links', kept);
      else f.delete('links');
      changed = true;
    }
    if (changed) this.touch();
    return changed;
  }

  // -------------------------------------------------------------------------------- entries

  /** Entries of a section, with their effective sensitivity. */
  entries(slug, sectionId) {
    const file = this.requirePerson(slug);
    return file.body.sections
      .filter((s) => s.id === sectionId)
      .flatMap((s) => s.entries.map((e) => ({ ...e, level: entryLevel(file.data, s, e, file.path) })));
  }

  /**
   * Add an entry to a person's section. Notes go first (newest first); others last.
   * @param {{text: string, date?: string, checked?: boolean, attrs?: object}} entry
   */
  addEntry(slug, sectionId, entry) {
    const file = this.requirePerson(slug);
    if (!isKnownSection(sectionId) && !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(sectionId)) {
      throw new LoreError('invalid', `Unknown section "${sectionId}".`);
    }
    const rules = SECTION_RULES[sectionId] ?? {};
    const e = { ...entry };
    if (rules.checkbox && (e.checked === undefined || e.checked === null)) e.checked = false;
    if (rules.dated === 'required' && !e.date) throw new LoreError('invalid', `Entries in ${sectionId} need a date.`);
    if (e.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.date)) throw new LoreError('invalid', `"${e.date}" is not a date (YYYY-MM-DD).`);
    const added = file.body.addEntry(sectionId, e, { position: rules.newestFirst ? 'top' : 'bottom', language: this.language });
    this.touch();
    return added;
  }

  /** Find entries whose text contains `query` (ignoring case and accents). */
  findEntries(slug, sectionId, query = '') {
    const q = normalizeForSearch(query);
    return this.entries(slug, sectionId).filter((e) => normalizeForSearch([e.text, ...e.continuation].join(' ')).includes(q));
  }

  updateEntry(slug, entry, changes) {
    const file = this.requirePerson(slug);
    const updated = file.body.updateEntry(entry, changes);
    this.touch();
    return updated;
  }

  completeEntry(slug, entry, done = true) {
    return this.updateEntry(slug, entry, { checked: done });
  }

  removeEntry(slug, entry) {
    const file = this.requirePerson(slug);
    file.body.removeEntry(entry);
    this.touch();
  }

  /** Record a gift as given; if it came from a gift idea, remove the idea. */
  giveGift(slug, { text, date, occasion, price, idea } = {}) {
    if (idea) this.removeEntry(slug, idea);
    const attrs = {};
    if (occasion) attrs.occasion = occasion;
    if (price) attrs.price = price;
    return this.addEntry(slug, 'gifts-given', { date, text: text ?? idea?.text, attrs });
  }

  // -------------------------------------------------------------------------------- index

  /** Text of INDEX.md (spec section 10). */
  buildIndex({ now = new Date(), generator = GENERATOR } = {}) {
    const stamp = (now instanceof Date ? now : new Date(now)).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const lines = [
      '---',
      `lore: "${SPEC_VERSION}"`,
      `generated: "${stamp}"`,
      `generator: ${generator}`,
      '---',
      '',
      '# Lore index',
      '',
      'Generated. Do not edit. Open only the files you need.',
      '',
    ];
    const topLevel = this.paths().filter((p) => !p.includes('/') && p.endsWith('.md') && p !== 'INDEX.md' && p !== 'me.md');
    const ordered = ['me.md', ...topLevel, ...this.slugs().map((s) => `people/${s}.md`)];
    for (const path of ordered) {
      const summary = this.summarize(path);
      if (summary !== null) lines.push(`- ${path} — ${summary}`);
    }
    return `${lines.join('\n')}\n`;
  }

  regenerateIndex(options) {
    this.setText('INDEX.md', this.buildIndex(options));
  }

  /** One-line summary of a file for INDEX.md, with no sensitive data. null if it is not a Lore file. */
  summarize(path) {
    let file;
    try {
      file = this.file(path);
    } catch {
      return null;
    }
    if (!file) return null;
    const data = file.data;
    const visible = (field) => isVisible(fieldLevel(data, field, path));
    if (path === 'me.md') return visible('name') && data.name ? `${data.name} (owner)` : 'owner';
    if (!path.startsWith('people/')) {
      if (fileLevel(data, path) === 'sensitive') return 'sensitive';
      const title = file.body.intro.find((l) => l.startsWith('# '))?.slice(2).trim();
      return title || path.replace(/\.md$/, '');
    }
    if (!visible('name') || typeof data.name !== 'string') return 'sensitive';
    let head = data.name;
    if (visible('aliases') && Array.isArray(data.aliases) && data.aliases.length) head += ` (aka ${data.aliases.join(', ')})`;
    const parts = [];
    if (visible('relationship') && data.relationship) parts.push(String(data.relationship));
    const links = [];
    if (Array.isArray(data.links)) {
      for (const link of data.links) {
        if (!link || !isVisible(itemLevel(data, 'links', link, path))) continue;
        const other = this.nameOf(link.person);
        if (!other) continue;
        const inverse = INVERSE_LINK[link.type];
        links.push(inverse ? `${inverse} of ${other}` : `${link.type}: ${other}`);
      }
    }
    for (;;) {
      const tail = [...parts, ...links].join('; ');
      const line = tail ? `${head} — ${tail}` : head;
      if (line.length < 120 || links.length === 0) return truncate(line, 119);
      links.pop();
    }
  }

  // -------------------------------------------------------------------------------- validation

  /**
   * Check the folder against the spec.
   * @returns {{path: string, level: 'error'|'warning', message: string}[]}
   */
  validate({ now } = {}) {
    const issues = [];
    const add = (path, level, message) => issues.push({ path, level, message });
    const check = (path, type) => {
      let file;
      try {
        file = this.file(path);
      } catch (e) {
        add(path, 'error', e.message);
        return null;
      }
      for (const msg of formatErrors(validateFrontmatter(type, file.data))) add(path, 'error', msg);
      return file;
    };

    if (!this.has('me.md')) add('me.md', 'error', 'me.md is missing.');
    else {
      const me = check('me.md', 'me');
      if (me && me.get('lore') !== SPEC_VERSION) add('me.md', 'error', `Lore version "${me.get('lore')}" is not supported (expected "${SPEC_VERSION}").`);
    }
    for (const area of AREA_FILES) if (this.has(area)) check(area, 'area');

    const slugs = new Set(this.slugs());
    for (const slug of slugs) {
      const path = `people/${slug}.md`;
      if (!SLUG_RE.test(slug) || slug.length > 64) add(path, 'error', `"${slug}" is not a valid slug (lowercase letters, digits and single hyphens).`);
      const file = check(path, 'person');
      if (!file) continue;
      for (const link of Array.isArray(file.get('links')) ? file.get('links') : []) {
        if (!link?.person) continue;
        if (!slugs.has(link.person)) {
          add(path, 'warning', `links to "${link.person}", who is not in people/.`);
          continue;
        }
        const inverse = INVERSE_LINK[link.type];
        if (!inverse) continue;
        const other = this.person(link.person);
        let back = [];
        try {
          back = other.get('links') ?? [];
        } catch {
          continue;
        }
        if (!back.some((l) => l?.person === slug && l?.type === inverse)) {
          add(path, 'warning', `${link.person} should link back to ${slug} as ${inverse}.`);
        }
      }
      checkBody(file, path, add);
    }
    if (this.has('INDEX.md')) {
      const strip = (t) => t.replace(/^generated: .*$/m, '');
      if (strip(this.getText('INDEX.md')) !== strip(this.buildIndex({ now }))) add('INDEX.md', 'warning', 'INDEX.md is out of date.');
    }
    return issues;
  }
}

const normalizeForSearch = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

function checkBody(file, path, add) {
  const seen = new Set();
  for (const section of file.body.sections) {
    if (section.id && seen.has(section.id)) add(path, 'warning', `section "${section.title}" appears twice.`);
    if (section.id) seen.add(section.id);
    const rules = SECTION_RULES[section.id] ?? {};
    for (const e of section.entries) {
      const where = `"${section.title}": ${e.raw.trim()}`;
      if (rules.dated === 'required' && !e.date) add(path, 'warning', `${where} needs a date.`);
      if (rules.checkbox && e.checked === null) add(path, 'warning', `${where} needs a checkbox ([ ] or [x]).`);
      if (e.date && e.date.length === 10 && !parsePersonDate(e.date)) add(path, 'warning', `${where} has an impossible date.`);
      if ('due' in e.attrs && !parsePersonDate(e.attrs.due)?.year) add(path, 'warning', `${where} has a due date that is not YYYY-MM-DD.`);
      if (section.id === 'promises' && 'type' in e.attrs && !['promised', 'lent', 'borrowed'].includes(e.attrs.type)) {
        add(path, 'warning', `${where} has an unknown promise type "${e.attrs.type}".`);
      }
      if ('sensitivity' in e.attrs && !['public', 'private', 'sensitive'].includes(e.attrs.sensitivity)) {
        add(path, 'warning', `${where} has an unknown sensitivity level; it is treated as sensitive.`);
      }
    }
  }
}
