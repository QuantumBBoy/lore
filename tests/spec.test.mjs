// Keeps spec/SPEC.md, the JSON Schemas and the example folder consistent with each other.

import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  INVERSE_LINK,
  PERSON_SECTIONS,
  entriesWithSensitivity,
  frontmatterSensitivity,
  parseAttributes,
  parseBody,
  readLoreFile,
} from './helpers/lore-text.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMAS = join(ROOT, 'spec', 'schemas');
const SCHEMAS_0_1 = join(ROOT, 'spec', '0.1', 'schemas');
const EXAMPLE = join(ROOT, 'examples', 'lore');
const LORE_0_1 = join(ROOT, 'tests', 'fixtures', 'lore-0.1');
const SPEC = readFileSync(join(ROOT, 'spec', 'SPEC.md'), 'utf8');
const VERSION = '0.2';
const base = (version) => `https://quantumbboy.github.io/lore/spec/${version}/`;

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const schemaFiles = readdirSync(SCHEMAS).filter((f) => f.endsWith('.schema.json'));
const readSchema = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
for (const f of schemaFiles) ajv.addSchema(readSchema(SCHEMAS, f));
for (const f of readdirSync(SCHEMAS_0_1)) ajv.addSchema(readSchema(SCHEMAS_0_1, f));
const validator = (type, version = VERSION) => ajv.getSchema(`${base(version)}${type}.schema.json`);

function assertValid(type, data, label, version = VERSION) {
  const validate = validator(type, version);
  const ok = validate(data);
  assert.ok(ok, `${label} does not match ${type}.schema.json:\n${JSON.stringify(validate.errors, null, 2)}`);
}

const SECTION_RULES = {
  'gifts-given': (e) => e.date !== null || 'needs a date',
  notes: (e) => e.date !== null || 'needs a date',
  'follow-ups': (e) => e.checked !== null || 'needs a checkbox',
  promises: (e) =>
    (e.checked !== null || 'needs a checkbox') &&
    (!('type' in e.attrs) || ['promised', 'lent', 'borrowed'].includes(e.attrs.type) || `bad type ${e.attrs.type}`),
};

/** Check a person body against section 9 and the per-section rules of 8.3. */
function checkPersonBody(body, label) {
  const parsed = parseBody(body);
  for (const section of parsed.sections) {
    for (const entry of section.entries) {
      const where = `${label}, "${section.title}": ${entry.raw}`;
      assert.ok(entry.text.trim() !== '', `${where}: empty text`);
      assert.equal(entry.idInEntry, null, `${where}: #id is only allowed in headings`);
      const rule = SECTION_RULES[section.id];
      if (rule) {
        const verdict = rule(entry);
        assert.equal(verdict, true, `${where}: ${verdict}`);
      }
      if ('due' in entry.attrs) assert.match(entry.attrs.due, /^\d{4}-\d{2}-\d{2}$/, `${where}: due must be a full date`);
      if ('status' in entry.attrs) assert.equal(entry.attrs.status, 'cancelled', `${where}: unknown status`);
      // Literal braces at the end must not be a broken attribute block.
      if (/\{[^{}]*\}$/.test(entry.text)) assert.fail(`${where}: trailing braces do not parse as attributes`);
    }
  }
  return parsed;
}

describe('JSON Schemas', () => {
  test('there is a schema for every frontmatter type', () => {
    assert.deepEqual(schemaFiles.sort(), ['area', 'common', 'index', 'me', 'person'].map((n) => `${n}.schema.json`));
  });

  for (const f of schemaFiles) {
    test(`${f} is a strict draft 2020-12 schema with a versioned $id`, () => {
      const schema = JSON.parse(readFileSync(join(SCHEMAS, f), 'utf8'));
      assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
      assert.equal(schema.$id, base(VERSION) + f);
      assert.ok(ajv.getSchema(schema.$id), 'compiles in strict mode');
    });
  }

  const cases = [
    ['person', { name: 'Ana', birthday: '12/04/1990' }, 'birthday in another format'],
    ['person', { name: 'Ana', birthday: '1991-02-29' }, '29 February in a common year'],
    ['person', { name: 'Ana', birthday: '--02-30' }, 'impossible yearless date'],
    ['person', { name: 'Ana', dates: [{ label: 'x', date: '--04-12', recurring: false }] }, 'non-recurring yearless date'],
    ['person', { name: 'Ana', contact_cadence: 'every two weeks' }, 'cadence in words'],
    ['person', { name: 'Ana', contact_cadence: '0w' }, 'zero cadence'],
    ['person', { name: 'Ana', sensitivity: 'secret' }, 'unknown level'],
    ['person', { name: 'Ana', sensitivity: { nickname: 'public' } }, 'sensitivity for an unknown field'],
    ['person', { name: 'Ana', links: [{ person: 'Luis Ortega', type: 'partner' }] }, 'link to a name, not a slug'],
    ['person', { name: 'Ana', email: 'ana@example.org' }, 'unknown field without namespace'],
    ['person', { name: '' }, 'empty name'],
    ['person', { aliases: ['Ana'] }, 'missing name'],
    ['me', { lore: 0.1, name: 'Alex' }, 'version as a number'],
    ['me', { lore: '0.1', name: 'Alex' }, 'other version (0.1 has its own schemas)'],
    ['me', { lore: '0.3', name: 'Alex' }, 'a future version'],
    ['me', { lore: '0.2', name: 'Alex', leap_day: 'mar01' }, 'bad leap_day'],
    ['index', { lore: '0.2', generated: '2026-10-13 16:00' }, 'generated not RFC 3339 UTC'],
  ];
  for (const [type, data, why] of cases) {
    test(`${type} rejects: ${why}`, () => assert.equal(validator(type)(data), false));
  }

  test('accepts extension fields and Feb 29 / yearless dates', () => {
    assertValid('person', {
      name: 'Ana',
      birthday: '--02-29',
      dates: [{ label: 'Boda', date: '2024-02-29', 'kin.source': 'voice' }],
      sensitivity: { default: 'sensitive', name: 'public', 'org.example.app.score': 'private' },
      'org.example.app.score': { a: 1 },
    }, 'extended person');
    assertValid('area', { sensitivity: 'sensitive', height_cm: 170 }, 'area');
  });
});

describe('attribute blocks', () => {
  test('parse the forms in section 9.5', () => {
    assert.deepEqual(parseAttributes('sensitive'), { attrs: { sensitivity: 'sensitive' }, id: null });
    assert.deepEqual(parseAttributes('#gift-ideas private'), { attrs: { sensitivity: 'private' }, id: 'gift-ideas' });
    assert.deepEqual(parseAttributes('price="60 EUR" kin.source=voice'), { attrs: { price: '60 EUR', 'kin.source': 'voice' }, id: null });
    assert.deepEqual(parseAttributes('note="say \\"hi\\""'), { attrs: { note: 'say "hi"' }, id: null });
  });

  test('reject what is not an attribute block', () => {
    for (const bad of ['', 'two  spaces', 'Hello world', 'x=1 x=2', 'public private', 'a="open', '#a #b']) {
      assert.equal(parseAttributes(bad), null, bad);
    }
  });
});

describe('SPEC.md', () => {
  const examples = [...SPEC.matchAll(/<!-- example: (\w+) -->\n```markdown\n([\s\S]*?)```/g)];

  test('has an example of each main file type', () => {
    assert.deepEqual(examples.map((m) => m[1]).sort(), ['index', 'me', 'person']);
  });

  for (const [, type, text] of examples) {
    test(`the ${type} example is valid`, () => {
      const { data, body } = readLoreFile(text);
      assertValid(type, data, `SPEC.md ${type} example`);
      if (type === 'person') checkPersonBody(body, 'SPEC.md person example');
    });
  }

  test('links to files that exist', () => {
    for (const [, target] of SPEC.matchAll(/\]\(((?:schemas\/)[^)#]*)\)/g)) {
      assert.ok(existsSync(join(ROOT, 'spec', target)), `missing ${target}`);
    }
  });

  test('every table of contents entry points to a heading', () => {
    const anchors = new Set(
      [...SPEC.matchAll(/^#{2,3} (.+)$/gm)].map((m) =>
        m[1].toLowerCase().replace(/[`]/g, '').replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-'),
      ),
    );
    for (const [, anchor] of SPEC.matchAll(/^\d+\. \[[^\]]+\]\(#([^)]+)\)$/gm)) {
      assert.ok(anchors.has(anchor), `no heading for #${anchor}`);
    }
  });

  test('documents every person section the tests know', () => {
    for (const [id, title] of Object.entries(PERSON_SECTIONS)) {
      assert.ok(SPEC.includes(`| \`${id}\` | \`${title}\` |`), `${id} missing from section 8.3`);
    }
  });

  test('documents every link type the tests know', () => {
    for (const [type, inverse] of Object.entries(INVERSE_LINK)) {
      assert.ok(SPEC.includes(`| \`${type}\` | \`${inverse}\` |`), `${type} missing from section 8.2`);
    }
  });
});

describe('example folder', () => {
  const peopleDir = join(EXAMPLE, 'people');
  const slugs = readdirSync(peopleDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  const people = Object.fromEntries(
    slugs.map((slug) => [slug, readLoreFile(readFileSync(join(peopleDir, `${slug}.md`), 'utf8'))]),
  );
  const me = readLoreFile(readFileSync(join(EXAMPLE, 'me.md'), 'utf8'));
  const index = readLoreFile(readFileSync(join(EXAMPLE, 'INDEX.md'), 'utf8'));

  test('me.md is valid', () => assertValid('me', me.data, 'me.md'));
  test('INDEX.md frontmatter is valid', () => assertValid('index', index.data, 'INDEX.md'));

  for (const slug of slugs) {
    test(`people/${slug}.md is valid`, () => {
      assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assertValid('person', people[slug].data, `${slug}.md`);
      checkPersonBody(people[slug].body, `${slug}.md`);
    });
  }

  test('links point to existing people and are written in both directions', () => {
    for (const slug of slugs) {
      for (const link of people[slug].data.links ?? []) {
        assert.ok(slugs.includes(link.person), `${slug} links to missing ${link.person}`);
        const inverse = INVERSE_LINK[link.type];
        if (!inverse) continue;
        const back = (people[link.person].data.links ?? []).some((l) => l.person === slug && l.type === inverse);
        assert.ok(back, `${link.person} should link back to ${slug} as ${inverse}`);
      }
    }
  });

  test('INDEX.md lists every file once, in the order of section 10', () => {
    const lines = index.body.split('\n').filter((l) => l.startsWith('- '));
    const paths = lines.map((l) => l.slice(2).split(' — ')[0]);
    assert.deepEqual(paths, ['me.md', ...slugs.map((s) => `people/${s}.md`)]);
    for (const line of lines) {
      const summary = line.slice(2).split(' — ').slice(1).join(' — ');
      assert.ok(summary.length > 0 && summary.length < 120, `summary length: ${line}`);
    }
    const names = [me.data.name, ...slugs.map((s) => people[s].data.name)];
    lines.forEach((line, i) => assert.ok(line.includes(names[i]), `${line} should name ${names[i]}`));
  });

  test('INDEX.md contains no sensitive data', () => {
    const words = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) ?? [];
    const indexText = ` ${words(index.body).join(' ')} `;
    let sensitiveCount = 0;
    for (const slug of slugs) {
      const { data, body } = people[slug];
      for (const { entry, level } of entriesWithSensitivity(data, parseBody(body))) {
        if (level !== 'sensitive') continue;
        sensitiveCount++;
        // Any three consecutive words of a sensitive entry in the index count as a leak.
        const w = words(entry.text);
        for (let i = 0; i + 3 <= w.length; i++) {
          const phrase = w.slice(i, i + 3).join(' ');
          assert.ok(!indexText.includes(` ${phrase} `), `INDEX.md leaks "${phrase}" from ${slug}`);
        }
      }
      const { file, fields } = frontmatterSensitivity(data);
      for (const field of Object.keys(data)) {
        if ((fields[field] ?? file) === 'sensitive' && typeof data[field] === 'string') {
          assert.ok(!index.body.includes(data[field]), `INDEX.md leaks ${slug}.${field}`);
        }
      }
    }
    assert.ok(sensitiveCount >= 2, 'the example should contain sensitive entries to test against');
  });

  test('covers the features the spec describes', () => {
    const all = slugs.map((s) => people[s]);
    const bodies = all.map((p) => parseBody(p.body));
    const has = (pred, what) => assert.ok(pred, `example should include ${what}`);
    has(all.some((p) => /^--/.test(p.data.birthday ?? '')), 'a birthday without year');
    has(all.some((p) => /-02-29$/.test(p.data.birthday ?? '')), 'a 29 February birthday');
    has(all.some((p) => (p.data.dates ?? []).some((d) => d.kind === 'name_day')), 'a name day');
    has(all.some((p) => (p.data.dates ?? []).some((d) => d.kind === 'anniversary' && /^\d{4}/.test(d.date))), 'an anniversary with year');
    has(all.some((p) => typeof p.data.sensitivity === 'object'), 'per-field sensitivity');
    has(bodies.some((b) => b.sections.some((s) => s.attrs.sensitivity === 'sensitive')), 'a sensitive section');
    has(bodies.some((b) => b.sections.some((s) => s.entries.some((e) => e.attrs.sensitivity === 'sensitive'))), 'a sensitive entry');
    has(bodies.some((b) => b.sections.some((s) => s.id && s.title !== PERSON_SECTIONS[s.id])), 'a localized heading with #id');
    has(bodies.some((b) => b.sections.some((s) => s.id === null)), 'a custom section');
    has(bodies.some((b) => b.sections.some((s) => s.entries.some((e) => /^\d{4}-\d{2}$/.test(e.date ?? '')))), 'an approximate entry date');
    for (const t of ['lent', 'borrowed']) {
      has(bodies.some((b) => b.sections.some((s) => s.entries.some((e) => e.attrs.type === t))), `a ${t} promise`);
    }
    has(Object.keys(me.data).some((k) => k.includes('.')), 'an extension field');
    has(all.some((p) => p.data.last_contact && p.data.contact_cadence), 'contact cadence');
  });
});

describe('versions', () => {
  test('0.2 schemas differ from the frozen 0.1 ones only in version, $id and titles', () => {
    const strip = (schema) => JSON.parse(JSON.stringify(schema).replace(/0\.[12]/g, 'X'));
    assert.deepEqual(readdirSync(SCHEMAS_0_1).sort(), schemaFiles.sort());
    for (const f of schemaFiles) {
      const old = readSchema(SCHEMAS_0_1, f);
      const now = readSchema(SCHEMAS, f);
      assert.equal(new URL(old.$id).pathname, `/lore/spec/0.1/${f}`);
      assert.equal(new URL(now.$id).pathname, `/lore/spec/${VERSION}/${f}`);
      assert.deepEqual(strip(now), strip(old), f);
    }
    assert.equal(readSchema(SCHEMAS, 'common.schema.json').$defs.version.const, VERSION);
    assert.equal(readSchema(SCHEMAS_0_1, 'common.schema.json').$defs.version.const, '0.1');
  });

  test('the 0.1 fixture folder is valid 0.1, and valid 0.2 once its version says so', () => {
    const me = readLoreFile(readFileSync(join(LORE_0_1, 'me.md'), 'utf8'));
    assert.equal(me.data.lore, '0.1');
    assertValid('me', me.data, '0.1 me.md', '0.1');
    assertValid('me', { ...me.data, lore: VERSION }, 'upgraded me.md');
    for (const f of readdirSync(join(LORE_0_1, 'people'))) {
      const person = readLoreFile(readFileSync(join(LORE_0_1, 'people', f), 'utf8'));
      assertValid('person', person.data, `0.1 ${f}`, '0.1');
      assertValid('person', person.data, `0.1 ${f} under ${VERSION}`);
    }
  });

  test('the frozen 0.1 spec says it is 0.1', () => {
    assert.match(readFileSync(join(ROOT, 'spec', '0.1', 'SPEC.md'), 'utf8'), /^# Lore specification\n\n\*\*Version 0\.1 \(draft\)\*\*/);
    assert.match(SPEC, new RegExp(`^# Lore specification\\n\\n\\*\\*Version ${VERSION.replace('.', '\\.')} \\(draft\\)\\*\\*`));
  });
});
