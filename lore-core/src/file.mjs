// A Lore file: editable frontmatter plus body, written back with only the changed lines touched.

import { Body } from './body.mjs';
import { Frontmatter, joinLoreText, splitLoreText } from './frontmatter.mjs';
import { formatEntry } from './yaml.mjs';

export class LoreFile {
  /** Parse file text. Throws LoreFormatError or YamlError when it is not a Lore file. */
  static parse(text, path = '') {
    const { yamlLines, body } = splitLoreText(text);
    return new LoreFile(new Frontmatter(yamlLines), body, path);
  }

  /** Build a new file from frontmatter data and body text. */
  static create(data, body = '', path = '') {
    const lines = Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .flatMap(([k, v]) => formatEntry(k, v));
    return new LoreFile(new Frontmatter(lines), body, path);
  }

  constructor(frontmatter, body, path = '') {
    this.frontmatter = frontmatter;
    this.hasBody = body !== null;
    this.body = new Body(body ?? '');
    this.path = path;
  }

  /** Frontmatter as plain data. Do not mutate; use set() and delete(). */
  get data() {
    return this.frontmatter.data;
  }

  get(key) {
    return this.frontmatter.get(key);
  }

  set(key, value) {
    return this.frontmatter.set(key, value);
  }

  delete(key) {
    return this.frontmatter.delete(key);
  }

  toString() {
    const body = this.hasBody || this.body.toString() !== '' ? this.body.toString() : null;
    return joinLoreText(this.frontmatter.lines, body);
  }
}
