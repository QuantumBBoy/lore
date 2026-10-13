import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { editDistance, matchPerson } from '../src/match.mjs';
import { readFolder } from '../src/node.mjs';
import { brief, findGiven, giftContext, giftHistory, overdue, personSummary, sameGift, upcoming } from '../src/queries.mjs';

const EXAMPLE = join(fileURLToPath(new URL('../..', import.meta.url)), 'examples', 'lore');
const load = () => readFolder(EXAMPLE);
const TODAY = '2026-10-13';

describe('upcoming', () => {
  test('dates in the next 30 days, nearest first', () => {
    const r = upcoming(load(), { today: TODAY });
    assert.deepEqual(
      r.items.map((i) => [i.slug, i.kind, i.date, i.daysAway, i.years]),
      [
        ['noor-haddad', 'birthday', '2026-10-20', 7, null],
        ['luis-ortega', 'birthday', '2026-11-03', 21, null],
      ],
    );
    assert.equal(r.withheld, 0);
  });

  test('the window includes its last day', () => {
    assert.equal(upcoming(load(), { today: TODAY, days: 7 }).items.length, 1);
    assert.equal(upcoming(load(), { today: TODAY, days: 6 }).items.length, 0);
  });

  test('name days and anniversaries, with the number of years when known', () => {
    const july = upcoming(load(), { today: '2026-07-10', days: 10 }).items;
    assert.deepEqual(july.map((i) => [i.slug, i.kind, i.label, i.date]), [
      ['carmen-moreno', 'name_day', 'Santa Carmen (Virgen del Carmen)', '2026-07-16'],
    ]);
    const sept = upcoming(load(), { today: '2026-09-10', days: 10 }).items;
    assert.deepEqual(sept.map((i) => [i.kind, i.date, i.years]), [['anniversary', '2026-09-14', 41]]);
  });

  test('29 February birthdays in a common year follow leap_day', () => {
    const folder = load();
    assert.deepEqual(upcoming(folder, { today: '2027-02-20', days: 10 }).items.map((i) => [i.slug, i.date, i.years]), [['sam-okafor', '2027-02-28', 31]]);
    folder.me.set('leap_day', 'mar1');
    assert.deepEqual(upcoming(folder, { today: '2027-02-20', days: 10 }).items.map((i) => [i.slug, i.date]), [['sam-okafor', '2027-03-01']]);
  });

  test('sensitive dates are withheld unless asked for', () => {
    const folder = load();
    folder.updatePerson('noor-haddad', { sensitivity: { birthday: 'sensitive' } });
    const hidden = upcoming(folder, { today: TODAY });
    assert.deepEqual(hidden.items.map((i) => i.slug), ['luis-ortega']);
    assert.equal(hidden.withheld, 1);
    assert.equal(upcoming(folder, { today: TODAY, includeSensitive: true }).items.length, 2);
  });

  test('a person whose name is sensitive is withheld entirely', () => {
    const folder = load();
    folder.updatePerson('luis-ortega', { sensitivity: { name: 'sensitive' } });
    const r = upcoming(folder, { today: TODAY });
    assert.ok(!JSON.stringify(r.items).includes('Luis'));
    assert.equal(r.withheld, 1);
  });

  test('defaults to the runtime date', () => {
    assert.match(upcoming(load()).today, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('overdue', () => {
  test('people past their cadence, most overdue first', () => {
    const r = overdue(load(), { today: TODAY });
    assert.deepEqual(
      r.overdue.map((p) => [p.slug, p.due, p.daysOverdue, p.daysSince]),
      [
        ['noor-haddad', '2026-05-02', 164, 253],
        ['luis-ortega', '2026-09-10', 33, 64],
        ['javier-moreno', '2026-10-04', 9, 23],
        ['marta-ruiz', '2026-10-12', 1, 15],
      ],
    );
    assert.deepEqual(r.noContact, []);
  });

  test('a cadence without last contact is reported apart; sensitive ones are withheld', () => {
    const folder = load();
    folder.updatePerson('sam-okafor', { last_contact: null });
    folder.updatePerson('noor-haddad', { sensitivity: { last_contact: 'sensitive' } });
    const r = overdue(folder, { today: TODAY });
    assert.deepEqual(r.noContact, [{ slug: 'sam-okafor', name: 'Sam Okafor', cadence: '1m' }]);
    assert.ok(!r.overdue.some((p) => p.slug === 'noor-haddad'));
    assert.equal(r.withheld, 1);
  });

  test('the due day itself is not overdue', () => {
    assert.ok(!overdue(load(), { today: '2026-10-12' }).overdue.some((p) => p.slug === 'marta-ruiz'));
  });
});

describe('gifts', () => {
  test('sameGift ignores case, accents and punctuation, and matches whole words', () => {
    assert.ok(sameGift('Ceramic mug', 'ceramic MUG!'));
    assert.ok(sameGift('Orquídea', 'orquidea blanca'));
    assert.ok(sameGift('mug', 'Ceramic mug from a local workshop'));
    assert.ok(!sameGift('mug', 'smuggler novel'));
    assert.ok(!sameGift('a', 'a book'));
  });

  test('history flags pending ideas that repeat a gift', () => {
    const folder = load();
    folder.addEntry('marta-ruiz', 'gift-ideas', { date: TODAY, text: 'Ceramic mug' });
    const h = giftHistory(folder, 'marta-ruiz');
    assert.deepEqual(h.given.map((g) => g.date), ['2025-12-24', '2025-04-12'], 'newest first');
    const repeat = h.ideas.find((i) => i.text === 'Ceramic mug');
    assert.equal(repeat.repeatOf.text, 'Ceramic mug from a local workshop');
    assert.equal(h.ideas.find((i) => i.text.startsWith('Pottery')).repeatOf, null);
    assert.deepEqual(findGiven(folder, 'carmen-moreno', 'bufanda').map((g) => g.date), ['2025-12']);
  });

  test('gift context has only what a gift suggestion needs', () => {
    const ctx = giftContext(load(), 'marta-ruiz', { today: TODAY, budget: '50 EUR' });
    assert.deepEqual(Object.keys(ctx).sort(), ['budget', 'diet', 'given', 'ideas', 'likes', 'name', 'nextOccasion', 'relationship', 'sizes', 'withheld']);
    assert.deepEqual(ctx.likes, ['Loves handmade ceramics', 'Jazz, especially Chet Baker', 'Dislikes strong perfume']);
    assert.deepEqual(ctx.diet, ['Vegetarian']);
    assert.equal(ctx.ideas.length, 2);
    assert.equal(ctx.budget, '50 EUR');
    assert.deepEqual(ctx.nextOccasion, { label: 'Birthday', date: '2027-04-12', daysAway: 181, years: 37 });
    assert.ok(!JSON.stringify(ctx).includes('Coffee'), 'no notes');
  });

  test('gift context withholds sensitive tastes', () => {
    const folder = load();
    folder.addEntry('marta-ruiz', 'likes', { text: 'Secretly loves reality TV', attrs: { sensitivity: 'sensitive' } });
    const ctx = giftContext(folder, 'marta-ruiz', { today: TODAY });
    assert.ok(!ctx.likes.some((l) => l.includes('reality')));
    assert.equal(ctx.withheld, 1);
    assert.ok(giftContext(folder, 'marta-ruiz', { today: TODAY, includeSensitive: true }).likes.some((l) => l.includes('reality')));
  });
});

describe('brief', () => {
  test('three to five short lines, in the owner language', () => {
    const r = brief(load(), 'marta-ruiz', { today: TODAY });
    assert.deepEqual(r.lines, [
      'Pendiente: Ask how the new job is going (antes del 15 oct)',
      'Promesa: Send her the paella recipe',
      'Prestado (sin devolver): Lent her "The Left Hand of Darkness"',
      'Última nota (28 sept): Coffee. Started a new job at a small studio.',
      'Último contacto hace 15 días, 1 día más de lo habitual',
    ]);
  });

  test('in English, with a nearby birthday first', () => {
    const r = brief(load(), 'luis-ortega', { today: TODAY, language: 'en' });
    assert.deepEqual(r.lines, [
      'Birthday in 21 days (Nov 3)',
      "Follow-up: Ask how the band's first gig went",
      'Last note (Aug 10): Dinner with Marta and Luis. The band has its first gig in October.',
      'Last contact 64 days ago, 33 days past your usual',
    ]);
  });

  test('never more than maxLines, and never empty', () => {
    const folder = load();
    for (let i = 0; i < 4; i++) folder.addEntry('marta-ruiz', 'follow-ups', { date: TODAY, text: `Question ${i}` });
    assert.equal(brief(folder, 'marta-ruiz', { today: TODAY }).lines.length, 5);
    assert.equal(brief(folder, 'marta-ruiz', { today: TODAY, maxLines: 3 }).lines.length, 3);
    const lone = folder.createPerson({ name: 'Ana Gil' });
    assert.deepEqual(brief(folder, lone, { today: TODAY, language: 'en' }).lines, ['Nothing pending with Ana Gil.']);
  });

  test('birthday today', () => {
    assert.equal(brief(load(), 'noor-haddad', { today: '2026-10-20', language: 'en' }).lines[0], 'Birthday today!');
    assert.equal(brief(load(), 'marta-ruiz', { today: '2027-04-12', language: 'es' }).lines[0], '¡Hoy es su cumpleaños (cumple 37)!');
  });

  test('sensitive items are left out and counted', () => {
    const folder = load();
    folder.addEntry('luis-ortega', 'follow-ups', { date: TODAY, text: 'Ask about the job interview', attrs: { sensitivity: 'sensitive' } });
    folder.addEntry('luis-ortega', 'notes', { date: TODAY, text: 'Told me about his debts', attrs: { sensitivity: 'sensitive' } });
    const r = brief(folder, 'luis-ortega', { today: TODAY, language: 'en' });
    assert.ok(!r.lines.join(' ').match(/interview|debts|rough patch/));
    assert.equal(r.withheld, 2);
    assert.equal(r.withheldLine, '2 sensitive items hidden: ask to see them.');
    const all = brief(folder, 'luis-ortega', { today: TODAY, language: 'en', includeSensitive: true });
    assert.ok(all.lines.join(' ').includes('job interview'));
  });

  test('cancelled and done items are not open', () => {
    const folder = load();
    const [promise] = folder.findEntries('marta-ruiz', 'promises', 'paella');
    folder.updateEntry('marta-ruiz', promise, { attrs: { status: 'cancelled' } });
    const r = brief(folder, 'marta-ruiz', { today: TODAY, language: 'en' });
    assert.ok(!r.lines.some((l) => l.includes('paella')));
  });
});

test('person summary', () => {
  const s = personSummary(load(), 'marta-ruiz', { today: TODAY });
  assert.equal(s.name, 'Marta Ruiz');
  assert.deepEqual(s.birthday, { date: '1990-04-12', next: '2027-04-12', daysAway: 181, years: 37 });
  assert.equal(s.overdueBy, 1);
  assert.deepEqual(s.links, [{ slug: 'luis-ortega', name: 'Luis Ortega', type: 'partner' }]);
  assert.deepEqual(s.counts, { giftIdeas: 2, openFollowUps: 1, openPromises: 2, notes: 2 });
  const javi = personSummary(load(), 'luis-ortega', { today: TODAY });
  assert.equal(javi.counts.notes, 1);
  assert.equal(javi.withheld, 1);
});

describe('matching people', () => {
  const folder = load();
  const m = (q) => matchPerson(folder, q);

  test('exact names, aliases and slugs', () => {
    assert.equal(m('Marta Ruiz').slug, 'marta-ruiz');
    assert.equal(m('marta ruiz').slug, 'marta-ruiz');
    assert.equal(m('Javi').slug, 'javier-moreno');
    assert.equal(m('MAMÁ').slug, 'carmen-moreno');
    assert.equal(m('mama').slug, 'carmen-moreno');
    assert.equal(m('sam-okafor').slug, 'sam-okafor');
  });

  test('first names, prefixes, typos and relationships', () => {
    assert.equal(m('Marta').slug, 'marta-ruiz');
    assert.equal(m('Noo').slug, 'noor-haddad');
    assert.equal(m('Mrta').slug, 'marta-ruiz');
    assert.equal(m('Lusi').slug, 'luis-ortega');
    assert.equal(m('brother').slug, 'javier-moreno');
  });

  test('ambiguous when several people fit equally well', () => {
    const r = m('Moreno');
    assert.equal(r.status, 'ambiguous');
    assert.deepEqual(r.candidates.map((c) => c.slug), ['carmen-moreno', 'javier-moreno']);
    assert.equal(m('friend').status, 'ambiguous');
    const two = load();
    two.createPerson({ name: 'Marta Gil' });
    assert.equal(matchPerson(two, 'Marta').status, 'ambiguous');
    assert.equal(matchPerson(two, 'Marta Gil').slug, 'marta-gil');
  });

  test('none when nobody fits', () => {
    const r = m('Zoe');
    assert.equal(r.status, 'none');
    assert.deepEqual(r.suggestions, []);
    assert.equal(m('').status, 'none');
  });

  test('edit distance counts transpositions as one edit', () => {
    assert.equal(editDistance('marta', 'mrata'), 1);
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('', 'abc'), 3);
  });
});
