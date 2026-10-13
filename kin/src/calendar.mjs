// Calendar export (spec 15.7): every birthday and date as an all-day event that repeats yearly,
// in an iCalendar file (RFC 5545) the owner adds to their calendar through the share sheet. Each
// event has a UID that never changes, and an alarm at the owner's lead time (spec 15.6). What was
// exported is recorded in the Lore folder (kin.calendar_birthday, and kin.calendar on items of
// dates), so the next export only carries what is new or changed.

import { addDays, nextOccurrence, parsePersonDate } from '../../lore-core/src/dates.mjs';
import { fieldLevel, isVisible, itemLevel } from '../../lore-core/src/sensitivity.mjs';
import { slugify } from '../../lore-core/src/text.mjs';
import { clockParts, leadFor, remindAt } from './settings.mjs';

const hidden = (level) => !isVisible(level, { includeSensitive: false });

/**
 * Dates that can go to a calendar. Sensitive dates, and the dates of people whose name is
 * sensitive, never do (spec 6.4 rule 4).
 * @returns {{dates: {slug, name, key, label, kind, date, recurring, uid, exported, changed, index}[], withheld: number}}
 *   exported: this value was exported before; changed: an older value was
 */
export function calendarDates(folder, { today }) {
  const dates = [];
  let withheld = 0;
  for (const slug of folder.slugs()) {
    let data;
    try {
      data = folder.person(slug).data;
    } catch {
      continue;
    }
    const path = `people/${slug}.md`;
    const nameOk = typeof data.name === 'string' && !hidden(fieldLevel(data, 'name', path));
    const consider = ({ key, date, label, kind, recurring, level, marker, index = null }) => {
      const p = parsePersonDate(date);
      if (!p) return;
      if (!recurring && (p.year === null || date < today)) return; // a one-off date that has passed
      if (!nameOk || hidden(level)) {
        withheld++;
        return;
      }
      dates.push({
        slug,
        name: data.name,
        key,
        label,
        kind,
        date,
        recurring,
        uid: `${slug}.${key}@kin.lore`,
        exported: marker === date,
        changed: typeof marker === 'string' && marker !== date,
        index,
      });
    };
    if (typeof data.birthday === 'string') {
      consider({ key: 'birthday', date: data.birthday, label: null, kind: 'birthday', recurring: true, level: fieldLevel(data, 'birthday', path), marker: data['kin.calendar_birthday'] });
    }
    const items = Array.isArray(data.dates) ? data.dates : [];
    items.forEach((d, index) => {
      if (!d || typeof d.date !== 'string') return;
      const key = `date-${slugify(d.label || d.kind || String(index + 1)) || index + 1}`;
      consider({ key, date: d.date, label: d.label ?? '', kind: d.kind ?? 'other', recurring: d.recurring !== false, level: itemLevel(data, 'dates', d, path), marker: d['kin.calendar'], index });
    });
  }
  return { dates, withheld };
}

const TITLES = {
  en: { birthday: (name) => `${name}'s birthday`, other: (name, label) => `${name}: ${label}` },
  es: { birthday: (name) => `Cumpleaños de ${name}`, other: (name, label) => `${name}: ${label}` },
};
const DESCRIPTIONS = {
  en: { birthday: (name) => `From Kin. Ask in Gallery: "What should I get ${name}?"`, other: (name) => `From Kin. Ask in Gallery: "Anything pending with ${name}?"` },
  es: { birthday: (name) => `De Kin. Pregunta en Gallery: «¿Qué le regalo a ${name}?»`, other: (name) => `De Kin. Pregunta en Gallery: «¿Qué tengo pendiente con ${name}?»` },
};

export function eventTitle(d, lang = 'en') {
  const t = TITLES[lang] ?? TITLES.en;
  return d.kind === 'birthday' ? t.birthday(d.name) : t.other(d.name, d.label || d.kind);
}

// ------------------------------------------------------------------------------------- iCalendar

const compact = (iso) => iso.replaceAll('-', '');

/** TEXT values (RFC 5545 3.3.11). */
const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets (RFC 5545 3.1), never inside a UTF-8 character. */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** A duration in minutes as an iCalendar DURATION: -900 → "-PT15H", -19260 → "-P13DT9H". */
export function icsDuration(minutes) {
  const sign = minutes < 0 ? '-' : '';
  let rest = Math.abs(minutes);
  const days = Math.floor(rest / 1440);
  rest -= days * 1440;
  const hours = Math.floor(rest / 60);
  const mins = rest - hours * 60;
  const time = hours || mins ? `T${hours ? `${hours}H` : ''}${mins ? `${mins}M` : ''}` : '';
  return days || time ? `${sign}P${days ? `${days}D` : ''}${time}` : 'PT0S';
}

/** RRULE for a recurring date, with 29 February observed as the folder says (spec 15.2, 15.7). */
export function recurrenceRule(date, leapDay = 'feb28') {
  const p = parsePersonDate(date);
  if (p && p.month === 2 && p.day === 29) return leapDay === 'mar1' ? 'FREQ=YEARLY;BYYEARDAY=60' : 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1';
  return 'FREQ=YEARLY';
}

/** First day of the event: the full date when the year is known, else the next occurrence. */
function startOf(d, today, leapDay) {
  const p = parsePersonDate(d.date);
  if (p.year !== null) return d.date;
  return nextOccurrence(d.date, today, { recurring: true, leapDay }).date;
}

/**
 * An iCalendar file with these dates.
 * @param {object} folder the Lore folder (for lead times, reminder time and leap_day)
 * @param {object[]} dates from calendarDates
 * @returns {string} CRLF-separated text
 */
export function buildIcs(folder, dates, { today, now = new Date(), lang = 'en', version = '' } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const at = clockParts(remindAt(folder));
  const desc = DESCRIPTIONS[lang] ?? DESCRIPTIONS.en;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//Lore//Kin ${version}//${lang.toUpperCase()}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const d of dates) {
    const start = startOf(d, today, folder.leapDay);
    const title = eventTitle(d, lang);
    const lead = leadFor(folder, d.slug);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${d.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(start)}`,
      `DTEND;VALUE=DATE:${compact(addDays(start, 1))}`,
      ...(d.recurring ? [`RRULE:${recurrenceRule(d.date, folder.leapDay)}`] : []),
      `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(d.kind === 'birthday' ? desc.birthday(d.name) : desc.other(d.name))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title)}`,
      `TRIGGER:${icsDuration(-lead * 1440 + at.hour * 60 + at.minute)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Record in the folder that these dates were exported, with the value exported. */
export function markExported(folder, dates) {
  const bySlug = new Map();
  for (const d of dates) bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), d]);
  for (const [slug, list] of bySlug) {
    const data = folder.person(slug).data;
    const patch = {};
    const items = Array.isArray(data.dates) ? data.dates.map((x) => (x && typeof x === 'object' ? { ...x } : x)) : null;
    let itemsChanged = false;
    for (const d of list) {
      if (d.key === 'birthday') patch['kin.calendar_birthday'] = d.date;
      else if (items && items[d.index] && items[d.index].date === d.date && items[d.index]['kin.calendar'] !== d.date) {
        items[d.index]['kin.calendar'] = d.date;
        itemsChanged = true;
      }
    }
    if (itemsChanged) patch.dates = items;
    if (Object.keys(patch).length) folder.updatePerson(slug, patch);
  }
}

/** File name for the export. */
export const calendarFileName = (today) => `kin-${today}.ics`;
