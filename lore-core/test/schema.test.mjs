import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LoreFile } from '../src/file.mjs';
import { SUPPORTED_VERSIONS, formatErrors, isRealDate, schemaBase, validateFrontmatter } from '../src/schema.mjs';
import { generateSchemasModule, OUT } from '../../tools/gen-schemas.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
// Every version's schemas: the current ones, and earlier ones frozen under spec/<version>/.
for (const dir of [join(ROOT, 'spec', '0.1', 'schemas'), join(ROOT, 'spec', 'schemas')]) {
  for (const f of readdirSync(dir)) ajv.addSchema(JSON.parse(readFileSync(join(dir, f), 'utf8')));
}
const reference = (type, data, version) => ajv.getSchema(`${schemaBase(version)}${type}.schema.json`)(data);

test('the embedded schemas match spec/schemas (run tools/gen-schemas.mjs)', () => {
  assert.equal(readFileSync(OUT, 'utf8'), generateSchemasModule());
});

test('isRealDate', () => {
  assert.ok(isRealDate('2024-02-29'));
  assert.ok(!isRealDate('2023-02-29'));
  assert.ok(!isRealDate('2026-04-31'));
  assert.ok(!isRealDate('2026-4-1'));
});

describe('agrees with Ajv on valid and invalid documents', () => {
  const example = (p) => LoreFile.parse(readFileSync(join(ROOT, 'examples', 'lore', p), 'utf8')).data;
  const people = readdirSync(join(ROOT, 'examples', 'lore', 'people')).map((f) => example(`people/${f}`));

  const VALUES = {
    name: ['Ana', '', ' ', 'x'.repeat(201), 12, null, ['Ana'], 'Line\nbreak'],
    aliases: [['A'], [], ['A', 'A'], 'A', [''], [1]],
    pronouns: ['she/her', '', 'x'.repeat(121)],
    relationship: ['friend', '', 3],
    birthday: ['1990-04-12', '--04-12', '--02-29', '1991-02-29', '2024-02-29', '--02-30', '1990-4-12', '12/04/1990', '--13-01', 19900412],
    dates: [
      [{ label: 'x', date: '--04-12' }],
      [{ label: 'x', date: '--04-12', recurring: false }],
      [{ label: 'x', date: '2015-06-20', recurring: false, kind: 'anniversary', sensitivity: 'sensitive' }],
      [{ label: 'x', date: '2015-06-20', kind: 'birthday' }],
      [{ date: '2015-06-20' }],
      [{ label: 'x', date: '2015-06-20', extra: 1 }],
      [{ label: 'x', date: '2015-06-20', 'kin.source': 'voice' }],
      {},
    ],
    contact_cadence: ['2w', '1m', '999y', '0d', '1000d', '2 weeks', '2W', 2],
    last_contact: ['2026-10-01', '--10-01', '2026-02-30'],
    links: [
      [{ person: 'luis-ortega', type: 'partner' }],
      [{ person: 'Luis', type: 'partner' }],
      [{ person: 'luis', type: 'Partner' }],
      [{ person: 'luis' }],
      [{ person: 'luis', type: 'aunt-uncle', sensitivity: 'public' }],
      [{ person: 'luis', type: 'friend', sensitivity: 'secret' }],
    ],
    sensitivity: ['private', 'secret', { default: 'public' }, { birthday: 'sensitive' }, {}, { nickname: 'public' }, { 'kin.x': 'private' }, { default: 'x' }],
    'kin.anything': [1, 'x', { a: [1] }, null],
    unknown_field: ['x'],
  };

  const cases = [];
  for (const p of people) cases.push(['person', p]);
  for (const [field, values] of Object.entries(VALUES)) {
    for (const v of values) cases.push(['person', { ...people[0], [field]: v }]);
  }
  cases.push(['person', {}]);
  cases.push(['person', []]);
  cases.push(['person', 'text']);
  const me = example('me.md');
  cases.push(['me', me]);
  for (const [field, values] of Object.entries({
    lore: ['0.1', 0.1, '0.2', undefined],
    language: ['es', 'en-GB', 'spanish!', 'e'],
    timezone: ['Europe/Madrid', 'UTC', 'America/Argentina/Buenos_Aires', 'Madrid', 'Etc/GMT+3'],
    leap_day: ['feb28', 'mar1', 'mar01'],
    sensitivity: [{ default: 'private', timezone: 'public' }, { relationship: 'public' }],
    relationship: ['self'],
  })) {
    for (const v of values) {
      const d = { ...me, [field]: v };
      if (v === undefined) delete d[field];
      cases.push(['me', d]);
    }
  }
  const index = example('INDEX.md');
  cases.push(['index', index]);
  for (const g of ['2026-10-13T16:00:00Z', '2026-10-13T16:00:00.123Z', '2026-10-13 16:00', '2026-10-13T16:00:00+02:00', '2026-02-30T00:00:00Z']) {
    cases.push(['index', { ...index, generated: g }]);
  }
  cases.push(['area', { sensitivity: 'sensitive', anything: 1 }]);
  cases.push(['area', { sensitivity: 'x' }]);
  cases.push(['area', {}]);

  for (const version of SUPPORTED_VERSIONS) {
    for (const [type, data] of cases) {
      test(`${version} ${type} ${JSON.stringify(data).slice(0, 90)}`, () => {
        const expected = reference(type, data, version);
        const errors = validateFrontmatter(type, data, { version });
        assert.equal(errors.length === 0, expected, `lore-core says ${JSON.stringify(formatErrors(errors))}, Ajv says ${expected}`);
      });
    }
  }
});

describe('messages', () => {
  const msg = (type, data) => formatErrors(validateFrontmatter(type, data));

  test('name the field and say what is expected', () => {
    assert.deepEqual(msg('person', { name: 'Ana', birthday: '12/04/1990' }), ['birthday is not valid: A full date or a yearless date.']);
    assert.deepEqual(msg('person', { name: 'Ana', sensitivity: { nickname: 'public' } }), [
      'sensitivity.nickname is not a Lore field (fields from other programs need a namespace, like "app.nickname")',
    ]);
    assert.deepEqual(msg('person', { aliases: ['A'] }), ['the frontmatter needs the field "name"']);
    assert.deepEqual(msg('person', { name: 'Ana', dates: [{ label: 'Santo', date: '--04-12', recurring: false }] }), ['dates.0.recurring must be true']);
    assert.match(msg('me', { lore: 0.1, name: 'A' })[0], /^lore must be "0\.2"/);
    assert.match(msg('person', { name: 'Ana', contact_cadence: 'every 2 weeks' })[0], /^contact_cadence is not valid: .*2w/);
  });
});
