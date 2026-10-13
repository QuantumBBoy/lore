// Kin v0.2: settings, the summary (digest), reminders for the app's notification scheduler
// (remind) and calendar export. Dates and times come from `now`, never from the model.

import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, test } from 'node:test';
import { readFolder } from '../../lore-core/src/node.mjs';
import { LoreFolder } from '../../lore-core/src/folder.mjs';
import { buildIcs, calendarDates, icsDuration, markExported, recurrenceRule } from '../src/calendar.mjs';
import { handle } from '../src/kin.mjs';
import { localClock, reminderSlot } from '../src/proactive.mjs';
import { DEFAULT_LEAD_DAYS, groupOf, groupWord, leadDays, leadFor, parseClock, parseEvery, parseLead } from '../src/settings.mjs';
import { MemoryStorage, loadFolder, readMeta, readSchedule, saveFolder, writeMeta } from '../src/store.mjs';

const EXAMPLE = join(fileURLToPath(new URL('../..', import.meta.url)), 'examples', 'lore');
const NOW = new Date('2026-10-13T10:00:00Z'); // a Tuesday, 10:00 (tests run in UTC)

let storage;
const call = (data, now = NOW) => JSON.parse(handle(JSON.stringify(data), { storage, now }));
const say = (data, now) => call(data, now).result;
const folder = () => loadFolder(storage).folder;
const intents = (text) => [...text.matchAll(/^run_intent schedule_notification (\{.*\})$/gm)].map((m) => JSON.parse(m[1]));
const at = (p) => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;

function withExample() {
  storage = new MemoryStorage();
  saveFolder(storage, readFolder(EXAMPLE));
}

function withPeople(people, me = {}) {
  storage = new MemoryStorage();
  const f = LoreFolder.create({ name: 'Alex', language: 'es', ...me });
  for (const p of people) f.createPerson(p);
  saveFolder(storage, f);
}

describe('settings', () => {
  test('relationship groups', () => {
    const cases = { pareja: 'partner', wife: 'partner', hermana: 'family', 'sister-in-law': 'family', suegro: 'family', 'best friend': 'friend', amiga: 'friend', 'compañera de trabajo': 'colleague', jefe: 'colleague', '': 'other', dentist: 'other' };
    for (const [rel, group] of Object.entries(cases)) assert.equal(groupOf(rel), group, rel);
  });

  test('groups the owner names, and names that are not groups', () => {
    const cases = { family: 'family', 'mi familia': 'family', 'familia de Marta': null, todos: 'everyone', everyone: 'everyone', amigos: 'friend', compañeros: 'colleague', Marta: null, '': null };
    for (const [w, group] of Object.entries(cases)) assert.equal(groupWord(w), group, w);
  });

  test('lead times in words', () => {
    const cases = { 'dos semanas': 14, 'two weeks before': 14, '3 días antes': 3, 'el mismo día': 0, 'on the day': 0, 'una semana': 7, 'un mes antes': 30, 10: 10, mañana: null, '400 días': null };
    for (const [w, days] of Object.entries(cases)) assert.equal(parseLead(w), days, w);
  });

  test('times of day in words', () => {
    const cases = { 9: '09:00', '9:30': '09:30', 'a las 9': '09:00', '9 pm': '21:00', '21h': '21:00', '9 de la noche': '21:00', '8.15': '08:15', mediodía: '12:00', 25: null, pronto: null };
    for (const [w, clock] of Object.entries(cases)) assert.equal(parseClock(w), clock, w);
  });

  test('how often', () => {
    const cases = { 'cada lunes': 'monday', 'every Monday': 'monday', 'todos los días': 'day', daily: 'day', weekly: 'monday', 'cada semana': 'monday', 'el viernes': 'friday', sábados: 'saturday', nunca: 'off', 'stop it': 'off', 'a veces': null };
    for (const [w, every] of Object.entries(cases)) assert.equal(parseEvery(w), every, w);
  });

  test('lead days: defaults, me.md, and a person of their own', () => {
    withPeople([{ name: 'Ana', relationship: 'hermana', 'kin.lead_days': 10 }, { name: 'Bea', relationship: 'amiga' }], { 'kin.lead_days': { friend: 5, partner: 'x' } });
    const f = folder();
    assert.deepEqual(leadDays(f), { ...DEFAULT_LEAD_DAYS, friend: 5 });
    assert.equal(leadFor(f, 'ana'), 10);
    assert.equal(leadFor(f, 'bea'), 5);
  });
});

describe('digest', () => {
  beforeEach(withExample);

  test('at most 6 lines: dates in 14 days, top 3 overdue, open promises', () => {
    const text = say({ action: 'digest', lang: 'es' });
    assert.deepEqual(text.split('\n'), [
      'Resumen de Kin · 13 oct',
      'Próximas fechas: Noor Haddad, cumpleaños en 7 días',
      'Hace tiempo que no hablas con: Noor Haddad (253 días), Luis Ortega (64 días), Javier Moreno (23 días) (+1)',
      'Promesas pendientes: Marta Ruiz: Lent her "The Left Hand of Darkness"; Javier Moreno: Borrowed his tent for the camping trip; Marta Ruiz: Send her the paella recipe',
    ]);
  });

  test('one line when nothing is pending', () => {
    withPeople([{ name: 'Ana' }]);
    assert.equal(say({ action: 'digest', lang: 'en' }), 'Nothing pending: no dates in the next 14 days, nobody overdue, no open promises.');
  });

  test('includes the backup reminder when due, once, instead of the tip', () => {
    writeMeta(storage, { ...readMeta(storage), changesSinceExport: 25, firstUse: '2026-09-01' });
    const text = say({ action: 'digest', lang: 'en' });
    assert.equal(text.split('\n').at(-1), 'Backup: 25 changes since the last one. Say "backup".');
    assert.ok(!text.includes('Tip:'));
    assert.equal(readMeta(storage).lastNudge, '2026-10-13');
    assert.ok(!say({ action: 'person', person: 'Marta', lang: 'en' }).includes('Tip:'), 'not again the same day');
  });

  test('never shows sensitive dates or promises', () => {
    withPeople([{ name: 'Ana', birthday: '--10-15', sensitivity: { default: 'private', birthday: 'sensitive' } }]);
    say({ action: 'capture', person: 'Ana', kind: 'promise', text: 'Pagarle la deuda del hospital', lang: 'es' });
    assert.equal(say({ action: 'digest', lang: 'es' }), 'Nada pendiente: ni fechas en los próximos 14 días, ni contactos atrasados, ni promesas.');
  });

  test('a weekly summary: next Monday at that time, saved in me.md, renewed when it has fired', () => {
    const text = say({ action: 'digest', every: 'cada lunes', at: 'a las 9', lang: 'es' });
    const [p] = intents(text);
    assert.deepEqual(p, { title: 'Kin · Tu resumen', message: 'Kin: dame mi resumen', hour: 9, minute: 0, year: 2026, month: 10, day: 19 });
    assert.equal(text.split('\n')[0], 'Hecho: un resumen cada lunes a las 09:00.');
    assert.equal(text.split('\n').at(-1), 'Si no se ha programado, di: «Programa una notificación el 19/10/2026 a las 09:00 con el título "Kin · Tu resumen" y el texto "Kin: dame mi resumen"»');
    assert.deepEqual(folder().setting('kin.digest'), { every: 'monday', at: '09:00' });
    assert.equal(readSchedule(storage).digestNext, '2026-10-19T09:00');
    // Before it fires, the summary does not hand over another one.
    assert.deepEqual(intents(say({ action: 'digest', lang: 'es' }, new Date('2026-10-16T10:00:00Z'))), []);
    // Opened from Monday's notification, it hands over the next Monday's.
    assert.deepEqual(intents(say({ action: 'digest', lang: 'es' }, new Date('2026-10-19T09:01:00Z'))).map(at), ['2026-10-26T09:00']);
    assert.equal(readSchedule(storage).digestNext, '2026-10-26T09:00');
  });

  test('a weekly summary on the same weekday after its time goes to next week', () => {
    assert.deepEqual(intents(say({ action: 'digest', every: 'tuesday', at: '9:00', lang: 'en' })).map(at), ['2026-10-20T09:00']);
    withExample();
    assert.deepEqual(intents(say({ action: 'digest', every: 'tuesday', at: '11:00', lang: 'en' })).map(at), ['2026-10-13T11:00']);
  });

  test('a daily summary repeats in the app, and can be turned off', () => {
    const text = say({ action: 'digest', every: 'every day', at: '8:30', lang: 'en' });
    assert.deepEqual(intents(text), [{ title: 'Kin · Your summary', message: 'Kin: give me my summary', hour: 8, minute: 30, repeat_daily: true }]);
    assert.match(text, /say: "Schedule a daily notification at 08:30 titled 'Kin · Your summary' with the text 'Kin: give me my summary'"$/);
    assert.match(say({ action: 'digest', every: 'never', lang: 'en' }), /^Done: no more summaries/);
    assert.equal(folder().setting('kin.digest'), undefined);
  });

  test('explains words it does not understand', () => {
    assert.equal(say({ action: 'digest', every: 'a veces', lang: 'es' }), 'No entiendo «a veces»: di «cada día» o un día de la semana, como «cada lunes».');
    assert.equal(say({ action: 'digest', every: 'daily', at: 'pronto', lang: 'en' }), 'I didn\'t understand the time "pronto": say it like "9:00".');
  });

  test('"resumen" with no person is the summary', () => {
    assert.equal(say({ action: 'resumen', lang: 'es' }), say({ action: 'digest', lang: 'es' }));
  });
});

describe('remind', () => {
  beforeEach(withExample);

  test('a person: one reminder per date, at their lead time, with the exact notification', () => {
    const text = say({ action: 'remind', person: 'Marta', lang: 'es' });
    assert.deepEqual(intents(text), [
      { title: 'Kin · Cumpleaños de Marta Ruiz en 3 días', message: '¿Qué le regalo a Marta Ruiz? Cumple el 12 abr.', hour: 9, minute: 0, year: 2027, month: 4, day: 9 },
      { title: 'Kin · Santa Marta de Marta Ruiz en 3 días', message: 'Santa Marta de Marta Ruiz el 29 jul. ¿Qué tengo pendiente con Marta Ruiz?', hour: 9, minute: 0, year: 2027, month: 7, day: 26 },
    ]);
    assert.match(text, /^Recordatorios para programar:\n- Marta Ruiz, cumpleaños 12 abr 2027: aviso el 9 abr 2027, 09:00\n/);
    assert.equal(text.split('\n').at(-1), 'Si no se ha programado, di: «Programa esas notificaciones»');
  });

  test('never hands over the same reminder twice without asking', () => {
    say({ action: 'remind', person: 'Noor', lang: 'en' });
    assert.equal(say({ action: 'remind', person: 'Noor', lang: 'en' }), 'I already gave you this reminder: Noor Haddad (Oct 17 09:00). Should I give it again?');
    const again = say({ action: 'remind', person: 'Noor', lang: 'en', confirm: true });
    assert.deepEqual(intents(again).map(at), ['2026-10-17T09:00']);
    assert.match(again, /say: "Schedule a notification on 2026-10-17 at 09:00 titled 'Kin · Noor Haddad: birthday in 3 days' with the text 'What should I get Noor Haddad\? Their birthday is on Oct 20\.'"$/);
  });

  test('"two weeks before family birthdays" sets the family lead time, then plans the 3 soonest', () => {
    const text = say({ action: 'remind', person: 'familia', before: 'dos semanas', lang: 'es' });
    assert.equal(text.split('\n')[0], 'Hecho: tu familia, 14 días antes.');
    assert.deepEqual(folder().setting('kin.lead_days'), { ...DEFAULT_LEAD_DAYS, family: 14 });
    assert.deepEqual(intents(text).map(at), ['2027-02-22T09:00', '2027-07-02T09:00', '2027-07-19T09:00']);
    assert.match(text, /\nY 1 más: pídemelo otra vez para programar los siguientes\.\n/);
    assert.ok(text.length < 1200, `${text.length} characters`);
    // Asking again hands over the next one.
    assert.deepEqual(intents(say({ action: 'remind', person: 'family', lang: 'en' })).map(at), ['2027-08-31T09:00']);
  });

  test('a lead time for one person, and a time of day for all', () => {
    const text = say({ action: 'remind', person: 'Luis', before: '10 días', at: '8:00', lang: 'es' });
    assert.equal(text.split('\n')[0], 'Hecho: Luis Ortega, 10 días antes.');
    assert.equal(folder().person('luis-ortega').get('kin.lead_days'), 10);
    assert.equal(folder().setting('kin.remind_at'), '08:00');
    assert.deepEqual(intents(text).map(at), ['2026-10-24T08:00']);
  });

  test('when the lead time has passed: as soon as possible, never in the past', () => {
    // Noor's birthday is in 7 days; with 14 days' notice the reminder is today at 9:00, which has
    // passed at 10:00, so tomorrow.
    say({ action: 'remind', person: 'Noor', before: 'two weeks', lang: 'en' });
    assert.deepEqual(intents(say({ action: 'remind', person: 'Noor', lang: 'en', confirm: true })).map(at), ['2026-10-14T09:00']);
    withExample();
    const early = new Date('2026-10-13T07:00:00Z');
    say({ action: 'remind', person: 'Noor', before: 'two weeks', lang: 'en' }, early);
    const text = say({ action: 'remind', person: 'Noor', lang: 'en', confirm: true }, early);
    assert.deepEqual(intents(text).map(at), ['2026-10-13T09:00']);
    assert.match(text, /reminder Oct 13, 09:00 \(as soon as possible\)/);
  });

  test('a date that is today, after the reminder time, is too late', () => {
    withPeople([{ name: 'Ana', birthday: '--10-13' }]);
    assert.equal(say({ action: 'remind', person: 'Ana', lang: 'en' }), 'No dates to remind you of for Ana in the next year.\nToo late to remind you: Ana, birthday today.');
  });

  test('sensitive dates get no reminder, and Kin says how many', () => {
    withPeople([{ name: 'Ana', birthday: '--12-01', dates: [{ label: 'Operación', date: '2026-12-20', recurring: false, sensitivity: 'sensitive' }] }]);
    const text = say({ action: 'remind', person: 'Ana', lang: 'en' });
    assert.equal(intents(text).length, 1);
    assert.match(text, /\n1 sensitive date gets no reminder\.\n/);
    assert.ok(!text.includes('Operación'));
  });

  test('every reminder for everyone is in the future, at the chosen time', () => {
    // On 28 February at 23:59, Sam's 29 February birthday is today and too late: 8 of 9 dates.
    for (const [now, count] of [['2026-01-01T00:00:00Z', 9], ['2026-02-28T23:59:00Z', 8], ['2026-10-13T08:59:00Z', 9], ['2026-12-31T12:00:00Z', 9]]) {
      withExample();
      let pending = true;
      const seen = new Set();
      for (let round = 0; round < 6 && pending; round++) {
        const text = say({ action: 'remind', person: 'everyone', lang: 'en' }, new Date(now));
        const params = intents(text);
        pending = params.length > 0;
        for (const p of params) {
          const clock = localClock(new Date(now));
          assert.ok(at(p) > `${clock.date}T${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`, `${now}: ${at(p)}`);
          assert.equal(`${p.hour}:${p.minute}`, '9:0');
          assert.ok(!seen.has(at(p) + p.title), 'no duplicates');
          seen.add(at(p) + p.title);
        }
      }
      assert.equal(seen.size, count, now);
    }
  });

  test('reminderSlot', () => {
    const clock = { date: '2026-10-13', minutes: 600 };
    assert.deepEqual(reminderSlot('2026-10-30', 3, '09:00', clock), { date: '2026-10-27', late: false });
    assert.deepEqual(reminderSlot('2026-10-20', 14, '09:00', clock), { date: '2026-10-14', late: true });
    assert.deepEqual(reminderSlot('2026-10-20', 14, '11:00', clock), { date: '2026-10-13', late: true });
    assert.deepEqual(reminderSlot('2026-10-13', 0, '11:00', clock), { date: '2026-10-13', late: false });
    assert.equal(reminderSlot('2026-10-13', 0, '09:00', clock), null);
  });

  test('a folder from a newer version: no settings are changed', () => {
    storage.setItem('lore:v1:file:me.md', storage.getItem('lore:v1:file:me.md').replace('lore: "0.2"', 'lore: "0.9"'));
    assert.match(say({ action: 'remind', person: 'family', before: 'dos semanas', lang: 'es' }), /^Tus datos están en formato Lore 0\.9/);
    assert.match(say({ action: 'digest', every: 'daily', lang: 'es' }), /^Tus datos están en formato Lore 0\.9/);
  });
});

describe('calendar export', () => {
  beforeEach(withExample);
  const TODAY = '2026-10-13';
  const events = (ics) => ics.split('BEGIN:VEVENT').slice(1).map((e) => Object.fromEntries(e.replace(/\r\n /g, '').split('\r\n').filter((l) => l.includes(':')).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)])));

  test('every visible date, with a UID that never changes', () => {
    const { dates, withheld } = calendarDates(folder(), { today: TODAY });
    assert.equal(withheld, 0);
    assert.deepEqual(dates.map((d) => d.uid), [
      'carmen-moreno.birthday@kin.lore',
      'carmen-moreno.date-santa-carmen-virgen-del-carmen@kin.lore',
      'carmen-moreno.date-aniversario-de-boda-con-pedro@kin.lore',
      'javier-moreno.birthday@kin.lore',
      'luis-ortega.birthday@kin.lore',
      'marta-ruiz.birthday@kin.lore',
      'marta-ruiz.date-santa-marta@kin.lore',
      'noor-haddad.birthday@kin.lore',
      'sam-okafor.birthday@kin.lore',
    ]);
  });

  test('all-day yearly events with an alarm at the lead time (spec 15.7)', () => {
    const f = folder();
    const ics = buildIcs(f, calendarDates(f, { today: TODAY }).dates, { today: TODAY, now: NOW, lang: 'es', version: '0.2.0' });
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lore//Kin 0.2.0//ES\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
    const byUid = Object.fromEntries(events(ics).map((e) => [e.UID, e]));
    assert.deepEqual(byUid['marta-ruiz.birthday@kin.lore'], {
      UID: 'marta-ruiz.birthday@kin.lore',
      DTSTAMP: '20261013T100000Z',
      'DTSTART;VALUE=DATE': '19900412',
      'DTEND;VALUE=DATE': '19900413',
      RRULE: 'FREQ=YEARLY',
      SUMMARY: 'Cumpleaños de Marta Ruiz',
      DESCRIPTION: 'Cumpleaños de Marta Ruiz',
      TRANSP: 'TRANSPARENT',
      ACTION: 'DISPLAY',
      TRIGGER: '-P2DT15H', // 3 days before, at 9:00
      BEGIN: 'VALARM',
      END: 'VEVENT',
    });
    // A yearless date starts at its next occurrence; 29 February follows leap_day.
    assert.equal(byUid['noor-haddad.birthday@kin.lore']['DTSTART;VALUE=DATE'], '20261020');
    assert.equal(byUid['sam-okafor.birthday@kin.lore'].RRULE, 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
    assert.equal(byUid['carmen-moreno.birthday@kin.lore'].TRIGGER, '-P6DT15H'); // family: 7 days
    assert.match(ics, /\r\nSUMMARY:Carmen Moreno: Santa Carmen \(Virgen del Carmen\)\r\n/);
  });

  test('text is escaped and 29 February follows leap_day', () => {
    assert.equal(recurrenceRule('--02-29', 'mar1'), 'FREQ=YEARLY;BYYEARDAY=60');
    assert.equal(recurrenceRule('1996-02-29', 'feb28'), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
    assert.equal(recurrenceRule('--03-01'), 'FREQ=YEARLY');
    assert.deepEqual([icsDuration(-14 * 1440 + 540), icsDuration(540), icsDuration(-1440 + 540), icsDuration(-1440 + 570), icsDuration(0)], ['-P13DT15H', 'PT9H', '-PT15H', '-PT14H30M', 'PT0S']);
    withPeople([{ name: 'Ana; Gil, Jr', dates: [{ label: 'Boda, la de verdad', date: '2027-06-05', recurring: false }, { label: 'Old', date: '2020-01-01', recurring: false }] }]);
    const f = folder();
    const { dates } = calendarDates(f, { today: TODAY });
    assert.equal(dates.length, 1, 'a one-off date that has passed is left out');
    const [e] = events(buildIcs(f, dates, { today: TODAY, now: NOW, lang: 'en' }));
    assert.equal(e.SUMMARY, 'Ana\\; Gil\\, Jr: Boda\\, la de verdad');
    assert.equal(e.RRULE, undefined);
    assert.equal(e['DTSTART;VALUE=DATE'], '20270605');
  });

  test('sensitive dates and people whose name is sensitive stay out', () => {
    withPeople([
      { name: 'Ana', birthday: '--05-01', sensitivity: { default: 'private', birthday: 'sensitive' } },
      { name: 'Bea', birthday: '--06-01', sensitivity: { default: 'private', name: 'sensitive' } },
      { name: 'Cris', birthday: '--07-01' },
    ]);
    const { dates, withheld } = calendarDates(folder(), { today: TODAY });
    assert.deepEqual(dates.map((d) => d.name), ['Cris']);
    assert.equal(withheld, 2);
  });

  test('what was exported is recorded in Lore; the next export has only what is new or changed', () => {
    const f = folder();
    const first = calendarDates(f, { today: TODAY }).dates;
    markExported(f, first);
    saveFolder(storage, f, loadFolder(storage).snapshot);
    assert.equal(folder().person('marta-ruiz').get('kin.calendar_birthday'), '1990-04-12');
    assert.equal(folder().person('marta-ruiz').get('dates')[0]['kin.calendar'], '--07-29');
    assert.deepEqual(folder().validate({ now: NOW }).filter((i) => i.level === 'error'), []);
    assert.ok(calendarDates(folder(), { today: TODAY }).dates.every((d) => d.exported));
    say({ action: 'update', person: 'Noor', field: 'birthday', value: '21 de octubre', lang: 'es', confirm: true });
    const again = calendarDates(folder(), { today: TODAY }).dates.filter((d) => !d.exported);
    assert.deepEqual(again.map((d) => [d.uid, d.changed]), [['noor-haddad.birthday@kin.lore', true]]);
  });

  test('remind with calendar opens the panel and says what is new', () => {
    const r = call({ action: 'remind', calendar: true, lang: 'es' });
    assert.equal(r.result, 'Para tu calendario: 9 fechas nuevas o cambiadas. Toca «Añadir al calendario» en el panel.');
    assert.deepEqual(r.webview, { url: 'calendar.html?lang=es', aspectRatio: 1.2 });
    const f = folder();
    markExported(f, calendarDates(f, { today: TODAY }).dates);
    saveFolder(storage, f, loadFolder(storage).snapshot);
    assert.equal(say({ action: 'calendar', lang: 'en' }), 'All your dates (9) are already in your calendar. If you deleted them, use "Export all again" in the panel below.');
    withPeople([{ name: 'Ana' }]);
    assert.equal(say({ action: 'calendario', lang: 'es' }), 'Aún no hay fechas que poner en un calendario.');
  });
});
