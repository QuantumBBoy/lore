import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { galleryParse, validateSkillDir, validateSkillMd, validateSkillsRoot } from './validate-skills.mjs';

const GOOD = `---
name: my-skill
description: Does one useful thing when the user asks for it.
metadata:
  homepage: https://example.org/my-skill
  require-secret: false
---

# My skill

Call the \`run_js\` tool with:
- script name: index.html
- data: a JSON string with field text.
`;

const errorsOf = (md, folder = 'my-skill') => validateSkillMd(md, folder).errors;
const expectError = (md, pattern, folder) => {
  const errors = errorsOf(md, folder);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got:\n${errors.join('\n')}`);
};
const withFront = (front, body = '\nInstructions.\n') => `---\n${front}\n---\n${body}`;

describe('galleryParse (port of the app parser)', () => {
  test('reads name, description, metadata and instructions', () => {
    const { skill, errors } = galleryParse(GOOD);
    assert.deepEqual(errors, []);
    assert.equal(skill.name, 'my-skill');
    assert.equal(skill.description, 'Does one useful thing when the user asks for it.');
    assert.equal(skill.homepage, 'https://example.org/my-skill');
    assert.equal(skill.requireSecret, false);
    assert.match(skill.instructions, /^# My skill/);
  });

  test('keeps quotes, like the app does', () => {
    assert.equal(galleryParse('---\nname: "x"\ndescription: d\n---\nb').skill.name, '"x"');
  });

  test('a --- inside the description truncates it, like the app does', () => {
    const { skill } = galleryParse('---\nname: x\ndescription: before --- after\n---\nbody');
    assert.equal(skill.description, 'before');
  });

  test('ignores name after metadata', () => {
    const { errors } = galleryParse('---\ndescription: d\nmetadata:\n  name: x\n---\nb');
    assert.deepEqual(errors, ["Missing or empty 'name' in the header."]);
  });

  test('needs two separators', () => {
    assert.equal(galleryParse('name: x\ndescription: y').errors.length, 1);
  });

  test('re-joins --- in the body', () => {
    assert.equal(galleryParse('---\nname: x\ndescription: y\n---\na\n---\nb').skill.instructions, 'a\n---\nb');
  });
});

describe('validateSkillMd', () => {
  test('accepts a well-formed SKILL.md', () => {
    const r = validateSkillMd(GOOD, 'my-skill');
    assert.deepEqual(r.errors, []);
    assert.equal(r.skill.name, 'my-skill');
  });

  test('accepts bytes and rejects invalid UTF-8', () => {
    assert.deepEqual(validateSkillMd(new TextEncoder().encode(GOOD), 'my-skill').errors, []);
    expectError(new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe]), /not valid UTF-8/);
  });

  test('rejects a BOM', () => expectError('﻿' + GOOD, /byte order mark/));
  test('rejects CRLF', () => expectError(GOOD.replaceAll('\n', '\r\n'), /CR characters/));
  test('rejects text before the frontmatter', () => expectError('# Title\n' + GOOD, /first line must be exactly '---'/));
  test('rejects leading blank line', () => expectError('\n' + GOOD, /first line/));
  test('rejects an unclosed frontmatter', () => expectError('---\nname: my-skill\ndescription: abc\n', /not closed/));
  test('rejects a closing line with trailing spaces', () =>
    expectError('---\nname: my-skill\ndescription: Something long enough here.\n--- \nbody', /not closed/));

  test('rejects missing or empty name and description', () => {
    expectError(withFront('description: Something long enough here.'), /Missing 'name'/);
    expectError(withFront('name: my-skill'), /Missing 'description'/);
    expectError(withFront('name:\ndescription: Something long enough here.'), /'name' is empty/);
    expectError(withFront('name: my-skill\ndescription:'), /'description' is empty/);
  });

  test('requires kebab-case names that match the folder', () => {
    expectError(withFront('name: My-Skill\ndescription: Something long enough here.'), /kebab-case/, 'My-Skill');
    expectError(withFront('name: my_skill\ndescription: Something long enough here.'), /kebab-case/, 'my_skill');
    expectError(withFront('name: my--skill\ndescription: Something long enough here.'), /kebab-case/, 'my--skill');
    expectError(withFront('name: -my-skill\ndescription: Something long enough here.'), /kebab-case/, '-my-skill');
    expectError(withFront('name: other-skill\ndescription: Something long enough here.'), /must match the folder/);
    expectError(withFront(`name: ${'a'.repeat(65)}\ndescription: Something long enough here.`), /longer than 64/, 'a'.repeat(65));
  });

  test('rejects quoted values', () => {
    expectError(withFront('name: "my-skill"\ndescription: Something long enough here.'), /quoted/);
    expectError(withFront("name: my-skill\ndescription: 'Something long enough here.'"), /quoted/);
  });

  test('rejects multi-line YAML', () => {
    expectError(withFront('name: my-skill\ndescription: >\n  folded text'), /block scalar/);
    expectError(withFront('name: my-skill\ndescription: |\n  literal text'), /block scalar/);
  });

  test('rejects values YAML would not read as the same string', () => {
    expectError(withFront('name: my-skill\ndescription: Use it: now please'), /": "/);
    expectError(withFront('name: my-skill\ndescription: Something useful #tag'), /" #"/);
    expectError(withFront('name: my-skill\ndescription: [a, b]'), /indicator/);
    expectError(withFront('name: true\ndescription: Something long enough here.'), /YAML keyword/, 'true');
  });

  test("rejects '---' inside the frontmatter", () =>
    expectError(withFront('name: my-skill\ndescription: Before --- after, long enough.'), /contains '---'/));

  test('rejects name or description after metadata', () =>
    expectError(withFront('name: my-skill\nmetadata:\n  homepage: https://x.org\ndescription: Something long enough here.'), /after 'metadata:'/));

  test('rejects duplicate, unknown and malformed keys', () => {
    expectError(withFront('name: my-skill\nname: my-skill\ndescription: Something long enough here.'), /duplicate key/);
    expectError(withFront('name: my-skill\ndescription: Something long enough here.\nversion: 1'), /unknown key 'version'/);
    expectError(withFront('name: my-skill\ndescription: Something long enough here.\nmetadata:\n  color: red'), /unknown metadata key/);
    expectError(withFront('name:my-skill\ndescription: Something long enough here.'), /expected 'key: value'/);
    expectError(withFront('  name: my-skill\ndescription: Something long enough here.'), /expected 'key: value'/);
    expectError(withFront('name: my-skill\ndescription: Something long enough here.\nmetadata:\n    homepage: https://x.org'), /expected 'key: value'/);
  });

  test('rejects tabs, comments and trailing whitespace', () => {
    expectError(withFront('name:\tmy-skill\ndescription: Something long enough here.'), /tab/);
    expectError(withFront('# comment\nname: my-skill\ndescription: Something long enough here.'), /comments/);
    expectError(withFront('name: my-skill \ndescription: Something long enough here.'), /trailing whitespace/);
  });

  test('checks metadata values', () => {
    expectError(withFront('name: my-skill\ndescription: Something long enough here.\nmetadata:\n  require-secret: yes'), /true or false/);
    expectError(withFront('name: my-skill\ndescription: Something long enough here.\nmetadata:\n  homepage: http://x.org'), /https/);
    expectError(withFront('name: my-skill\ndescription: Something long enough here.\nmetadata:'), /empty/);
  });

  test('rejects an empty body and oversized files', () => {
    expectError('---\nname: my-skill\ndescription: Something long enough here.\n---\n\n', /no instructions/);
    expectError(GOOD + 'x'.repeat(9000), /bytes; the limit/);
  });

  test('warns about very short descriptions', () => {
    const r = validateSkillMd(withFront('name: my-skill\ndescription: Short.'), 'my-skill');
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 1);
  });
});

describe('validateSkillDir and validateSkillsRoot', () => {
  const root = mkdtempSync(join(tmpdir(), 'lore-skills-'));
  after(() => rmSync(root, { recursive: true, force: true }));

  const makeSkill = (folder, files) => {
    const dir = join(root, folder);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return dir;
  };
  const runner = '<script>window.ai_edge_gallery_get_result = async () => "{}"; const r = { url: `view.html?x=1` };</script>';

  test('accepts a JS skill with its webview asset', () => {
    const dir = makeSkill('my-skill', { 'SKILL.md': GOOD, 'scripts/index.html': runner, 'assets/view.html': '<p>hi</p>' });
    assert.deepEqual(validateSkillDir(dir, 'my-skill').errors, []);
  });

  test('finds the entry function in a local .js file loaded by the page', () => {
    const dir = makeSkill('split-js', {
      'SKILL.md': GOOD.replace('my-skill', 'split-js'),
      'scripts/index.html': '<script src="index.js"></script>',
      'scripts/index.js': 'window.ai_edge_gallery_get_result = async () => "{}";',
    });
    assert.deepEqual(validateSkillDir(dir, 'split-js').errors, []);
  });

  test('requires the script, the entry function and the webview asset', () => {
    const missingScript = makeSkill('missing-script', { 'SKILL.md': GOOD.replace('my-skill', 'missing-script'), 'scripts/other.html': '' });
    assert.ok(validateSkillDir(missingScript, 'missing-script').errors.some((e) => /scripts\/index.html does not exist/.test(e)));

    const noEntry = makeSkill('no-entry', { 'SKILL.md': GOOD.replace('my-skill', 'no-entry'), 'scripts/index.html': '<p></p>' });
    assert.ok(validateSkillDir(noEntry, 'no-entry').errors.some((e) => /never defines/.test(e)));

    const noAsset = makeSkill('no-asset', { 'SKILL.md': GOOD.replace('my-skill', 'no-asset'), 'scripts/index.html': runner });
    assert.ok(validateSkillDir(noAsset, 'no-asset').errors.some((e) => /assets\/view.html does not exist/.test(e)));
  });

  test('checks run_js against the scripts folder', () => {
    const textOnly = GOOD.replace('my-skill', 'text-only').replace(/Call the[\s\S]*$/, 'Be helpful.\n');
    const withScripts = makeSkill('text-only', { 'SKILL.md': textOnly, 'scripts/index.html': runner });
    assert.ok(validateSkillDir(withScripts, 'text-only').errors.some((e) => /never tell the model to call run_js/.test(e)));
    const noScripts = makeSkill('no-scripts', { 'SKILL.md': GOOD.replace('my-skill', 'no-scripts') });
    assert.ok(validateSkillDir(noScripts, 'no-scripts').errors.some((e) => /no 'scripts\/' folder/.test(e)));
  });

  test('rejects wrong file names and stray entries', () => {
    const lower = makeSkill('lower-case', { 'skill.md': GOOD.replace('my-skill', 'lower-case') });
    assert.ok(validateSkillDir(lower, 'lower-case').errors.some((e) => /exactly 'SKILL.md'/.test(e)));
    const stray = makeSkill('stray-file', {
      'SKILL.md': GOOD.replace('my-skill', 'stray-file'),
      'scripts/index.html': runner,
      'assets/view.html': '',
      'assets/my file.png': '',
      'notes.txt': '',
    });
    const errors = validateSkillDir(stray, 'stray-file').errors;
    assert.ok(errors.some((e) => /Unexpected entry 'notes.txt'/.test(e)));
    assert.ok(errors.some((e) => /my file.png/.test(e)));
  });

  test('validateSkillsRoot flags stray files and bad folders', () => {
    writeFileSync(join(root, 'README.md'), '');
    const results = validateSkillsRoot(root);
    assert.ok(results.find((r) => r.folder === 'README.md').errors.length > 0);
    assert.deepEqual(results.find((r) => r.folder === 'my-skill').errors, []);
  });
});
