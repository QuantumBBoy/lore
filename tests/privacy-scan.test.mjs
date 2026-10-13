// Static privacy guard for everything shipped under skills/. Kin promises zero network access:
// no code that can open a connection, no external resources, and a Content-Security-Policy on
// every page that blocks connections even if such code slips in.

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS = join(ROOT, 'skills');
const CODE_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.svg']);

const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/EventSource/, 'EventSource'],
  [/sendBeacon/, 'navigator.sendBeacon'],
  [/WebTransport/, 'WebTransport'],
  [/RTCPeerConnection/, 'WebRTC'],
  [/\bimport\s*\(\s*["'`](?:[a-z]+:)?\/\//i, 'remote dynamic import'],
  [/\bimport\s[^;]*?from\s*["'`](?:[a-z]+:)?\/\//i, 'remote module import'],
  [/<script[^>]*\ssrc\s*=\s*["']?(?:[a-z]+:)?\/\//i, 'external <script>'],
  [/<link[^>]*\shref\s*=\s*["']?(?:[a-z]+:)?\/\//i, 'external <link>'],
  [/<(?:img|iframe|audio|video|source|embed|object)[^>]*\s(?:src|data)\s*=\s*["']?(?:[a-z]+:)?\/\//i, 'external media or frame'],
  [/url\(\s*["']?(?:[a-z]+:)?\/\//i, 'external CSS url()'],
  [/@import/i, 'CSS @import'],
  [/\.(?:src|href)\s*=\s*["'`](?:[a-z]+:)?\/\//i, 'script-assigned external URL'],
  [/\b(?:eval|Function)\s*\(/, 'eval / Function()'],
];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const files = listFiles(SKILLS).filter((f) => CODE_EXTENSIONS.has(extname(f).toLowerCase()));

describe('privacy scan of skills/', () => {
  test('finds files to scan', () => assert.ok(files.length > 0));

  for (const file of files) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');

    test(`${rel} has no network APIs or external resources`, () => {
      const hits = [];
      src.split('\n').forEach((line, i) => {
        for (const [re, label] of FORBIDDEN) if (re.test(line)) hits.push(`line ${i + 1}: ${label}: ${line.trim()}`);
      });
      assert.deepEqual(hits, []);
    });

    if (/\.html?$/i.test(file)) {
      test(`${rel} has a Content-Security-Policy that blocks connections`, () => {
        const metas = [...src.matchAll(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])(.*?)\1/gi)];
        assert.equal(metas.length, 1, 'exactly one CSP meta tag');
        const head = src.slice(0, src.search(/<script[\s>]/i) === -1 ? src.length : src.search(/<script[\s>]/i));
        assert.ok(head.includes(metas[0][0]), 'the CSP meta tag must come before the first script');
        const directives = Object.fromEntries(
          metas[0][2].split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]),
        );
        assert.deepEqual(directives['default-src'], ["'none'"], "default-src must be 'none'");
        for (const [name, values] of Object.entries(directives)) {
          for (const v of values) {
            assert.ok(!/^(?:https?:|wss?:|data:|blob:|\*|'self')/.test(v) || (name === 'img-src' && /^(?:data:|blob:)$/.test(v)),
              `${name} must not allow ${v}`);
            assert.notEqual(v, "'unsafe-eval'", `${name} must not allow 'unsafe-eval'`);
          }
        }
        assert.ok(!('connect-src' in directives) || directives['connect-src'].join(' ') === "'none'", "connect-src must be 'none'");
      });
    }
  }
});
