// Calendar dates as YYYY-MM-DD strings (spec sections 5 and 15). All arithmetic is on civil days,
// never on local Date objects, so time zones and daylight saving cannot shift a day.

const FULL = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEARLESS = /^--(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const daysInMonth = (y, m) => [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

const pad = (n, w = 2) => String(n).padStart(w, '0');

export const formatIso = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Parse a full (YYYY-MM-DD) or yearless (--MM-DD) date. Returns null when it is not a real date. */
export function parsePersonDate(s) {
  if (typeof s !== 'string') return null;
  let m = FULL.exec(s);
  if (m) {
    const [y, mo, d] = m.slice(1).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return { year: y, month: mo, day: d };
  }
  m = YEARLESS.exec(s);
  if (m) {
    const [mo, d] = m.slice(1).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(2000, mo)) return null; // 2000 is leap: allows --02-29
    return { year: null, month: mo, day: d };
  }
  return null;
}

/** Days since 1970-01-01 for a full date string. */
export function toDays(iso) {
  const p = parsePersonDate(iso);
  if (!p || p.year === null) throw new Error(`not a full date: ${iso}`);
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

export function fromDays(n) {
  const d = new Date(n * DAY_MS);
  return formatIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const addDays = (iso, n) => fromDays(toDays(iso) + n);

/** b − a in days. */
export const daysBetween = (a, b) => toDays(b) - toDays(a);

/** Add months, moving to the last day of the month when the day does not exist (31 Jan + 1m). */
export function addMonths(iso, n) {
  const p = parsePersonDate(iso);
  const total = p.year * 12 + (p.month - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return formatIso(y, m, Math.min(p.day, daysInMonth(y, m)));
}

const CADENCE = /^([1-9]\d{0,2})([dwmy])$/;

export const isCadence = (s) => typeof s === 'string' && CADENCE.test(s);

/** Date plus a cadence such as 10d, 2w, 1m or 1y (spec 15.3). */
export function addCadence(iso, cadence) {
  const m = CADENCE.exec(cadence);
  if (!m) throw new Error(`not a cadence: ${cadence}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'd':
      return addDays(iso, n);
    case 'w':
      return addDays(iso, 7 * n);
    case 'm':
      return addMonths(iso, n);
    default:
      return addMonths(iso, 12 * n);
  }
}

/**
 * Today's date in a time zone, from the runtime clock (spec 15.1). Without a time zone it uses
 * the device's; an unknown time zone falls back to the device's, then UTC.
 */
export function today({ now = new Date(), timeZone } = {}) {
  for (const tz of [timeZone, undefined]) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const get = (type) => Number(parts.find((p) => p.type === type).value);
      return formatIso(get('year'), get('month'), get('day'));
    } catch {
      // try the next option
    }
  }
  return now.toISOString().slice(0, 10);
}

/** The date a month/day is observed in a given year (29 February in common years, spec 15.2). */
export function observedIn(year, month, day, leapDay = 'feb28') {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return leapDay === 'mar1' ? formatIso(year, 3, 1) : formatIso(year, 2, 28);
  }
  return formatIso(year, month, day);
}

/**
 * Next occurrence of a person date on or after `todayIso` (spec 15.2).
 * @returns {{date: string, years: number|null}|null} years: age or anniversary number, when known
 */
export function nextOccurrence(dateStr, todayIso, { recurring = true, leapDay = 'feb28' } = {}) {
  const p = parsePersonDate(dateStr);
  if (!p) return null;
  if (!recurring) {
    if (p.year === null) return null;
    return dateStr >= todayIso ? { date: dateStr, years: null } : null;
  }
  const y0 = Number(todayIso.slice(0, 4));
  let year = observedIn(y0, p.month, p.day, leapDay) >= todayIso ? y0 : y0 + 1;
  if (p.year !== null && year < p.year) year = p.year; // the date itself is still to come
  const date = p.year === year ? dateStr : observedIn(year, p.month, p.day, leapDay);
  return { date, years: p.year === null ? null : year - p.year };
}

/** Short human date, e.g. "Apr 12" (en) or "12 abr" (es). */
export function formatShortDate(iso, language = 'en') {
  const p = parsePersonDate(iso);
  if (!p) return iso;
  try {
    return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(p.year ?? 2000, p.month - 1, p.day)),
    );
  } catch {
    return iso;
  }
}
