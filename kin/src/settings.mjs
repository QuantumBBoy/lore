// Kin's settings, kept in the Lore folder under the kin namespace (spec section 12): lead times by
// relationship group (me.md kin.lead_days, or kin.lead_days in one person's file), the time of
// day for reminders (kin.remind_at) and the summary the owner asked for (kin.digest). Also the
// parsers that turn the owner's words ("dos semanas", "a las 9", "cada lunes") into those values.

import { foldAccents } from '../../lore-core/src/text.mjs';
import { resolvePeriod } from './when.mjs';

export const GROUPS = ['partner', 'family', 'friend', 'colleague', 'other'];
export const DEFAULT_LEAD_DAYS = { partner: 14, family: 7, friend: 3, colleague: 1, other: 3 };
export const DEFAULT_TIME = '09:00';
export const MAX_LEAD_DAYS = 365;

const words = (s) => ` ${foldAccents(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Relationship words, English and Spanish, by group. Checked in this order, so "best friend" is a
// friend and "brother-in-law" is family.
const RELATIONSHIP_GROUPS = [
  ['partner', /\b(partner|pareja|wife|husband|esposa|esposo|marido|mujer|girlfriend|boyfriend|novia|novio|spouse|conyuge|fiance|fiancee|prometida|prometido)\b/],
  ['family', /\b(family|familia|familiar|mother|father|mom|mum|dad|madre|padre|mama|papa|sister|brother|hermana|hermano|sibling|parent|son|daughter|hijo|hija|child|kid|grandmother|grandfather|grandma|grandpa|granny|abuela|abuelo|aunt|uncle|tia|tio|cousin|prima|primo|niece|nephew|sobrina|sobrino|in law|suegra|suegro|cunada|cunado|nuera|yerno|stepmother|stepfather|madrastra|padrastro|godmother|godfather|madrina|padrino)\b/],
  ['colleague', /\b(colleague|coworker|co worker|workmate|compa(n|ñ)er[oa] de trabajo|boss|jefe|jefa|manager|client|cliente|work|trabajo|oficina|office)\b/],
  ['friend', /\b(friend|friends|amigo|amiga|amigos|amigas|colega|colegas|mate|buddy|compi|vecino|vecina|neighbou?r)\b/],
];

/** The group of a relationship ("hermana" → family); "other" when it is unknown or missing. */
export function groupOf(relationship) {
  const w = words(relationship);
  for (const [group, re] of RELATIONSHIP_GROUPS) if (re.test(w)) return group;
  return 'other';
}

const GROUP_WORDS = [
  ['everyone', /\b(everyone|everybody|all|todos|todas|todo el mundo|cualquiera|everything|todo)\b/],
  ['partner', /\b(partner|pareja|my wife|my husband|esposa|esposo|marido|novia|novio)\b/],
  ['family', /\b(family|familia|familiares|relatives|parientes)\b/],
  ['friend', /\b(friends?|amig[oa]s?)\b/],
  ['colleague', /\b(colleagues?|coworkers?|compa(n|ñ)er[oa]s?|trabajo|work)\b/],
  ['other', /\b(others?|otros|otras|el resto|the rest|demas)\b/],
];

/**
 * A group the owner names instead of a person: "family", "mis amigos", "everyone".
 * @returns {string|null} a group, 'everyone', or null when the words are not a group
 */
export function groupWord(raw) {
  const w = words(raw);
  if (w.trim() === '') return null;
  for (const [group, re] of GROUP_WORDS) {
    if (re.test(w)) {
      // "familia de Marta" is a person's family, not the owner's group.
      if (/\b(de|of)\b \w/.test(w.slice(w.search(re)))) return null;
      return group;
    }
  }
  return null;
}

const asDays = (v) => (Number.isInteger(v) && v >= 0 && v <= MAX_LEAD_DAYS ? v : null);

/** Lead days for every group: me.md's kin.lead_days over the defaults. */
export function leadDays(folder) {
  const set = folder.setting('kin.lead_days');
  const out = { ...DEFAULT_LEAD_DAYS };
  if (set && typeof set === 'object' && !Array.isArray(set)) {
    for (const g of GROUPS) if (asDays(set[g]) !== null) out[g] = set[g];
  }
  return out;
}

/** Lead days for one person: their own kin.lead_days, else their group's. */
export function leadFor(folder, slug) {
  let data = {};
  try {
    data = folder.person(slug)?.data ?? {};
  } catch {
    // unreadable file: use the defaults
  }
  if (asDays(data['kin.lead_days']) !== null) return data['kin.lead_days'];
  return leadDays(folder)[groupOf(data.relationship)];
}

/**
 * How long before ("dos semanas", "3 days", "el mismo día") in days.
 * @returns {number|null}
 */
export function parseLead(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return asDays(Math.round(raw));
  const w = words(raw);
  if (/\b(same day|on the day|that day|the day of|mismo dia|ese dia|el dia|el propio dia)\b/.test(w)) return 0;
  // A fixed reference day, so "un mes" is always 30 days and "un año" 365.
  const days = resolvePeriod(w.replace(/\b(before|antes|ahead|beforehand|de antelacion|in advance|con)\b/g, ' ').trim(), '2001-04-01');
  return days === null ? null : asDays(days);
}

/**
 * A time of day from the owner's words: "9", "9:30", "a las 9", "9 pm", "21h", "9 de la noche".
 * @returns {string|null} "HH:MM"
 */
export function parseClock(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const w = words(String(raw).replace(/(\d)[.:h](\d{2})/g, '$1 $2'));
  const m = /\b(\d{1,2})(?: (\d{2}))?(?: ?(am|pm|a m|p m|h|horas|de la manana|de la tarde|de la noche|in the morning|in the evening|at night))?\b/.exec(w);
  if (!m) {
    if (/\b(noon|mediodia)\b/.test(w)) return '12:00';
    if (/\b(midnight|medianoche)\b/.test(w)) return '00:00';
    return null;
  }
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3] ?? '';
  if (/^(pm|p m|de la tarde|de la noche|in the evening|at night)$/.test(suffix) && hour < 12) hour += 12;
  if (/^(am|a m)$/.test(suffix) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const clockParts = (hhmm) => ({ hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3, 5)) });

/** The time of day for reminders (kin.remind_at), "HH:MM". */
export function remindAt(folder) {
  return parseClock(folder.setting('kin.remind_at')) ?? DEFAULT_TIME;
}

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_WORDS = [
  [/\b(sunday|sundays|domingo|domingos)\b/, 'sunday'],
  [/\b(monday|mondays|lunes)\b/, 'monday'],
  [/\b(tuesday|tuesdays|martes)\b/, 'tuesday'],
  [/\b(wednesday|wednesdays|miercoles)\b/, 'wednesday'],
  [/\b(thursday|thursdays|jueves)\b/, 'thursday'],
  [/\b(friday|fridays|viernes)\b/, 'friday'],
  [/\b(saturday|saturdays|sabado|sabados)\b/, 'saturday'],
];

/**
 * How often the owner wants the summary: "cada lunes" → monday, "every day" → day,
 * "weekly" → monday, "nunca" → off.
 * @returns {string|null} 'day', a weekday, 'off', or null when not understood
 */
export function parseEvery(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const w = words(raw);
  if (/\b(off|never|nunca|stop|para|parar|no more|ya no|cancel|cancelar|quitar|none|ninguno)\b/.test(w)) return 'off';
  for (const [re, day] of WEEKDAY_WORDS) if (re.test(w)) return day;
  if (/\b(day|days|daily|dia|dias|diario|diaria|cada dia|todos los dias|every morning|cada manana|everyday)\b/.test(w)) return 'day';
  if (/\b(week|weekly|semana|semanal|semanalmente|cada semana)\b/.test(w)) return 'monday';
  return null;
}

/** The summary the owner set up (me.md kin.digest), or null. */
export function digestSetting(folder) {
  const d = folder.setting('kin.digest');
  if (!d || typeof d !== 'object') return null;
  const every = d.every === 'day' || WEEKDAYS.includes(d.every) ? d.every : null;
  if (!every) return null;
  return { every, at: parseClock(d.at) ?? DEFAULT_TIME };
}
