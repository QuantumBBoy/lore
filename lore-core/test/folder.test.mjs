import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { LoreError, LoreFolder } from '../src/folder.mjs';
import { readFolder } from '../src/node.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXAMPLE = join(ROOT, 'examples', 'lore');
const NOW = new Date('2026-10-13T16:00:00Z');
const load = () => readFolder(EXAMPLE);

describe('the example folder', () => {
  test('loads, and validates without issues', () => {
    const folder = load();
    assert.deepEqual(folder.slugs(), ['carmen-moreno', 'javier-moreno', 'luis-ortega', 'marta-ruiz', 'noor-haddad', 'sam-okafor']);
    assert.deepEqual(folder.validate({ now: NOW }), []);
  });

  test('INDEX.md is exactly what buildIndex generates', () => {
    assert.equal(load().buildIndex({ now: NOW }), readFileSync(join(EXAMPLE, 'INDEX.md'), 'utf8'));
  });

  test('toFiles returns the files unchanged when nothing was edited', () => {
    const folder = load();
    for (const [path, text] of folder.toFiles()) assert.equal(text, readFileSync(join(EXAMPLE, path), 'utf8'), path);
  });
});

describe('people', () => {
  test('createPerson writes a valid file with a unique slug', () => {
    const folder = load();
    const slug = folder.createPerson({ relationship: 'colleague', name: 'Marta Ruiz', birthday: '--03-01' });
    assert.equal(slug, 'marta-ruiz-2');
    assert.equal(
      folder.getText('people/marta-ruiz-2.md'),
      '---\nname: Marta Ruiz\nrelationship: colleague\nbirthday: --03-01\n---\n\n# Marta Ruiz\n',
    );
    assert.equal(folder.createPerson({ name: 'Ñandú Ödön-Łukasz' }), 'nandu-odon-lukasz');
    assert.equal(folder.changes, 2);
  });

  test('createPerson rejects invalid data and changes nothing', () => {
    const folder = load();
    assert.throws(() => folder.createPerson({ name: 'Ana', birthday: '31/12' }), (e) => e instanceof LoreError && e.code === 'invalid' && /birthday/.test(e.message));
    assert.throws(() => folder.createPerson({ aliases: ['x'] }), /needs the field "name"/);
    assert.equal(folder.slugs().length, 6);
    assert.equal(folder.changes, 0);
  });

  test('updatePerson sets and removes fields, touching only their lines', () => {
    const folder = load();
    const before = folder.getText('people/noor-haddad.md');
    folder.updatePerson('noor-haddad', { birthday: '1989-10-20', contact_cadence: null });
    assert.equal(folder.getText('people/noor-haddad.md'), before.replace('birthday: --10-20', 'birthday: 1989-10-20').replace('contact_cadence: 3m\n', ''));
  });

  test('updatePerson refuses invalid values atomically', () => {
    const folder = load();
    const before = folder.getText('people/noor-haddad.md');
    assert.throws(() => folder.updatePerson('noor-haddad', { relationship: 'friend again', contact_cadence: 'often' }), /contact_cadence/);
    assert.equal(folder.getText('people/noor-haddad.md'), before);
    assert.throws(() => folder.updatePerson('nobody', { name: 'x' }), (e) => e.code === 'not-found');
  });

  test('deletePerson removes the file and every link to them', () => {
    const folder = load();
    assert.deepEqual(folder.deletePerson('luis-ortega'), ['marta-ruiz']);
    assert.equal(folder.person('luis-ortega'), null);
    assert.equal(folder.person('marta-ruiz').get('links'), undefined);
    assert.ok(!folder.getText('people/marta-ruiz.md').includes('luis-ortega'));
    assert.deepEqual(folder.validate({ now: NOW }).filter((i) => i.level === 'error'), []);
  });

  test('recordContact keeps the latest date', () => {
    const folder = load();
    assert.equal(folder.recordContact('noor-haddad', '2026-10-01'), true);
    assert.equal(folder.recordContact('noor-haddad', '2026-09-01'), false);
    assert.equal(folder.person('noor-haddad').get('last_contact'), '2026-10-01');
    assert.throws(() => folder.recordContact('noor-haddad', '--10-01'), /full date/);
  });
});

describe('links', () => {
  test('are written in both directions with the inverse type', () => {
    const folder = load();
    assert.deepEqual(folder.link('sam-okafor', 'javier-moreno', 'manager'), { inverse: 'report' });
    assert.deepEqual(folder.person('sam-okafor').get('links').at(-1), { person: 'javier-moreno', type: 'manager' });
    assert.deepEqual(folder.person('javier-moreno').get('links').at(-1), { person: 'sam-okafor', type: 'report' });
    assert.deepEqual(folder.validate({ now: NOW }).filter((i) => i.path !== 'INDEX.md'), []);
  });

  test('changing a type keeps the link in place; unknown types go one way', () => {
    const folder = load();
    folder.link('marta-ruiz', 'luis-ortega', 'spouse');
    assert.deepEqual(folder.person('marta-ruiz').get('links'), [{ person: 'luis-ortega', type: 'spouse' }]);
    assert.deepEqual(folder.person('luis-ortega').get('links'), [{ person: 'marta-ruiz', type: 'spouse' }]);
    assert.deepEqual(folder.link('noor-haddad', 'marta-ruiz', 'mentor'), { inverse: null });
    assert.equal(folder.person('marta-ruiz').get('links').length, 1);
    assert.equal(folder.link('marta-ruiz', 'luis-ortega', 'spouse').inverse, 'spouse');
  });

  test('unlink removes both directions', () => {
    const folder = load();
    assert.equal(folder.unlink('marta-ruiz', 'luis-ortega'), true);
    assert.equal(folder.person('marta-ruiz').get('links'), undefined);
    assert.equal(folder.person('luis-ortega').get('links'), undefined);
    assert.equal(folder.unlink('marta-ruiz', 'luis-ortega'), false);
  });

  test('rejects bad links', () => {
    const folder = load();
    assert.throws(() => folder.link('marta-ruiz', 'marta-ruiz', 'friend'), /themselves/);
    assert.throws(() => folder.link('marta-ruiz', 'nobody', 'friend'), /No person/);
    assert.throws(() => folder.link('marta-ruiz', 'luis-ortega', 'Best Friend'), /not a link type/);
  });
});

describe('entries', () => {
  test('follow-ups get a checkbox; notes go first; gifts need a date', () => {
    const folder = load();
    folder.addEntry('sam-okafor', 'follow-ups', { date: '2026-10-13', text: 'Ask about the new board game café' });
    folder.addEntry('sam-okafor', 'notes', { date: '2026-10-13', text: 'Quick coffee.' });
    const text = folder.getText('people/sam-okafor.md');
    assert.ok(text.includes('- [ ] 2026-10-13: Ask about the new board game café\n'));
    assert.ok(text.includes('## Notes log\n\n- 2026-10-13: Quick coffee.\n- 2026-09-15:'));
    assert.throws(() => folder.addEntry('sam-okafor', 'gifts-given', { text: 'A book' }), /need a date/);
    assert.throws(() => folder.addEntry('sam-okafor', 'gifts', { text: 'x' }), /Unknown section/);
    assert.throws(() => folder.addEntry('sam-okafor', 'notes', { date: '13/10', text: 'x' }), /not a date/);
  });

  test('new sections follow the owner language', () => {
    const folder = load(); // me.md says language: es
    folder.addEntry('noor-haddad', 'gift-ideas', { date: '2026-10-13', text: 'Carrete de película' });
    assert.ok(folder.getText('people/noor-haddad.md').includes('## Ideas de regalo {#gift-ideas}\n\n- 2026-10-13: Carrete de película\n'));
  });

  test('find, complete and remove entries', () => {
    const folder = load();
    const [followUp] = folder.findEntries('marta-ruiz', 'follow-ups', 'NEW JOB');
    assert.equal(followUp.text, 'Ask how the new job is going');
    folder.completeEntry('marta-ruiz', followUp);
    assert.equal(folder.findEntries('marta-ruiz', 'follow-ups', 'new job')[0].checked, true);
    const [vinyl] = folder.findEntries('marta-ruiz', 'gift-ideas', 'chet');
    folder.removeEntry('marta-ruiz', vinyl);
    assert.equal(folder.findEntries('marta-ruiz', 'gift-ideas', 'chet').length, 0);
    assert.equal(folder.findEntries('carmen-moreno', 'gift-ideas', 'orquidea').length, 1, 'accent-insensitive');
  });

  test('entries carry their effective sensitivity', () => {
    const folder = load();
    const notes = folder.entries('luis-ortega', 'notes');
    assert.deepEqual(notes.map((e) => e.level), ['private', 'sensitive']);
  });

  test('giveGift moves an idea to gifts given', () => {
    const folder = load();
    const [idea] = folder.findEntries('marta-ruiz', 'gift-ideas', 'pottery');
    folder.giveGift('marta-ruiz', { idea, date: '2026-10-12', occasion: 'birthday' });
    assert.equal(folder.findEntries('marta-ruiz', 'gift-ideas', 'pottery').length, 0);
    const given = folder.entries('marta-ruiz', 'gifts-given');
    assert.deepEqual([given.at(-1).date, given.at(-1).text, given.at(-1).attrs], ['2026-10-12', 'Pottery class, she wants to learn', { occasion: 'birthday' }]);
  });
});

describe('index and validation', () => {
  test('summaries never show sensitive data', () => {
    const folder = load();
    folder.updatePerson('luis-ortega', { sensitivity: { default: 'private', name: 'sensitive' } });
    assert.equal(folder.summarize('people/luis-ortega.md'), 'sensitive');
    assert.equal(folder.summarize('people/marta-ruiz.md'), 'Marta Ruiz (aka Martita) — friend');
    folder.updatePerson('sam-okafor', { links: [{ person: 'noor-haddad', type: 'friend', sensitivity: 'sensitive' }] });
    assert.equal(folder.summarize('people/sam-okafor.md'), 'Sam Okafor — colleague');
    folder.setText('body.md', '---\n---\n\n# Body\n');
    assert.equal(folder.summarize('body.md'), 'sensitive', 'body.md is sensitive by default');
    folder.setText('training.md', '---\n---\n\n# Training\n');
    assert.equal(folder.summarize('training.md'), 'Training');
  });

  test('long summaries are cut under 120 characters', () => {
    const folder = load();
    for (let i = 0; i < 8; i++) {
      const slug = folder.createPerson({ name: `Cousin Number ${i} With A Long Name` });
      folder.link('marta-ruiz', slug, 'cousin');
    }
    const summary = folder.summarize('people/marta-ruiz.md');
    assert.ok(summary.length < 120, summary);
    assert.ok(summary.startsWith('Marta Ruiz (aka Martita) — friend; partner of Luis Ortega'));
  });

  test('regenerateIndex lists new people', () => {
    const folder = load();
    folder.createPerson({ name: 'Ana Gil', relationship: 'neighbor' });
    folder.regenerateIndex({ now: NOW });
    assert.ok(folder.getText('INDEX.md').includes('- people/ana-gil.md — Ana Gil — neighbor\n'));
    assert.deepEqual(folder.validate({ now: NOW }), []);
  });

  test('validate reports what is wrong', () => {
    const folder = load();
    folder.setText('people/Bad_Name.md', '---\nname: X\n---\n');
    folder.setText('people/broken.md', '---\nname: [unclosed\n---\n');
    folder.setText('people/ok.md', '---\nname: Ok\nlinks:\n  - person: marta-ruiz\n    type: sibling\n  - person: ghost\n    type: friend\n---\n\n## Notes log\n\n- no date here\n\n## Promises\n\n- 2026-01-01: no checkbox {type=given due=soon}\n\n## Notes log\n');
    folder.updatePerson('noor-haddad', { name: 'Noor H.' });
    const issues = folder.validate({ now: NOW }).map((i) => `${i.level} ${i.path}: ${i.message}`);
    const expect = [
      /error people\/Bad_Name.md: "Bad_Name" is not a valid slug/,
      /error people\/broken.md: YAML line 2/,
      /warning people\/ok.md: marta-ruiz should link back to ok as sibling/,
      /warning people\/ok.md: links to "ghost"/,
      /warning people\/ok.md: "Notes log": - no date here needs a date/,
      /warning people\/ok.md: "Promises": .* needs a checkbox/,
      /warning people\/ok.md: .* due date that is not YYYY-MM-DD/,
      /warning people\/ok.md: .* unknown promise type "given"/,
      /warning people\/ok.md: section "Notes log" appears twice/,
      /warning INDEX.md: INDEX.md is out of date/,
    ];
    for (const re of expect) assert.ok(issues.some((i) => re.test(i)), `missing ${re}\n${issues.join('\n')}`);
  });

  test('a new folder', () => {
    const folder = LoreFolder.create({ name: 'Alex', language: 'es', timezone: 'Europe/Madrid' });
    assert.equal(folder.getText('me.md'), '---\nlore: "0.1"\nname: Alex\nlanguage: es\ntimezone: Europe/Madrid\n---\n\n# Alex\n');
    assert.deepEqual(folder.validate(), []);
    assert.throws(() => LoreFolder.create({}), /needs a name/);
    assert.throws(() => LoreFolder.create({ name: 'A', timezone: 'nowhere' }), /timezone/);
  });
});
