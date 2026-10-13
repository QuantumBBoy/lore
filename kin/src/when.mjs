// Turn the user's words for a date ("ayer", "last Friday", "12 de abril", "2026-03-14") into a
// Lore date. "Today" always comes from the caller (the runtime clock), never from the model.

import { addDays, addMonths, daysBetween, formatIso, parsePersonDate } from '../../lore-core/src/dates.mjs';
import { foldAccents } from '../../lore-core/src/text.mjs';

const MONTHS = {
  january: 1, jan: 1, enero: 1, ene: 1,
  february: 2, feb: 2, febrero: 2,
  march: 3, mar: 3, marzo: 3,
  april: 4, apr: 4, abril: 4, abr: 4,
  may: 5, mayo: 5,
  june: 6, jun: 6, junio: 6,
  july: 7, jul: 7, julio: 7,
  august: 8, aug: 8, agosto: 8, ago: 8,
  september: 9, sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  october: 10, oct: 10, octubre: 10,
  november: 11, nov: 11, noviembre: 11,
  december: 12, dec: 12, diciembre: 12, dic: 12,
};

const WEEKDAYS = {
  sunday: 0, sun: 0, domingo: 0,
  monday: 1, mon: 1, lunes: 1,
  tuesday: 2, tue: 2, martes: 2,
  wednesday: 3, wed: 3, miercoles: 3,
  thursday: 4, thu: 4, jueves: 4,
  friday: 5, fri: 5, viernes: 5,
  saturday: 6, sat: 6, sabado: 6,
};

const WORDS = {
  today: 0, hoy: 0, now: 0, ahora: 0, tonight: 0, 'esta noche': 0, 'this morning': 0, 'esta manana': 0,
  yesterday: -1, ayer: -1, anoche: -1, 'last night': -1,
  'day before yesterday': -2, 'the day before yesterday': -2, anteayer: -2, 'antes de ayer': -2, antier: -2,
  tomorrow: 1, manana: 1, 'pasado manana': 2, 'day after tomorrow': 2,
  'last week': -7, 'la semana pasada': -7, 'hace una semana': -7, 'a week ago': -7,
  'next week': 7, 'la semana que viene': 7, 'la proxima semana': 7, 'in a week': 7, 'dentro de una semana': 7,
};

const NUMBER_WORDS = { a: 1, an: 1, one: 1, un: 1, una: 1, uno: 1, two: 2, dos: 2, three: 3, tres: 3, four: 4, cuatro: 4, five: 5, cinco: 5 };

const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function validFull(y, m, d) {
  const iso = formatIso(y, m, d);
  return parsePersonDate(iso)?.year ? iso : null;
}

/**
 * @param {string} input the user's words, or an ISO date
 * @param {string} today YYYY-MM-DD from the runtime clock
 * @param {{direction?: 'past'|'future'|'yearless', lang?: string}} options
 *   past: a day-month without year means its latest occurrence up to today (for things that happened);
 *   future: its next occurrence from today (for due dates);
 *   yearless: --MM-DD (for birthdays and other yearly dates).
 * @returns {string|null} YYYY-MM-DD, --MM-DD, YYYY-MM or YYYY; null when it cannot be understood
 */
export function resolveWhen(input, today, { direction = 'past', lang = 'en' } = {}) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim();
  if (raw === '') return null;
  const s = foldAccents(raw).toLowerCase().replace(/[.,]+$/g, '').replace(/\s+/g, ' ').trim();

  // Formats Lore already understands.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parsePersonDate(s)?.year ? s : null;
  if (/^--\d{2}-\d{2}$/.test(s)) return parsePersonDate(s) ? s : null;
  if (/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(s) && direction !== 'yearless') return s;

  if (s in WORDS) return addDays(today, WORDS[s]);

  let m = /^(?:(\d+)|(a|an|one|two|three|four|five)) (day|days|week|weeks) ago$/.exec(s) ?? /^hace (?:(\d+)|(un|una|uno|dos|tres|cuatro|cinco)) (dia|dias|semana|semanas)$/.exec(s);
  if (m) {
    const n = m[1] ? Number(m[1]) : NUMBER_WORDS[m[2]];
    return addDays(today, -n * (m[3].startsWith('week') || m[3].startsWith('semana') ? 7 : 1));
  }
  m = /^in (?:(\d+)|(a|an|one|two|three|four|five)) (day|days|week|weeks)$/.exec(s) ?? /^(?:en|dentro de) (?:(\d+)|(un|una|uno|dos|tres|cuatro|cinco)) (dia|dias|semana|semanas)$/.exec(s);
  if (m) {
    const n = m[1] ? Number(m[1]) : NUMBER_WORDS[m[2]];
    return addDays(today, n * (m[3].startsWith('week') || m[3].startsWith('semana') ? 7 : 1));
  }

  // Weekdays: "friday", "last friday", "el viernes", "el viernes pasado" (the latest one before
  // today); "next friday", "el proximo viernes", "el viernes que viene" (the next one after today).
  m = /^(?:(last|next|this|on|el|este|proximo|el proximo|el pasado) )?([a-z]+)(?: (pasado|que viene))?$/.exec(s);
  if (m && m[2] in WEEKDAYS) {
    const target = WEEKDAYS[m[2]];
    const future = ['next', 'proximo', 'el proximo'].includes(m[1]) || m[3] === 'que viene' || (direction === 'future' && m[1] !== 'last' && m[3] !== 'pasado');
    const now = weekdayOf(today);
    if (future) return addDays(today, ((target - now + 7) % 7) || 7);
    return addDays(today, -(((now - target + 7) % 7) || 7));
  }

  // Day and month, with an optional year: "12 april", "april 12", "12 de abril de 1990", "april 12, 1990".
  let day;
  let month;
  let year;
  m = /^(?:el )?(\d{1,2}) (?:de )?([a-z]+)(?:,? (?:de |del )?(\d{4}))?$/.exec(s);
  if (m && m[2] in MONTHS) [day, month, year] = [Number(m[1]), MONTHS[m[2]], m[3] && Number(m[3])];
  m = !month && /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(s);
  if (m && m[1] in MONTHS) [day, month, year] = [Number(m[2]), MONTHS[m[1]], m[3] && Number(m[3])];
  // Numeric: day/month in Spanish; month/day in English unless the first number is above 12.
  m = !month && /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(s);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    const dayFirst = String(lang).toLowerCase().startsWith('es') || a > 12;
    [day, month] = dayFirst ? [a, b] : [b, a];
    if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  }
  if (!month) return null;

  if (year) return validFull(year, month, day);
  const yearless = `--${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!parsePersonDate(yearless)) return null;
  if (direction === 'yearless') return yearless;
  const y = Number(today.slice(0, 4));
  if (direction === 'future') {
    const thisYear = validFull(y, month, day);
    return thisYear && thisYear >= today ? thisYear : validFull(y + 1, month, day) ?? validFull(y + 4 - (y % 4), month, day);
  }
  const thisYear = validFull(y, month, day);
  return thisYear && thisYear <= today ? thisYear : validFull(y - 1, month, day) ?? validFull(y - 1 - ((y - 1) % 4), month, day);
}

const PERIOD_NUMBERS = {
  ...NUMBER_WORDS,
  six: 6, seis: 6, seven: 7, siete: 7, eight: 8, ocho: 8, nine: 9, nueve: 9, ten: 10, diez: 10,
  eleven: 11, once: 11, twelve: 12, doce: 12, 'a couple of': 2, couple: 2, 'un par de': 2,
};
const PERIOD_NUMBER = Object.keys(PERIOD_NUMBERS).sort((a, b) => b.length - a.length).join('|');
// Unit words, and whether they are plural ("los proximos meses" means a few months).
const PERIOD_UNITS = {
  day: ['d', false], days: ['d', true], dia: ['d', false], dias: ['d', true],
  week: ['w', false], weeks: ['w', true], semana: ['w', false], semanas: ['w', true],
  month: ['m', false], months: ['m', true], mes: ['m', false], meses: ['m', true],
  year: ['y', false], years: ['y', true], ano: ['y', false], anos: ['y', true],
};
const PERIOD_UNIT = Object.keys(PERIOD_UNITS).join('|');
const AMOUNT = new RegExp(`(?:^| )(\\d+|${PERIOD_NUMBER}) (${PERIOD_UNIT})(?: |$)`);
const CALENDAR = new RegExp(`(?:^| )(?:(this|esta|este|next|proxima|proximo) )?(${PERIOD_UNIT})(?: (que viene|siguiente))?(?: |$)`);

/**
 * How many days ahead the user means by "this month", "los proximos 3 meses", "next year" or "14".
 * The model passes the user's words, so it never has to count days itself.
 * @param {string|number} input
 * @param {string} today YYYY-MM-DD from the runtime clock
 * @returns {number|null} days from today; null when it cannot be understood
 */
export function resolvePeriod(input, today) {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  const s = foldAccents(String(input)).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (s === 'today' || s === 'hoy') return 0;
  const ahead = (n, unit) => {
    if (unit === 'd') return n;
    if (unit === 'w') return 7 * n;
    return daysBetween(today, addMonths(today, unit === 'm' ? n : 12 * n));
  };

  // "3 months", "los proximos 12 meses", "a couple of weeks", "un par de semanas"
  let m = AMOUNT.exec(s);
  if (m) return ahead(/^\d+$/.test(m[1]) ? Number(m[1]) : PERIOD_NUMBERS[m[1]], PERIOD_UNITS[m[2]][0]);

  m = CALENDAR.exec(s);
  if (!m) return null;
  const [unit, plural] = PERIOD_UNITS[m[2]];
  if (plural) return ahead(unit === 'd' ? 7 : 3, unit); // "the coming weeks", "los proximos meses"
  const next = ['next', 'proxima', 'proximo'].includes(m[1]) || Boolean(m[3]);
  if (!next && !m[1]) return ahead(1, unit); // "a month", "un ano"
  // This or next week (weeks end on Sunday), month or year: up to its last day.
  const shift = next ? 1 : 0;
  if (unit === 'd') return shift;
  if (unit === 'w') return ((7 - weekdayOf(today)) % 7) + 7 * shift;
  const [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  if (unit === 'm') return daysBetween(today, addDays(addMonths(formatIso(y, mo, 1), shift + 1), -1));
  return daysBetween(today, formatIso(y + shift, 12, 31));
}
