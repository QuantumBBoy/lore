import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { parse as referenceParse } from 'yaml';
import { YamlError, formatEntry, isPlainSafe, parseYaml, stringifyYaml } from '../src/yaml.mjs';

// The `yaml` package (dev dependency only) is the reference implementation: for every document
// in this corpus our parser must produce exactly what it produces with the core schema.
const CORPUS = [
  'name: Marta Ruiz',
  'name: Marta Ruiz # comment\n# full-line comment\nrelationship: friend',
  'birthday: 1990-04-12\nyearless: --07-29\nwhen: 2026-10-13T16:00:00Z',
  'lore: "0.1"\nint: 12\nneg: -3\nfloat: 1.5\nexp: 1e3\noct: 0o17\nhex: 0x1F\ninf: .inf\nninf: -.inf',
  'yes: yes\nno: no\non: on\nt: true\nf: False\nn: null\nt2: ~\nempty:',
  'aliases: [Martita, "la Marti", \'Mar\']',
  'aliases:\n  - Martita\n  - la Marti',
  'aliases:\n- Martita\n- la Marti\nnext: 1',
  'dates:\n  - label: Santa Marta\n    date: --07-29\n    kind: name_day\n  - label: Boda\n    date: 2015-06-20\n    recurring: true',
  'links:\n- person: luis-ortega\n  type: partner\n- person: ana\n  type: sibling',
  'sensitivity: {default: private, birthday: public}',
  'sensitivity:\n  default: private\n  birthday: public\n  kin.score: sensitive',
  'nested:\n  a:\n    b:\n      c: deep\n  d: [1, 2, [3, 4]]',
  'flow: {a: [1, 2], b: {c: d}, e: "f, g"}',
  'multi: [a,\n  b,\n  c]',
  'q1: "line\\nbreak \\"quoted\\" \\\\ tab\\t \\x41 \\u00e9 \\U0001F600"',
  "q2: 'it''s single'",
  'q3: "a # not a comment" # comment',
  'url: https://example.org/a#frag\npath: a:b',
  'plain: Let\'s go, it is "fine"',
  'folded: >\n  one\n  two\n\n  three\n',
  'folded_keep: >+\n  one\n  two\n\n\nnext: x',
  'literal: |\n  line 1\n    indented\n  line 3\n',
  'literal_strip: |-\n  a\n  b\n\nnext: 1',
  'literal_ind: |2\n    two extra\n  base\n',
  'multiline_plain: this is\n  a long value\n  over lines',
  'multiline_quoted: "this is\n  quoted over\n  lines"',
  'seq_of_seq:\n  - - a\n    - b\n  - - c',
  'seq_items_null:\n  -\n  - x',
  'seq_nested_map:\n  -\n    a: 1\n    b: 2',
  'empty_seq: []\nempty_map: {}',
  '"quoted key": 1\n\'other key\': 2',
  'kin.export_every_days: 30\ncom.example.app.score: {a: 1}',
  'unicode: Mamá ñandú 日本 😀',
  'trailing: value   \n  # indented comment\nnext: 2',
  '',
  '# only a comment',
];

describe('parseYaml matches the reference parser', () => {
  for (const doc of CORPUS) {
    test(JSON.stringify(doc).slice(0, 70), () => {
      const expected = referenceParse(doc, { schema: 'core', uniqueKeys: true }) ?? {};
      assert.deepEqual(parseYaml(doc), expected);
    });
  }
});

describe('parseYaml rejects what the spec forbids', () => {
  const cases = [
    ['a: &anchor 1\nb: *anchor', /anchors/],
    ['b: *alias', /aliases/],
    ['a: !tag x', /tags/],
    ['<<: {a: 1}', /merge keys/],
    ['%YAML 1.2\n---\na: 1', /directives|document markers/],
    ['a: 1\n---\nb: 2', /document markers/],
    ['? complex\n: key', /complex keys/],
    ['a: 1\na: 2', /duplicate key "a"/],
    ['a: {x: 1, x: 2}', /duplicate key "x"/],
    ['a:\n\tb: 1', /tabs/],
    ['a: 1\n  b: 2', /unexpected|plain scalar/],
    ['a: [1, 2', /flow sequence|expected/],
    ['a: "open', /unclosed/],
    ['a: "\\q"', /unknown escape/],
    ['just text\nkey: value', /plain scalar|unexpected/],
  ];
  for (const [doc, re] of cases) {
    test(JSON.stringify(doc), () => {
      assert.throws(() => parseYaml(doc), (e) => e instanceof YamlError && re.test(e.message));
    });
  }

  test('errors carry line numbers, offset by firstLine', () => {
    assert.throws(() => parseYaml('a: 1\nb: *x', { firstLine: 2 }), /YAML line 3:/);
  });
});

describe('serialization', () => {
  test('plain-safe strings', () => {
    for (const s of ['Marta Ruiz', '1990-04-12', '--07-29', '2w', 'they/them', 'Mamá', "O'Brien", 'https://x.org/a#b', 'a-b']) {
      assert.ok(isPlainSafe(s), s);
    }
    for (const s of ['', ' x', 'x ', '0.1', '12', 'true', 'yes', 'No', 'null', '~', 'a: b', 'a #b', '#x', '- x', '[x]', '{x}', '&a', '*a', '!a', '|', '>', '"x', "'x", '---', 'a\nb', 'x:']) {
      assert.ok(!isPlainSafe(s), JSON.stringify(s));
    }
  });

  test('formats entries in the style of the spec examples', () => {
    assert.deepEqual(formatEntry('aliases', ['Martita']), ['aliases: [Martita]']);
    assert.deepEqual(formatEntry('lore', '0.1'), ['lore: "0.1"']);
    assert.deepEqual(formatEntry('dates', [{ label: 'Santa Marta', date: '--07-29', kind: 'name_day' }]), [
      'dates:',
      '  - label: Santa Marta',
      '    date: --07-29',
      '    kind: name_day',
    ]);
    assert.deepEqual(formatEntry('sensitivity', { default: 'private', birthday: 'public' }), [
      'sensitivity:',
      '  default: private',
      '  birthday: public',
    ]);
    assert.deepEqual(formatEntry('aliases', ['a, b', 'c']), ['aliases:', '  - a, b', '  - c']);
    assert.deepEqual(formatEntry('empty', []), ['empty: []']);
  });

  test('random values survive stringify → parse, and the reference parser agrees', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const pieces = ['a', 'Marta', ' ', ':', '#', '"', "'", '-', '[', ']', '{', '}', ',', '\n', '\t', 'é', '😀', '0', '1', '.', 'yes', 'null', '\\', '%', '@', '&', '*', '!', '|', '>', '?'];
    const str = () => Array.from({ length: Math.floor(rnd() * 6) }, () => pick(pieces)).join('');
    const scalar = () => pick([str, str, str, () => Math.floor(rnd() * 1000) - 500, () => rnd() > 0.5, () => null, () => rnd() * 10])();
    const value = (depth) => {
      if (depth > 2 || rnd() < 0.5) return scalar();
      if (rnd() < 0.5) return Array.from({ length: Math.floor(rnd() * 4) }, () => value(depth + 1));
      const o = {};
      for (let i = 0; i < Math.floor(rnd() * 4); i++) o[`k${i}${pick(['', '.x', ' y'])}`] = value(depth + 1);
      return o;
    };
    for (let i = 0; i < 400; i++) {
      const obj = {};
      for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) obj[`key${k}`] = value(0);
      const text = stringifyYaml(obj);
      assert.deepEqual(parseYaml(text), obj, text);
      assert.deepEqual(referenceParse(text, { schema: 'core' }), obj, text);
    }
  });
});
