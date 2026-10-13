// Effective sensitivity of fields, list items, sections and entries (spec section 6.3).

import { LEVELS } from './attributes.mjs';

export { LEVELS };

/** Unknown levels count as sensitive (fail closed, spec 6.1). */
export const normalizeLevel = (level) => (LEVELS.includes(level) ? level : 'sensitive');

/** Default level of a file when it sets none: body.md holds health data (spec 11). */
export const defaultLevelForPath = (path = '') => (path === 'body.md' ? 'sensitive' : 'private');

export function fileLevel(data, path) {
  const s = data?.sensitivity;
  if (s === undefined || s === null) return defaultLevelForPath(path);
  if (typeof s === 'string') return normalizeLevel(s);
  if (typeof s === 'object' && !Array.isArray(s)) {
    return 'default' in s ? normalizeLevel(s.default) : defaultLevelForPath(path);
  }
  return 'sensitive';
}

export function fieldLevel(data, field, path) {
  const s = data?.sensitivity;
  if (s && typeof s === 'object' && !Array.isArray(s) && field in s) return normalizeLevel(s[field]);
  return fileLevel(data, path);
}

/** Level of an item of `dates` or `links`. */
export function itemLevel(data, field, item, path) {
  if (item && typeof item === 'object' && 'sensitivity' in item) return normalizeLevel(item.sensitivity);
  return fieldLevel(data, field, path);
}

export function sectionLevel(data, section, path) {
  if (section?.attrs && 'sensitivity' in section.attrs) return normalizeLevel(section.attrs.sensitivity);
  return fileLevel(data, path);
}

export function entryLevel(data, section, entry, path) {
  if (entry?.attrs && 'sensitivity' in entry.attrs) return normalizeLevel(entry.attrs.sensitivity);
  return sectionLevel(data, section, path);
}

/** May data at this level be shown? Sensitive data only when the owner explicitly asked. */
export const isVisible = (level, { includeSensitive = false } = {}) => level !== 'sensitive' || includeSensitive;
