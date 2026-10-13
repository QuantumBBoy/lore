import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  addCadence,
  addDays,
  addMonths,
  daysBetween,
  formatShortDate,
  isLeapYear,
  nextOccurrence,
  observedIn,
  parsePersonDate,
  today,
} from '../src/dates.mjs';

describe('today comes from the clock, in a time zone', () => {
  const late = new Date('2026-10-13T23:30:00Z');
  const early = new Date('2026-10-13T05:00:00Z');
  const cases = [
    [late, 'UTC', '2026-10-13'],
    [late, 'Europe/Madrid', '2026-10-14'],
    [late, 'America/Los_Angeles', '2026-10-13'],
    [late, 'Pacific/Kiritimati', '2026-10-14'],
    [early, 'Pacific/Pago_Pago', '2026-10-12'],
    [early, 'Asia/Tokyo', '2026-10-13'],
    [new Date('2027-01-01T00:30:00Z'), 'America/New_York', '2026-12-31'],
  ];
  for (const [now, timeZone, expected] of cases) {
    test(`${now.toISOString()} in ${timeZone} is ${expected}`, () => assert.equal(today({ now, timeZone }), expected));
  }

  test('an unknown time zone falls back to the device time zone', () => {
    assert.equal(today({ now: late, timeZone: 'Not/AZone' }), today({ now: late }));
    assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parsing', () => {
  test('full and yearless dates', () => {
    assert.deepEqual(parsePersonDate('1990-04-12'), { year: 1990, month: 4, day: 12 });
    assert.deepEqual(parsePersonDate('--02-29'), { year: null, month: 2, day: 29 });
    for (const bad of ['1991-02-29', '--02-30', '2026-13-01', '2026-04-31', '26-04-01', '--4-1', '', null, 19900412]) {
      assert.equal(parsePersonDate(bad), null, String(bad));
    }
  });

  test('leap years', () => {
    assert.deepEqual([1900, 2000, 2024, 2026, 2100].map(isLeapYear), [false, true, true, false, false]);
  });
});

describe('arithmetic', () => {
  test('days', () => {
    assert.equal(addDays('2026-10-13', 30), '2026-11-12');
    assert.equal(addDays('2026-03-28', 2), '2026-03-30', 'across a daylight saving change');
    assert.equal(daysBetween('2026-10-13', '2027-10-13'), 365);
    assert.equal(daysBetween('2028-01-01', '2029-01-01'), 366);
  });

  test('months clamp to the end of the month (spec 15.3)', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
    assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
    assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  });

  test('cadences', () => {
    assert.equal(addCadence('2026-09-28', '2w'), '2026-10-12');
    assert.equal(addCadence('2026-10-25', '10d'), '2026-11-04');
    assert.equal(addCadence('2026-08-31', '1m'), '2026-09-30');
    assert.equal(addCadence('2024-02-29', '1y'), '2025-02-28');
    assert.equal(addCadence('2026-02-02', '3m'), '2026-05-02');
    assert.throws(() => addCadence('2026-01-01', '2 weeks'), /not a cadence/);
  });
});

describe('next occurrence (spec 15.2)', () => {
  const next = (d, t, o) => nextOccurrence(d, t, o);

  test('yearless and full dates', () => {
    assert.deepEqual(next('--10-20', '2026-10-13'), { date: '2026-10-20', years: null });
    assert.deepEqual(next('--10-13', '2026-10-13'), { date: '2026-10-13', years: null }, 'today counts');
    assert.deepEqual(next('--10-12', '2026-10-13'), { date: '2027-10-12', years: null });
    assert.deepEqual(next('1990-04-12', '2026-10-13'), { date: '2027-04-12', years: 37 });
    assert.deepEqual(next('1990-12-31', '2026-12-31'), { date: '2026-12-31', years: 36 });
  });

  test('29 February in common and leap years', () => {
    assert.deepEqual(next('1996-02-29', '2027-02-01'), { date: '2027-02-28', years: 31 });
    assert.deepEqual(next('1996-02-29', '2027-02-01', { leapDay: 'mar1' }), { date: '2027-03-01', years: 31 });
    assert.deepEqual(next('1996-02-29', '2027-02-28'), { date: '2027-02-28', years: 31 });
    assert.deepEqual(next('1996-02-29', '2027-03-01'), { date: '2028-02-29', years: 32 });
    assert.deepEqual(next('--02-29', '2027-03-01', { leapDay: 'mar1' }), { date: '2027-03-01', years: null });
    assert.deepEqual(next('--02-29', '2028-01-01'), { date: '2028-02-29', years: null });
    assert.equal(observedIn(2100, 2, 29), '2100-02-28', '2100 is not a leap year');
  });

  test('non-recurring and future dates', () => {
    assert.deepEqual(next('2026-11-01', '2026-10-13', { recurring: false }), { date: '2026-11-01', years: null });
    assert.equal(next('2026-10-01', '2026-10-13', { recurring: false }), null);
    assert.equal(next('--10-01', '2026-10-13', { recurring: false }), null);
    assert.deepEqual(next('2027-06-20', '2026-10-13'), { date: '2027-06-20', years: 0 }, 'first occurrence is the date itself');
    assert.equal(next('nonsense', '2026-10-13'), null);
  });
});

test('short dates in English and Spanish', () => {
  assert.equal(formatShortDate('2026-04-12', 'en'), 'Apr 12');
  assert.match(formatShortDate('2026-04-12', 'es'), /^12 abr/);
  assert.equal(formatShortDate('--07-29', 'en'), 'Jul 29');
  assert.equal(formatShortDate('bad', 'en'), 'bad');
});
