// Helpers shared by Kin's actions: text normalising, showing dates, and finding the person the
// owner means.

import { formatShortDate, parsePersonDate } from '../../lore-core/src/dates.mjs';
import { matchPerson } from '../../lore-core/src/match.mjs';
import { normalizeText } from '../../lore-core/src/text.mjs';

export const n = (s) => normalizeText(s ?? '');
export const has = (text, re) => re.test(` ${n(text)} `);

// Words that make a note sensitive (spec 6.1): health, relationships, money, legal matters.
const SENSITIVE = / (cancer\w*|tumou?r\w*|chemo\w*|quimio\w*|surgery|cirugia|operacion|operar\w*|operad\w*|quirofano|hospital\w*|ingresad\w*|enferm\w*|illness|biops\w*|radioterapia|ictus|stroke|infarto|heart attack|diagnos\w*|depres\w*|ansiedad|anxiety|therap\w*|terapia|psicolog\w*|psychiatr\w*|psiquiatr\w*|medication|medicacion|embarazad\w*|pregnan\w*|abort\w*|miscarriage|divorc\w*|separad\w*|breakup|ruptura|affair|infidel\w*|debt\w*|deuda\w*|unemployed|en paro|despid\w*|fired|laid off|lawsuit|demanda|juicio|arrest\w*|detenid\w*|police|policia|rehab|adiccion|addiction) /;

/** Does this text look sensitive? Keyword detection: it misses things, so the owner can say so. */
export const looksSensitive = (text) => has(text, SENSITIVE);

export function cleanText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function capitalize(name) {
  return name === name.toLowerCase() ? name.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : name;
}

/** "12 abr" / "Apr 12", with the year ("12 abr 1990" / "Apr 12, 1990") when it is not this year. */
export function showDate(iso, ctx) {
  const p = parsePersonDate(iso);
  if (!p) return iso;
  if (!p.year || String(p.year) === ctx.today.slice(0, 4)) return formatShortDate(iso, ctx.lang);
  try {
    return new Intl.DateTimeFormat(ctx.lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(p.year, p.month - 1, p.day)));
  } catch {
    return iso;
  }
}

export const reply = (text, extra = {}) => ({ text, ...extra });

/**
 * Find who the owner means; create them only after the owner confirmed. Before writing, a match
 * that is only a near spelling ("Marte" for Marta) is a question, not a match.
 */
export const FILLER = /^(?:a|al|la|el|de|del|para|con|mi|to|for|with|my|the|about|sobre)\s+|(?:'s|’s)$/giu;

export function resolvePerson(ctx, query, { create = false, write = create } = {}) {
  let q = cleanText(query);
  if (!q) return { reply: ctx.t.needPerson };
  let m = matchPerson(ctx.folder, q);
  // "a Marta", "de Marta", "Marta's": try again without the filler words.
  const bare = cleanText(q.replace(FILLER, '').replace(FILLER, ''));
  if (m.status === 'none' && bare && bare !== q) {
    const retry = matchPerson(ctx.folder, bare);
    if (retry.status !== 'none') [q, m] = [bare, retry];
  }
  if (m.status === 'match' && (m.score >= 0.75 || !write)) return { slug: m.slug, name: m.name };
  if (m.status === 'match') m.suggestions = [{ name: m.name }];
  if (m.status === 'ambiguous') return { reply: ctx.t.ambiguous(q, m.candidates.map((c) => c.name)) };
  if (create && ctx.confirm) {
    const name = capitalize(q);
    const slug = ctx.folder.createPerson({ name });
    return { slug, name, created: true };
  }
  return { reply: ctx.t.notFound(q, m.suggestions.map((s) => s.name)) };
}

export const opts = (ctx) => ({ today: ctx.today, includeSensitive: ctx.includeSensitive });
