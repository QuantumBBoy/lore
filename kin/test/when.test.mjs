import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { resolveWhen } from '../src/when.mjs';

const TODAY = '2026-10-14'; // a Wednesday
const w = (s, o) => resolveWhen(s, TODAY, o);

describe('relative words, from the runtime date', () => {
  const cases = [
    ['today', '2026-10-14'], ['hoy', '2026-10-14'], ['Yesterday', '2026-10-13'], ['ayer', '2026-10-13'],
    ['anteayer', '2026-10-12'], ['the day before yesterday', '2026-10-12'], ['mañana', '2026-10-15'],
    ['3 days ago', '2026-10-11'], ['hace 3 días', '2026-10-11'], ['hace una semana', '2026-10-07'],
    ['two weeks ago', '2026-09-30'], ['in 10 days', '2026-10-24'], ['dentro de dos semanas', '2026-10-28'],
    ['la semana pasada', '2026-10-07'], ['next week', '2026-10-21'],
  ];
  for (const [input, expected] of cases) test(`${input} → ${expected}`, () => assert.equal(w(input), expected));
});

describe('weekdays', () => {
  test('a weekday on its own is the latest one before today', () => {
    assert.equal(w('friday'), '2026-10-09');
    assert.equal(w('el viernes'), '2026-10-09');
    assert.equal(w('el miércoles'), '2026-10-07', 'not today');
    assert.equal(w('last monday'), '2026-10-12');
    assert.equal(w('el lunes pasado'), '2026-10-12');
  });

  test('next, or a due date, looks forward', () => {
    assert.equal(w('next friday'), '2026-10-16');
    assert.equal(w('el próximo viernes'), '2026-10-16');
    assert.equal(w('el viernes que viene'), '2026-10-16');
    assert.equal(w('friday', { direction: 'future' }), '2026-10-16');
    assert.equal(w('wednesday', { direction: 'future' }), '2026-10-21');
  });
});

describe('day and month', () => {
  test('with a year', () => {
    assert.equal(w('12 April 1990'), '1990-04-12');
    assert.equal(w('12 de abril de 1990'), '1990-04-12');
    assert.equal(w('April 12, 1990'), '1990-04-12');
    assert.equal(w('29 feb 1991'), null, 'not a real date');
  });

  test('without a year: yearless, latest past, or next future', () => {
    assert.equal(w('12 de abril', { direction: 'yearless' }), '--04-12');
    assert.equal(w('12 de abril'), '2026-04-12');
    assert.equal(w('20 de diciembre'), '2025-12-20');
    assert.equal(w('20 December', { direction: 'future' }), '2026-12-20');
    assert.equal(w('12 April', { direction: 'future' }), '2027-04-12');
    assert.equal(w('29 de febrero', { direction: 'yearless' }), '--02-29');
    assert.equal(w('29 February', { direction: 'future' }), '2028-02-29');
  });

  test('numbers: day first in Spanish, month first in English unless impossible', () => {
    assert.equal(w('04/12', { lang: 'es' }), '2025-12-04');
    assert.equal(w('04/12', { lang: 'en' }), '2026-04-12');
    assert.equal(w('25/12', { lang: 'en' }), '2025-12-25');
    assert.equal(w('12/04/1990', { lang: 'es' }), '1990-04-12');
  });
});

test('Lore formats pass through; nonsense is null', () => {
  assert.equal(w('2026-03-14'), '2026-03-14');
  assert.equal(w('--07-29'), '--07-29');
  assert.equal(w('2025-12'), '2025-12');
  assert.equal(w('2019'), '2019');
  assert.equal(w('2026-02-30'), null);
  assert.equal(w('someday'), null);
  assert.equal(w(''), null);
  assert.equal(w(undefined), null);
});
