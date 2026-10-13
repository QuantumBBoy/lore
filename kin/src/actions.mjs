// Kin's actions. Each takes a context ({folder, today, lang, t, confirm, includeSensitive}) and the
// model's input, changes the folder through lore-core, and returns {text, webview?}. All logic is
// here, not in the model: it only picks the action and passes the user's words.

import { formatShortDate, isCadence, parsePersonDate } from '../../lore-core/src/dates.mjs';
import { matchPerson } from '../../lore-core/src/match.mjs';
import { brief as briefQuery, giftContext, giftHistory, overdue as overdueQuery, personSummary, sameGift, upcoming as upcomingQuery } from '../../lore-core/src/queries.mjs';
import { entryLevel, isVisible } from '../../lore-core/src/sensitivity.mjs';
import { phrases } from '../../lore-core/src/i18n.mjs';
import { normalizeText, truncate } from '../../lore-core/src/text.mjs';
import { resolvePeriod, resolveWhen } from './when.mjs';

export const KINDS = ['gift_idea', 'gift_given', 'follow_up', 'promise', 'note', 'date', 'preference', 'plan'];

// ------------------------------------------------------------------------------------- helpers

const n = (s) => normalizeText(s ?? '');
const has = (text, re) => re.test(` ${n(text)} `);

const KIND_ALIASES = {
  gift_idea: ['gift idea', 'gift', 'idea', 'regalo', 'idea regalo', 'idea de regalo'],
  gift_given: ['gift given', 'gave', 'given', 'gifted', 'regalado', 'regalo hecho'],
  follow_up: ['follow up', 'followup', 'ask', 'question', 'todo', 'to ask', 'preguntar', 'pendiente', 'pregunta'],
  promise: ['promise', 'promesa', 'owe'],
  'promise:lent': ['lent', 'lend', 'loan', 'prestado', 'prestamo', 'preste'],
  'promise:borrowed': ['borrowed', 'borrow', 'me presto'],
  note: ['note', 'nota', 'meeting', 'met', 'contact', 'event', 'log', 'news', 'noticia'],
  date: ['date', 'fecha', 'important date', 'anniversary', 'aniversario', 'name day', 'santo'],
  'date:birthday': ['birthday', 'cumpleanos', 'cumple', 'born'],
  preference: ['preference', 'preferencia', 'like', 'likes', 'dislike', 'dislikes', 'taste', 'gusto', 'gustos', 'size', 'talla', 'diet', 'allergy', 'alergia'],
  plan: ['plan', 'plan idea', 'activity', 'actividad', 'planes'],
};
const KIND_LOOKUP = new Map(Object.entries(KIND_ALIASES).flatMap(([k, words]) => [...(k.includes(':') ? [] : [[k.replace(/_/g, ' '), k]]), ...words.map((w) => [w, k])]));

export function normalizeKind(raw) {
  const key = KIND_LOOKUP.get(n(String(raw ?? '').replace(/_/g, ' ')));
  if (!key) return null;
  const [kind, sub = null] = key.split(':');
  return { kind, sub };
}

const BORROWED = / (borrowed|me (ha |han )?prestad|me presto|me prestaron|me dejo|me ha dejado) /;
const LENT = / (lent|lend|loaned|le (he |hemos )?prestad|le preste|le prestamos|le deje|le he dejado) /;
const SIZES = / (talla|tallas|size|sizes|shoe|shoes|zapato|zapatos|pie|calza|camiseta|t shirt|shirt|ring|anillo|pantalon|pantalones|trousers|jeans|waist|cintura|eu \d+|us \d+) /;
const DIET = / (vegetarian\w*|vegan\w*|alerg\w*|allerg\w*|celiac\w*|gluten|lactos\w*|kosher|halal|no come|doesn t eat|does not eat|no bebe|doesn t drink|does not drink|pescetarian\w*|intoleran\w*) /;
const BIRTHDAY = / (birthday|born|cumple|cumpleanos|nacio|nacimiento) /;
const NAME_DAY = / (santo|onomastica|name day|saint) /;
const MEMORIAL = / (fallecio|fallecimiento|murio|died|death|muerte|memorial|funeral) /;
const ANNIVERSARY = / (aniversario|anniversary|boda|wedding|se casaron|married|novios|together) /;
const SENSITIVE = / (cancer\w*|tumou?r\w*|chemo\w*|quimio\w*|surgery|cirugia|operacion|operar\w*|operad\w*|quirofano|hospital\w*|ingresad\w*|enferm\w*|illness|biops\w*|radioterapia|ictus|stroke|infarto|heart attack|diagnos\w*|depres\w*|ansiedad|anxiety|therap\w*|terapia|psicolog\w*|psychiatr\w*|psiquiatr\w*|medication|medicacion|embarazad\w*|pregnan\w*|abort\w*|miscarriage|divorc\w*|separad\w*|breakup|ruptura|affair|infidel\w*|debt\w*|deuda\w*|unemployed|en paro|despid\w*|fired|laid off|lawsuit|demanda|juicio|arrest\w*|detenid\w*|police|policia|rehab|adiccion|addiction) /;

export const looksSensitive = (text) => has(text, SENSITIVE);

const DATE_IN_TEXT = [
  /\b\d{4}-\d{2}-\d{2}\b/,
  /--\d{2}-\d{2}\b/,
  /\b\d{1,2}(?: de)? [a-záéíóú]+(?:,? (?:de |del )?\d{4})?\b/i,
  /\b[a-z]+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
];

function findDateInText(text, today, lang) {
  for (const re of DATE_IN_TEXT) {
    for (const m of String(text).matchAll(new RegExp(re, 'gi'))) {
      const when = resolveWhen(m[0], today, { direction: 'yearless', lang });
      if (when) return when;
    }
  }
  return null;
}

function cleanText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function capitalize(name) {
  return name === name.toLowerCase() ? name.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : name;
}

/** "12 abr" / "Apr 12", with the year ("12 abr 1990" / "Apr 12, 1990") when it is not this year. */
function showDate(iso, ctx) {
  const p = parsePersonDate(iso);
  if (!p) return iso;
  if (!p.year || String(p.year) === ctx.today.slice(0, 4)) return formatShortDate(iso, ctx.lang);
  try {
    return new Intl.DateTimeFormat(ctx.lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(p.year, p.month - 1, p.day)));
  } catch {
    return iso;
  }
}

const reply = (text, extra = {}) => ({ text, ...extra });

/**
 * Find who the owner means; create them only after the owner confirmed. Before writing, a match
 * that is only a near spelling ("Marte" for Marta) is a question, not a match.
 */
const FILLER = /^(?:a|al|la|el|de|del|para|con|mi|to|for|with|my|the|about|sobre)\s+|(?:'s|’s)$/giu;

function resolvePerson(ctx, query, { create = false, write = create } = {}) {
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

const opts = (ctx) => ({ today: ctx.today, includeSensitive: ctx.includeSensitive });

/** Score entries against the owner's words: containment first, then shared words. */
function matchEntries(entries, query) {
  const q = n(query);
  if (!q) return [];
  const qWords = q.split(' ').filter((w) => w.length >= 3);
  const scored = entries.map((e) => {
    const text = n([e.text, ...(e.continuation ?? [])].join(' '));
    let score = 0;
    if (text.includes(q)) score = 3;
    else if (qWords.length && qWords.every((w) => text.includes(w))) score = 2;
    else if (qWords.length) {
      const hits = qWords.filter((w) => text.includes(w)).length;
      if (hits / qWords.length >= 0.5) score = 1;
    }
    return { e, score };
  });
  const best = Math.max(0, ...scored.map((s) => s.score));
  return best ? scored.filter((s) => s.score === best).map((s) => s.e) : [];
}

const isOpen = (e) => e.checked !== true && e.attrs.status !== 'cancelled';

// ------------------------------------------------------------------------------------- capture

function capture(ctx, input) {
  const { t } = ctx;
  // Without a kind, keep the information as a note rather than lose it.
  const kindInfo = input.kind === undefined || input.kind === null || input.kind === '' ? { kind: 'note', sub: null } : normalizeKind(input.kind);
  if (!kindInfo) return reply(t.badKind(input.kind ?? '', KINDS));
  const text = cleanText(input.text);
  if (!text) return reply(t.needText);
  const who = resolvePerson(ctx, input.person, { create: true });
  if (who.reply) return reply(who.reply);
  const prefix = who.created ? t.added(who.name) : '';
  const sensitive = input.sensitive === true || looksSensitive(text);
  const { kind } = kindInfo;

  if (kind === 'date') return captureDate(ctx, input, who, text, kindInfo.sub, sensitive, prefix);

  const attrs = sensitive ? { sensitivity: 'sensitive' } : {};
  let section;
  let date = ctx.today;
  let extra = '';
  const resolved = input.date ? resolveWhen(input.date, ctx.today, { direction: ['follow_up', 'promise', 'plan'].includes(kind) ? 'future' : 'past', lang: ctx.lang }) : null;
  if (input.date && !resolved) return reply(t.badDate(input.date));

  switch (kind) {
    case 'gift_idea': {
      section = 'gift-ideas';
      const given = giftHistory(ctx.folder, who.slug, { includeSensitive: true }).given.find((g) => sameGift(text, g.text));
      if (given) extra = t.alreadyGiven(given.text, given.date ? showDate(given.date, ctx) : null);
      break;
    }
    case 'gift_given': {
      section = 'gifts-given';
      date = resolved ?? ctx.today;
      const idea = ctx.folder.entries(who.slug, 'gift-ideas').find((e) => sameGift(text, e.text));
      if (idea) {
        ctx.folder.removeEntry(who.slug, idea);
        extra = t.movedFromIdeas;
      }
      break;
    }
    case 'follow_up':
    case 'promise':
    case 'plan': {
      section = { follow_up: 'follow-ups', promise: 'promises', plan: 'plan-ideas' }[kind];
      if (resolved && resolved.length === 10 && resolved > ctx.today && kind !== 'plan') attrs.due = resolved;
      if (kind === 'promise') {
        const type = kindInfo.sub ?? (has(text, BORROWED) ? 'borrowed' : has(text, LENT) ? 'lent' : null);
        if (type) attrs.type = type;
      }
      break;
    }
    case 'note': {
      section = 'notes';
      date = resolved ?? ctx.today;
      break;
    }
    default: {
      section = has(text, SIZES) ? 'sizes' : has(text, DIET) ? 'diet' : 'likes';
      date = null;
    }
  }

  const checkbox = ['follow-ups', 'promises', 'plan-ideas'].includes(section) ? false : null;
  ctx.folder.addEntry(who.slug, section, { checked: checkbox, date, text, attrs });
  if (kind === 'note' && date.length === 10 && date <= ctx.today) ctx.folder.recordContact(who.slug, date);
  return reply(`${prefix}${t.saved(who.name, t.section(section), text)}${sensitive ? t.markedSensitive : ''}${extra}`);
}

function captureDate(ctx, input, who, text, sub, sensitive, prefix) {
  const { t } = ctx;
  const when = input.date
    ? resolveWhen(input.date, ctx.today, { direction: 'yearless', lang: ctx.lang })
    : findDateInText(text, ctx.today, ctx.lang);
  if (!when || !parsePersonDate(when)) return reply(t.badDate(input.date ?? text));
  const file = ctx.folder.person(who.slug);
  if (sub === 'birthday' || has(text, BIRTHDAY)) {
    const old = file.get('birthday');
    if (old === when) return reply(`${prefix}${t.unchanged(who.name, t.field('birthday'))}`);
    if (old && !ctx.confirm) return reply(t.confirmChange(who.name, t.field('birthday'), showDate(old, ctx), showDate(when, ctx)));
    const patch = { birthday: when };
    if (sensitive) patch.sensitivity = withFieldLevel(file.get('sensitivity'), 'birthday', 'sensitive');
    ctx.folder.updatePerson(who.slug, patch);
    return reply(`${prefix}${t.savedBirthday(who.name, showDate(when, ctx))}${sensitive ? t.markedSensitive : ''}`);
  }
  const kind = has(text, MEMORIAL) ? 'memorial' : has(text, NAME_DAY) ? 'name_day' : has(text, ANNIVERSARY) ? 'anniversary' : 'other';
  const label = truncate(text.replace(/[.:]+$/, ''), 60);
  const dates = Array.isArray(file.get('dates')) ? file.get('dates') : [];
  if (dates.some((d) => d.date === when && n(d.label) === n(label))) return reply(`${prefix}${t.savedDate(who.name, label, showDate(when, ctx))}`);
  const item = { label, date: when, kind };
  if (sensitive || kind === 'memorial') item.sensitivity = 'sensitive';
  ctx.folder.updatePerson(who.slug, { dates: [...dates, item] });
  return reply(`${prefix}${t.savedDate(who.name, label, showDate(when, ctx))}${item.sensitivity ? t.markedSensitive : ''}`);
}

function withFieldLevel(sensitivity, field, level) {
  if (sensitivity && typeof sensitivity === 'object') return { ...sensitivity, [field]: level };
  return { default: typeof sensitivity === 'string' ? sensitivity : 'private', [field]: level };
}

// ------------------------------------------------------------------------------------- reading

function person(ctx, input) {
  const { t } = ctx;
  const who = resolvePerson(ctx, input.person);
  if (who.reply) return reply(who.reply);
  const s = personSummary(ctx.folder, who.slug, opts(ctx));
  const lines = [`${s.name}${s.aliases.length ? ` (${s.aliases.join(', ')})` : ''}${s.relationship ? ` — ${s.relationship}` : ''}`];
  if (s.birthday) lines.push(t.birthdayLine(showDate(s.birthday.date, ctx), s.birthday.daysAway, s.birthday.years));
  if (s.daysSinceContact !== null) lines.push(t.contactLine(s.daysSinceContact, s.overdueBy));
  const open = [];
  if (s.counts.openFollowUps) open.push(t.openToAsk(s.counts.openFollowUps));
  if (s.counts.openPromises) open.push(t.openPromises(s.counts.openPromises));
  if (s.counts.giftIdeas) open.push(t.openIdeas(s.counts.giftIdeas));
  if (open.length) lines.push(t.openLine(open));
  if (s.links.length) lines.push(t.links(s.links.map((l) => `${t.linkType(l.type)}: ${l.name}`)));
  if (s.withheld) lines.push(phrases(ctx.lang).withheld(s.withheld));
  return reply(lines.join('\n'));
}

function brief(ctx, input) {
  const who = resolvePerson(ctx, input.person);
  if (who.reply) return reply(who.reply);
  const b = briefQuery(ctx.folder, who.slug, { ...opts(ctx), language: ctx.lang });
  return reply([ctx.t.briefTitle(b.name), ...b.lines.map((l) => `- ${l}`), ...(b.withheldLine ? [b.withheldLine] : [])].join('\n'));
}

function giftContextAction(ctx, input) {
  const { t } = ctx;
  const who = resolvePerson(ctx, input.person);
  if (who.reply) return reply(who.reply);
  const budget = cleanText(input.budget) || null;
  const g = giftContext(ctx.folder, who.slug, { ...opts(ctx), budget });
  const lines = [t.giftTitle(g.name, g.relationship)];
  if (budget) lines.push(t.budget(budget));
  const join = (items, max) => items.slice(0, max).join('; ');
  if (g.likes.length) lines.push(t.likes(join(g.likes, 8)));
  if (g.diet.length) lines.push(t.diet(join(g.diet, 4)));
  if (g.sizes.length) lines.push(t.sizes(join(g.sizes, 4)));
  if (g.ideas.length) lines.push(t.ideas(join(g.ideas.map((i) => `${truncate(i.text, 60)}${i.price ? ` (${i.price})` : ''}`), 6)));
  if (g.given.length) lines.push(t.given(join(g.given.map((x) => `${truncate(x.text, 50)}${x.date ? ` (${x.date.slice(0, 7)})` : ''}`), 6)));
  if (g.nextOccasion && g.nextOccasion.daysAway <= 60) lines.push(t.nextOccasion(g.nextOccasion.label, g.nextOccasion.daysAway));
  if (lines.length === (budget ? 2 : 1)) lines.push(t.noGiftInfo(g.name));
  if (g.withheld) lines.push(phrases(ctx.lang).withheld(g.withheld));
  return reply(lines.join('\n'));
}

const MAX_LIST = 8;

function upcoming(ctx, input) {
  const { t } = ctx;
  // days is usually the user's words ("este mes", "next 3 months"); 30 when missing or unclear.
  const days = Math.min(366, resolvePeriod(input.days ?? input.period ?? input.when, ctx.today) ?? 30);
  const r = upcomingQuery(ctx.folder, { ...opts(ctx), days });
  const lines = r.items.slice(0, MAX_LIST).map((i) => {
    const when = t.inDays(i.daysAway);
    const date = formatShortDate(i.date, ctx.lang);
    return i.kind === 'birthday' ? t.upcomingBirthday(i.name, when, date, i.years) : t.upcomingDate(i.name, i.label, when, date, i.years);
  });
  if (r.items.length > MAX_LIST) lines.push(t.more(r.items.length - MAX_LIST));
  if (!lines.length) lines.push(t.nothingUpcoming(days));
  if (r.withheld) lines.push(phrases(ctx.lang).withheld(r.withheld));
  return reply(lines.join('\n'));
}

function overdue(ctx) {
  const { t } = ctx;
  const r = overdueQuery(ctx.folder, opts(ctx));
  const lines = r.overdue.slice(0, MAX_LIST).map((p) => t.overdueLine(p.name, p.daysSince, t.cadence(p.cadence)));
  if (r.overdue.length > MAX_LIST) lines.push(t.more(r.overdue.length - MAX_LIST));
  if (r.noContact.length) lines.push(t.noContactLine(r.noContact.map((p) => p.name)));
  if (!lines.length) lines.push(t.allCaughtUp());
  if (r.withheld) lines.push(phrases(ctx.lang).withheld(r.withheld));
  return reply(lines.join('\n'));
}

// ------------------------------------------------------------------------------------- changes

function done(ctx, input) {
  const { t } = ctx;
  const who = resolvePerson(ctx, input.person, { write: true });
  if (who.reply) return reply(who.reply);
  const candidates = ['follow-ups', 'promises', 'plan-ideas', 'gift-ideas'].flatMap((id) =>
    ctx.folder.entries(who.slug, id).filter((e) => id === 'gift-ideas' || isOpen(e)).map((e) => ({ ...e, section: id })),
  );
  const visible = (e) => isVisible(e.level, { includeSensitive: ctx.includeSensitive });
  const q = cleanText(input.text);
  const found = q ? matchEntries(candidates, q) : [];
  if (!found.length) {
    const open = candidates.filter((e) => e.section !== 'gift-ideas' && visible(e)).slice(0, 5).map((e) => truncate(e.text, 60));
    return reply(t.noOpenMatch(who.name, q, open));
  }
  if (found.length > 1) return reply(t.whichOne(found.slice(0, 5).map((e) => truncate(e.text, 60))));
  const [entry] = found;
  if (entry.section === 'gift-ideas') {
    ctx.folder.giveGift(who.slug, { idea: entry, date: ctx.today });
    return reply(t.given_(entry.text));
  }
  ctx.folder.completeEntry(who.slug, entry);
  return reply(t.done(entry.text));
}

const FIELD_ALIASES = {
  name: ['name', 'nombre', 'full name'],
  alias: ['alias', 'aliases', 'nickname', 'apodo', 'mote', 'also called'],
  relationship: ['relationship', 'relation', 'relacion', 'parentesco', 'who'],
  birthday: ['birthday', 'cumpleanos', 'cumple', 'birth date', 'fecha de nacimiento'],
  pronouns: ['pronouns', 'pronombres'],
  cadence: ['cadence', 'contact cadence', 'frequency', 'frecuencia', 'how often', 'cada cuanto', 'contact frequency'],
  last_contact: ['last contact', 'last contacted', 'ultimo contacto', 'last seen', 'contact', 'contacto'],
};
const FIELD_LOOKUP = new Map(Object.entries(FIELD_ALIASES).flatMap(([k, words]) => words.map((w) => [w, k])));

const CADENCE_WORDS = {
  daily: '1d', diario: '1d', 'every day': '1d', 'cada dia': '1d', 'todos los dias': '1d',
  weekly: '1w', semanal: '1w', 'every week': '1w', 'cada semana': '1w', 'una vez a la semana': '1w',
  biweekly: '2w', fortnightly: '2w', quincenal: '2w', 'every other week': '2w', 'cada dos semanas': '2w', 'cada quince dias': '2w',
  monthly: '1m', mensual: '1m', 'every month': '1m', 'cada mes': '1m', 'una vez al mes': '1m',
  quarterly: '3m', trimestral: '3m', 'every three months': '3m', 'cada tres meses': '3m',
  yearly: '1y', annually: '1y', anual: '1y', 'every year': '1y', 'cada ano': '1y', 'una vez al ano': '1y',
};
const NUMBERS = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

export function parseCadence(value) {
  const s = n(value);
  if (isCadence(s)) return s;
  if (s in CADENCE_WORDS) return CADENCE_WORDS[s];
  const m = /^(?:every|cada)? ?(\d+|one|a|an|two|three|four|five|six|un|una|uno|dos|tres|cuatro|cinco|seis) (day|days|dia|dias|week|weeks|semana|semanas|month|months|mes|meses|year|years|ano|anos)$/.exec(s);
  if (!m) return null;
  const count = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBERS[m[1]];
  const unit = { d: 'd', w: 'w', s: 'w', m: 'm', y: 'y', a: 'y' }[m[2][0]];
  const c = `${count}${unit}`;
  return isCadence(c) ? c : null;
}

const REMOVE_WORDS = new Set(['', 'none', 'nothing', 'remove', 'delete', 'ninguno', 'ninguna', 'nada', 'borrar', 'quitar']);

function update(ctx, input) {
  const { t } = ctx;
  const field = FIELD_LOOKUP.get(n(String(input.field ?? '').replace(/_/g, ' ')));
  if (!field) return reply(t.needField);
  const who = resolvePerson(ctx, input.person, { write: true });
  if (who.reply) return reply(who.reply);
  const file = ctx.folder.person(who.slug);
  const label = t.field(field);
  const raw = cleanText(input.value ?? input.text);
  const key = { cadence: 'contact_cadence', alias: 'aliases' }[field] ?? field;
  const old = file.get(key);
  const shown = (v) => (Array.isArray(v) ? v.join(', ') : field === 'birthday' || field === 'last_contact' ? showDate(v, ctx) : field === 'cadence' ? t.cadence(v) : String(v));

  if (REMOVE_WORDS.has(n(raw)) && field !== 'alias') {
    if (old === undefined) return reply(t.unchanged(who.name, label));
    if (field === 'name') return reply(t.badValue(label, raw));
    if (!ctx.confirm) return reply(t.confirmRemoveField(who.name, label, shown(old)));
    ctx.folder.updatePerson(who.slug, { [key]: null });
    return reply(t.removedField(who.name, label));
  }

  let value;
  switch (field) {
    case 'alias': {
      const aliases = Array.isArray(old) ? old : [];
      if (!raw) return reply(t.needText);
      if (aliases.some((a) => n(a) === n(raw))) return reply(t.unchanged(who.name, label));
      ctx.folder.updatePerson(who.slug, { aliases: [...aliases, raw] });
      return reply(t.aliasAdded(who.name, raw));
    }
    case 'birthday':
      value = resolveWhen(raw, ctx.today, { direction: 'yearless', lang: ctx.lang });
      if (!value || (value.length !== 10 && !value.startsWith('--'))) return reply(t.badValue(label, raw, t.dateHint));
      break;
    case 'last_contact':
      value = resolveWhen(raw, ctx.today, { direction: 'past', lang: ctx.lang });
      if (!value || value.length !== 10) return reply(t.badValue(label, raw, t.dateHint));
      if (typeof old === 'string' && value >= old) {
        ctx.folder.updatePerson(who.slug, { last_contact: value });
        return reply(t.updated(who.name, label, shown(value)));
      }
      break;
    case 'cadence':
      value = parseCadence(raw);
      if (!value) return reply(t.badValue(label, raw, t.cadenceHint));
      break;
    default:
      if (!raw) return reply(t.badValue(label, raw));
      value = raw;
  }
  if (old === value) return reply(t.unchanged(who.name, label));
  if (old !== undefined && !ctx.confirm) return reply(t.confirmChange(who.name, label, shown(old), shown(value)));
  ctx.folder.updatePerson(who.slug, { [key]: value });
  return reply(t.updated(who.name, label, shown(value)));
}

const LINK_WORDS = {
  partner: ['partner', 'pareja', 'novio', 'novia', 'boyfriend', 'girlfriend'],
  spouse: ['spouse', 'husband', 'wife', 'marido', 'mujer', 'esposo', 'esposa', 'conyuge'],
  'ex-partner': ['ex', 'ex partner', 'expareja', 'ex pareja', 'exnovio', 'exnovia', 'ex wife', 'ex husband'],
  parent: ['parent', 'mother', 'father', 'mom', 'mum', 'dad', 'madre', 'padre', 'mama', 'papa'],
  child: ['child', 'son', 'daughter', 'kid', 'hijo', 'hija'],
  sibling: ['sibling', 'brother', 'sister', 'hermano', 'hermana'],
  grandparent: ['grandparent', 'grandmother', 'grandfather', 'grandma', 'grandpa', 'abuelo', 'abuela'],
  grandchild: ['grandchild', 'grandson', 'granddaughter', 'nieto', 'nieta'],
  'aunt-uncle': ['aunt', 'uncle', 'tio', 'tia'],
  'niece-nephew': ['niece', 'nephew', 'sobrino', 'sobrina'],
  cousin: ['cousin', 'primo', 'prima'],
  'in-law': ['in law', 'in-law', 'suegro', 'suegra', 'cunado', 'cunada', 'yerno', 'nuera'],
  friend: ['friend', 'amigo', 'amiga', 'amistad'],
  colleague: ['colleague', 'coworker', 'co worker', 'companero', 'companera', 'colega', 'companero de trabajo', 'companera de trabajo'],
  manager: ['manager', 'boss', 'jefe', 'jefa'],
  report: ['report', 'employee', 'empleado', 'empleada'],
  neighbor: ['neighbor', 'neighbour', 'vecino', 'vecina'],
};
const LINK_LOOKUP = new Map(Object.entries(LINK_WORDS).flatMap(([k, words]) => words.map((w) => [n(w), k])));

export function parseLinkType(raw) {
  const s = n(raw);
  if (LINK_LOOKUP.has(s)) return LINK_LOOKUP.get(s);
  const slug = s.replace(/ /g, '-');
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function link(ctx, input) {
  const { t } = ctx;
  const type = parseLinkType(input.type ?? input.relationship ?? '');
  if (!input.other) return reply(t.needOther);
  if (!type) return reply(t.needType);
  const a = resolvePerson(ctx, input.person, { create: true });
  if (a.reply) return reply(a.reply);
  const b = resolvePerson(ctx, input.other, { create: true });
  if (b.reply) return reply(b.reply);
  const existing = (ctx.folder.person(a.slug).get('links') ?? []).find((l) => l?.person === b.slug);
  if (existing?.type === type) return reply(t.sameLink(a.name, b.name, t.linkType(type)));
  if (existing && !ctx.confirm) return reply(t.confirmRelink(a.name, b.name, t.linkType(existing.type), t.linkType(type)));
  ctx.folder.link(a.slug, b.slug, type);
  const prefix = (a.created ? t.added(a.name) : '') + (b.created ? t.added(b.name) : '');
  return reply(`${prefix}${t.linked(a.name, b.name, t.linkType(type))}`);
}

function deleteAction(ctx, input) {
  const { t } = ctx;
  const who = resolvePerson(ctx, input.person, { write: true });
  if (who.reply) return reply(who.reply);
  const file = ctx.folder.person(who.slug);
  const q = cleanText(input.text);
  if (!q) {
    const count = file.body.allEntries().length + (Array.isArray(file.get('dates')) ? file.get('dates').length : 0);
    if (!ctx.confirm) return reply(t.confirmDeletePerson(who.name, count));
    ctx.folder.deletePerson(who.slug);
    return reply(t.deletedPerson(who.name));
  }
  const entries = file.body.sections.flatMap((s) => s.entries.map((e) => ({ ...e, level: entryLevel(file.data, s, e, file.path) })));
  const found = matchEntries(entries, q);
  if (!found.length) return reply(t.noEntryMatch(who.name, q));
  if (found.length > 1) return reply(t.whichOne(found.slice(0, 5).map((e) => truncate(e.text, 60))));
  const [entry] = found;
  if (!ctx.confirm) return reply(t.confirmDeleteEntry(who.name, truncate(entry.text, 80)));
  ctx.folder.removeEntry(who.slug, entry);
  return reply(t.deletedEntry(who.name, truncate(entry.text, 80)));
}

// The app shows the panel full width, with height = width / aspectRatio. The panel is laid out to
// fit that box on iPhone widths without scrolling (checked in tests/kin.browser.test.mjs).
export const BACKUP_ASPECT_RATIO = 0.95;

function backup(ctx) {
  const people = ctx.folder.slugs().length;
  const last = ctx.meta.lastExport ? showDate(ctx.meta.lastExport, ctx) : null;
  return reply(ctx.t.backup(people, last), {
    webview: { url: `backup.html?lang=${ctx.lang}`, aspectRatio: BACKUP_ASPECT_RATIO },
  });
}

/** Actions, and whether they can change data. */
export const ACTIONS = {
  capture: { run: capture, writes: true },
  person: { run: person },
  brief: { run: brief },
  gift_context: { run: giftContextAction },
  upcoming: { run: upcoming },
  overdue: { run: overdue },
  done: { run: done, writes: true },
  update: { run: update, writes: true },
  link: { run: link, writes: true },
  delete: { run: deleteAction, writes: true },
  backup: { run: backup },
};

const ACTION_ALIASES = {
  capture: ['capture', 'add', 'save', 'remember', 'note', 'store', 'guardar', 'apuntar', 'anotar'],
  person: ['person', 'who', 'about', 'info', 'summary', 'profile', 'persona', 'quien'],
  brief: ['brief', 'briefing', 'prepare', 'meeting', 'before meeting', 'resumen'],
  gift_context: ['gift context', 'gift', 'gifts', 'gift ideas', 'regalo', 'regalos'],
  upcoming: ['upcoming', 'birthdays', 'dates', 'agenda', 'calendar', 'proximos', 'cumpleanos'],
  overdue: ['overdue', 'catch up', 'lost touch', 'stale', 'contacts', 'pendientes de llamar'],
  done: ['done', 'complete', 'completed', 'check', 'resolved', 'hecho', 'returned', 'devuelto'],
  update: ['update', 'edit', 'change', 'set', 'cambiar', 'actualizar'],
  link: ['link', 'relate', 'relationship', 'connect', 'vincular', 'relacion'],
  delete: ['delete', 'remove', 'forget', 'erase', 'borrar', 'eliminar', 'olvidar'],
  backup: ['backup', 'export', 'import', 'restore', 'copia', 'copia de seguridad', 'exportar', 'importar'],
};
const ACTION_LOOKUP = new Map(Object.entries(ACTION_ALIASES).flatMap(([k, words]) => words.map((w) => [w, k])));

export const normalizeAction = (raw) => ACTION_LOOKUP.get(n(String(raw ?? '').replace(/_/g, ' '))) ?? null;

