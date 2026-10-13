import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { after, describe, test } from 'node:test';
import { bundle } from './build-kin.mjs';

const dir = mkdtempSync(join(tmpdir(), 'lore-bundle-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const write = (files) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
};

describe('build-kin bundler', () => {
  test('wires imports, aliases, re-exports and local exports in dependency order', () => {
    write({
      'ok/b.mjs': "export const base = 40;\nexport function add(x) {\n  return x + base;\n}\nexport class Box {}\n",
      'ok/c.mjs': "import { add as plus } from './b.mjs';\nconst two = plus(-38);\nexport { two, two as deux };\n",
      'ok/a.mjs': "import {\n  base,\n  Box,\n} from './b.mjs';\nimport { two } from './c.mjs';\nexport { add } from './b.mjs';\nexport async function answer() {\n  return base + two;\n}\nexport const isBox = (x) => x instanceof Box;\n",
    });
    const mod = runInNewContext(bundle(join(dir, 'ok/a.mjs')));
    assert.deepEqual(Object.keys(mod).sort(), ['add', 'answer', 'isBox']);
    assert.equal(mod.add(2), 42);
    return mod.answer().then((v) => assert.equal(v, 42));
  });

  test('refuses syntax it cannot bundle', () => {
    const cases = {
      'bad/default.mjs': 'export default 1;\n',
      'bad/star.mjs': "export * from './x.mjs';\n",
      'bad/namespace.mjs': "import * as x from './x.mjs';\n",
      'bad/dynamic.mjs': "const m = import('./x.mjs');\n",
      'bad/meta.mjs': 'const u = import.meta.url;\n',
      'bad/bare.mjs': "import { x } from 'lib';\n",
    };
    write(cases);
    for (const name of Object.keys(cases)) assert.throws(() => bundle(join(dir, name)), /not supported|only relative imports/, name);
  });

  test('comments may mention imports', () => {
    write({ 'ok/comment.mjs': "// an import ('merge') in a comment\n/* export default */\nexport const x = 1;\n" });
    assert.equal(runInNewContext(bundle(join(dir, 'ok/comment.mjs'))).x, 1);
  });

  test('detects import cycles', () => {
    write({ 'cyc/a.mjs': "import { b } from './b.mjs';\nexport const a = 1;\n", 'cyc/b.mjs': "import { a } from './a.mjs';\nexport const b = 2;\n" });
    assert.throws(() => bundle(join(dir, 'cyc/a.mjs')), /import cycle/);
  });
});
