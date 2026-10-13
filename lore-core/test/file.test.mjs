import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { parseAttributes, formatAttributes } from '../src/attributes.mjs';
import { Body, formatEntryLine, parseEntryLine } from '../src/body.mjs';
import { LoreFile } from '../src/file.mjs';
import { LoreFormatError } from '../src/frontmatter.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXAMPLE = join(ROOT, 'examples', 'lore');
const exampleFiles = ['me.md', 'INDEX.md', ...readdirSync(join(EXAMPLE, 'people')).map((f) => `people/${f}`)];
const read = (p) => readFileSync(join(EXAMPLE, p), 'utf8');

describe('round trips', () => {
  for (const p of exampleFiles) {
    test(`${p} is written back byte for byte`, () => {
      const text = read(p);
      assert.equal(LoreFile.parse(text, p).toString(), text);
    });
  }

  const odd = [
    '---\n---\n',
    '---\nname: X\n---',
    '---\nname: X\n---\n',
    '---\n# only a comment\n---\nbody without newline',
    '---\nname: X   # trailing comment\n\n\n# comment\naliases:\n- "a"\n- \'b\'\n---\n\n\n## Weird   section  {#notes}\n\n* 2020: star bullet\n+ plus bullet\n\n  indented paragraph\n\n| table | x |\n|---|---|\n\n### sub\n- [X] 2024-02: capital X\n',
  ];
  for (const text of odd) {
    test(`unusual file ${JSON.stringify(text).slice(0, 40)} round-trips`, () => {
      assert.equal(LoreFile.parse(text).toString(), text);
    });
  }

  test('BOM and CRLF are normalised to what producers must write', () => {
    const f = LoreFile.parse('\uFEFF---\r\nname: X\r\n---\r\nBody\r\n');
    assert.equal(f.toString(), '---\nname: X\n---\nBody\n');
  });

  test('rejects files that are not Lore files', () => {
    assert.throws(() => LoreFile.parse('# Title\n'), LoreFormatError);
    assert.throws(() => LoreFile.parse('---\nname: X\n'), LoreFormatError);
    assert.throws(() => LoreFile.parse('---\n- a\n- b\n---\n'), /mapping/);
    assert.throws(() => LoreFile.parse('---\nname: &a X\n---\n'), /anchors/);
  });
});

describe('frontmatter edits touch only their key', () => {
  const text = [
    '---',
    '# People I met at university',
    'name: Marta Ruiz  # full name',
    'aliases: [Martita]',
    '',
    '# She hates when people forget it',
    'birthday: 1990-04-12',
    'links:',
    '- person: luis-ortega',
    '  type: partner',
    '# trailing comment',
    '---',
    '',
    '# Marta',
    '',
  ].join('\n');

  test('changing a value keeps every other line, including comments', () => {
    const f = LoreFile.parse(text);
    f.set('birthday', '--04-12');
    assert.equal(f.toString(), text.replace('birthday: 1990-04-12', 'birthday: --04-12'));
  });

  test('changing a list rewrites only that block', () => {
    const f = LoreFile.parse(text);
    f.set('links', [...f.get('links'), { person: 'ana-gil', type: 'sibling' }]);
    const expected = text.replace(
      'links:\n- person: luis-ortega\n  type: partner\n',
      'links:\n  - person: luis-ortega\n    type: partner\n  - person: ana-gil\n    type: sibling\n',
    );
    assert.equal(f.toString(), expected);
  });

  test('adding a key appends it after the last key, before trailing comments', () => {
    const f = LoreFile.parse(text);
    f.set('last_contact', '2026-10-01');
    assert.equal(f.toString(), text.replace('  type: partner\n', '  type: partner\nlast_contact: 2026-10-01\n'));
  });

  test('deleting a key removes its block and the comment above it', () => {
    const f = LoreFile.parse(text);
    f.delete('birthday');
    assert.equal(f.toString(), text.replace('\n# She hates when people forget it\nbirthday: 1990-04-12', ''));
    assert.equal(f.get('birthday'), undefined);
  });

  test('setting the same value changes nothing', () => {
    const f = LoreFile.parse(text);
    assert.equal(f.set('aliases', ['Martita']), false);
    assert.equal(f.toString(), text);
  });

  test('values that need quotes are quoted', () => {
    const f = LoreFile.parse('---\nname: X\n---\n');
    f.set('relationship', 'yes');
    f.set('kin.note', 'a: b');
    assert.equal(f.toString(), '---\nname: X\nrelationship: "yes"\nkin.note: "a: b"\n---\n');
    assert.equal(LoreFile.parse(f.toString()).get('relationship'), 'yes');
  });

  test('create builds a valid file', () => {
    const f = LoreFile.create({ name: 'Ana Gil', aliases: ['Anita'], birthday: '--02-29' }, '\n# Ana Gil\n');
    assert.equal(f.toString(), '---\nname: Ana Gil\naliases: [Anita]\nbirthday: --02-29\n---\n\n# Ana Gil\n');
  });
});

describe('attributes', () => {
  test('parse and format', () => {
    assert.deepEqual(parseAttributes('sensitive type=lent price="60 EUR"'), {
      attrs: { sensitivity: 'sensitive', type: 'lent', price: '60 EUR' },
      id: null,
    });
    assert.equal(formatAttributes({ sensitivity: 'sensitive', type: 'lent', price: '60 EUR' }), ' {sensitive type=lent price="60 EUR"}');
    assert.equal(formatAttributes({ note: 'say "hi"' }), ' {note="say \\"hi\\""}');
    assert.equal(formatAttributes({}, 'gift-ideas'), ' {#gift-ideas}');
    assert.equal(formatAttributes({}), '');
    assert.throws(() => formatAttributes({ 'Bad Key': 1 }), /invalid attribute/);
  });
});

describe('body', () => {
  const marta = LoreFile.parse(read('people/marta-ruiz.md'));

  test('finds sections by canonical heading', () => {
    assert.deepEqual(
      marta.body.sections.map((s) => s.id),
      ['likes', 'sizes', 'diet', 'gift-ideas', 'gifts-given', 'plan-ideas', 'follow-ups', 'promises', 'notes'],
    );
  });

  test('finds sections by id in localized headings', () => {
    const carmen = LoreFile.parse(read('people/carmen-moreno.md'));
    assert.deepEqual(carmen.body.sections.map((s) => [s.title, s.id]), [
      ['Gustos', 'likes'],
      ['Ideas de regalo', 'gift-ideas'],
      ['Regalos hechos', 'gifts-given'],
      ['Pendiente de preguntar', 'follow-ups'],
      ['Notas', 'notes'],
    ]);
  });

  test('parses entries: checkbox, date, text, attributes', () => {
    const [promise, lent] = marta.body.entries('promises');
    assert.deepEqual(
      { checked: lent.checked, date: lent.date, text: lent.text, attrs: lent.attrs },
      { checked: false, date: '2026-07-02', text: 'Lent her "The Left Hand of Darkness"', attrs: { type: 'lent' } },
    );
    assert.equal(promise.attrs.type, undefined);
    const [idea] = marta.body.entries('gift-ideas');
    assert.equal(idea.attrs.price, '60 EUR');
    const done = marta.body.entries('follow-ups')[1];
    assert.equal(done.checked, true);
  });

  test('entry lines', () => {
    assert.deepEqual(parseEntryLine('- 2 tickets for the concert'), { checked: null, date: null, text: '2 tickets for the concert', attrs: {} });
    assert.deepEqual(parseEntryLine('- 2019: Trip {nice}'), { checked: null, date: '2019', text: 'Trip {nice}', attrs: {} });
    assert.equal(formatEntryLine({ checked: false, date: '2026-10-13', text: 'Ask\nabout it', attrs: { due: '2026-11-01' } }), '- [ ] 2026-10-13: Ask about it {due=2026-11-01}');
    assert.equal(formatEntryLine({ text: 'Set {sensitive}' }), '- Set {sensitive}.');
    assert.throws(() => formatEntryLine({ text: '  ' }), /needs text/);
  });

  test('continuation lines belong to their entry', () => {
    const b = new Body('## Notes log\n\n- 2026-01-01: First\n  more about it\n\n  and a second paragraph\n- 2025-12-01: Older\n\nA paragraph.\n');
    const [first, second] = b.entries('notes');
    assert.deepEqual(first.continuation, ['  more about it', '', '  and a second paragraph']);
    assert.equal(second.text, 'Older');
    assert.equal(b.entries('notes').length, 2);
  });

  test('adds entries at the bottom, or at the top for notes', () => {
    const b = new Body('\n# M\n\n## Gift ideas\n\n- a\n\n## Notes log\n\n- 2026-01-02: new\n- 2026-01-01: old\n');
    b.addEntry('gift-ideas', { date: '2026-02-01', text: 'b' });
    b.addEntry('notes', { date: '2026-02-01', text: 'newest' }, { position: 'top' });
    assert.equal(
      b.toString(),
      '\n# M\n\n## Gift ideas\n\n- a\n- 2026-02-01: b\n\n## Notes log\n\n- 2026-02-01: newest\n- 2026-01-02: new\n- 2026-01-01: old\n',
    );
  });

  test('creates missing sections in the recommended order', () => {
    const b = new Body('\n# M\n\n## Likes & dislikes\n\n- Jazz\n\n## Notes log\n\n- 2026-01-01: hi\n');
    b.addEntry('gift-ideas', { text: 'Vinyl' });
    b.addEntry('promises', { checked: false, text: 'Call back' });
    b.addEntry('sizes', { text: 'Shoes: 38' });
    assert.equal(
      b.toString(),
      '\n# M\n\n## Likes & dislikes\n\n- Jazz\n\n## Sizes\n\n- Shoes: 38\n\n## Gift ideas\n\n- Vinyl\n\n## Promises\n\n- [ ] Call back\n\n## Notes log\n\n- 2026-01-01: hi\n',
    );
  });

  test('creates sections at the end of the file, keeping the final newline', () => {
    const b = new Body('\n# M\n\nIntro.\n');
    b.addEntry('notes', { date: '2026-01-01', text: 'hi' });
    assert.equal(b.toString(), '\n# M\n\nIntro.\n\n## Notes log\n\n- 2026-01-01: hi\n');
    const empty = new Body('');
    empty.addEntry('likes', { text: 'Tea' });
    assert.equal(empty.toString(), '## Likes & dislikes\n\n- Tea\n');
  });

  test('new sections use the owner language, with the id', () => {
    const b = new Body('\n# Carmen\n');
    b.addEntry('gift-ideas', { text: 'Orquídea' }, { language: 'es' });
    assert.equal(b.toString(), '\n# Carmen\n\n## Ideas de regalo {#gift-ideas}\n\n- Orquídea\n');
    assert.equal(b.entries('gift-ideas').length, 1);
  });

  test('unknown sections are kept and skipped when ordering', () => {
    const javi = LoreFile.parse(read('people/javier-moreno.md'));
    const before = javi.toString();
    javi.body.addEntry('follow-ups', { checked: false, date: '2026-10-13', text: 'Ask about the knee' });
    const after = javi.toString();
    assert.ok(after.includes('## Follow-ups\n\n- [ ] 2026-10-13: Ask about the knee\n\n## Promises'));
    assert.ok(after.includes('## Health {sensitive}\n\n- Knee surgery in September, recovering well'));
    assert.equal(after.replace('## Follow-ups\n\n- [ ] 2026-10-13: Ask about the knee\n\n', ''), before);
  });

  test('updates and removes entries without touching other lines', () => {
    const f = LoreFile.parse(read('people/marta-ruiz.md'));
    const before = f.toString();
    const [followUp] = f.body.entries('follow-ups');
    f.body.updateEntry(followUp, { checked: true });
    assert.equal(f.toString(), before.replace('- [ ] 2026-09-28: Ask how', '- [x] 2026-09-28: Ask how'));
    const [, lent] = f.body.entries('promises');
    f.body.removeEntry(lent);
    assert.equal(f.toString(), before.replace('- [ ] 2026-09-28: Ask how', '- [x] 2026-09-28: Ask how').replace('- [ ] 2026-07-02: Lent her "The Left Hand of Darkness" {type=lent}\n', ''));
  });

  test('refuses to edit an entry that changed since it was read', () => {
    const f = LoreFile.parse(read('people/marta-ruiz.md'));
    const [idea] = f.body.entries('gift-ideas');
    f.body.updateEntry(idea, { text: 'Changed' });
    assert.throws(() => f.body.removeEntry(idea), /changed since it was read/);
  });

  test('hand edits survive a program edit elsewhere in the file', () => {
    const hand = [
      '---',
      "name: 'Marta Ruiz'   # quoted on purpose",
      'aliases:',
      '  - Martita     # school nickname',
      '---',
      '',
      '# Marta',
      '',
      'Some *free* text I wrote.',
      '',
      '## Gift ideas',
      '',
      '* idea with a star bullet',
      '- [X] 2026-01: approximate date',
      '',
      '> a quote I like',
      '',
      '## My own section',
      '',
      '| col | x |',
      '|-----|---|',
      '',
    ].join('\n');
    const f = LoreFile.parse(hand);
    f.set('last_contact', '2026-10-13');
    f.body.addEntry('gift-ideas', { date: '2026-10-13', text: 'Pottery class' });
    const expected = hand
      .replace('  - Martita     # school nickname\n', '  - Martita     # school nickname\nlast_contact: 2026-10-13\n')
      .replace('- [X] 2026-01: approximate date\n', '- [X] 2026-01: approximate date\n- 2026-10-13: Pottery class\n');
    assert.equal(f.toString(), expected);
  });
});

describe('agrees with the independent reader used by the spec tests', async () => {
  const reference = await import('../../tests/helpers/lore-text.mjs');
  for (const p of exampleFiles) {
    test(p, () => {
      const text = read(p);
      const ours = LoreFile.parse(text);
      const theirs = reference.readLoreFile(text);
      assert.deepEqual(ours.data, theirs.data);
      const ref = reference.parseBody(theirs.body);
      assert.deepEqual(
        ours.body.sections.map((s) => ({ title: s.title, id: s.id, attrs: s.attrs, entries: s.entries.map((e) => [e.checked, e.date, e.text, e.attrs]) })),
        ref.sections.map((s) => ({ title: s.title, id: s.id, attrs: s.attrs, entries: s.entries.map((e) => [e.checked, e.date, e.text, e.attrs]) })),
      );
    });
  }
});
