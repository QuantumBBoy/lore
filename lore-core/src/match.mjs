// Recognise the person the owner means (spec 15.5): exact names and aliases first, then single
// names ("Marta"), prefixes ("Mart") and small typos ("Mrta"). When two people fit about equally
// well the result is "ambiguous", and the caller must ask the owner before writing anything.

import { normalizeText } from './text.mjs';

const MATCH = 0.6; // below this, nobody matches
const TIE = 0.05; // candidates this close to the best are a tie

/** Optimal string alignment distance (Levenshtein with adjacent transpositions). */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

const similarity = (a, b) => 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);

/** How well `query` names someone called `name` (both normalised), 0 to 1. */
function scoreName(q, name) {
  if (!q || !name) return 0;
  if (q === name) return 1;
  const qt = q.split(' ');
  const nt = name.split(' ');
  if (qt.every((t) => nt.includes(t))) return 0.9; // "marta" in "marta ruiz", "ruiz marta"
  if (q.length >= 3 && nt.some((t) => t.startsWith(q))) return 0.75; // "mart"
  let best = similarity(q, name);
  if (qt.length === 1) for (const t of nt) best = Math.max(best, similarity(q, t));
  return best >= 0.75 ? 0.5 + 0.4 * best - 0.2 : 0; // 0.6 (at 0.75) to 0.7
}

/**
 * Find the person meant by `query`.
 * @returns {{status: 'match', slug, name, score} | {status: 'ambiguous', candidates: {slug, name, score}[]}
 *   | {status: 'none', suggestions: {slug, name, score}[]}}
 */
export function matchPerson(folder, query) {
  const q = normalizeText(query);
  const scored = [];
  for (const slug of folder.slugs()) {
    let data;
    try {
      data = folder.person(slug).data;
    } catch {
      continue;
    }
    const names = [data.name, ...(Array.isArray(data.aliases) ? data.aliases : [])].filter((x) => typeof x === 'string');
    let score = Math.max(0, ...names.map((n) => scoreName(q, normalizeText(n))));
    if (q === slug.replace(/-/g, ' ')) score = 1;
    if (typeof data.relationship === 'string' && normalizeText(data.relationship) === q) score = Math.max(score, 0.85);
    scored.push({ slug, name: typeof data.name === 'string' ? data.name : slug, score: Math.round(score * 1000) / 1000 });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const best = scored[0];
  if (!best || best.score < MATCH) {
    return { status: 'none', query, suggestions: scored.filter((s) => s.score >= 0.4).slice(0, 3) };
  }
  const tied = scored.filter((s) => s.score >= best.score - TIE && s.score >= MATCH);
  if (tied.length > 1) return { status: 'ambiguous', query, candidates: tied };
  return { status: 'match', query, slug: best.slug, name: best.name, score: best.score };
}
