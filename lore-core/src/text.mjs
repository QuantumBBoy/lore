// Text helpers: slugs (spec 8.1) and the normalisation used to compare names and gifts (spec 15.4).

const SPECIAL = { ß: 'ss', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', œ: 'oe', Œ: 'OE', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', þ: 'th', Þ: 'TH', ı: 'i' };

/** Remove diacritics and fold letters that have no decomposition (ß → ss, ø → o, …). */
export function foldAccents(s) {
  return String(s)
    .replace(/[ßæÆøØœŒłŁđĐþÞı]/g, (c) => SPECIAL[c])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

/** Lowercase, no diacritics, punctuation as spaces, single spaces. */
export function normalizeText(s) {
  return foldAccents(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug from a name, following spec 8.1. */
export function slugify(name) {
  const base = foldAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return base || 'person';
}

/** First free slug among base, base-2, base-3, … */
export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Cut text to at most `max` characters, at a word boundary when possible. */
export function truncate(s, max) {
  const text = String(s).trim();
  if ([...text].length <= max) return text;
  const cut = [...text].slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** Files kept as text (UTF-8) rather than bytes when loaded or imported. */
export const isTextPath = (path) => /\.(md|txt|json|yaml|yml|csv)$/i.test(path);
