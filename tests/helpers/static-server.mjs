// Tiny static file server for browser tests. Serves `root` under `basePath`, with the MIME
// types GitHub Pages uses, so pages load exactly as they do from https://<user>.github.io/lore/.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.zip': 'application/zip',
};

/**
 * @param {string} root directory to serve
 * @param {string} basePath URL prefix, e.g. '/lore/'
 * @returns {Promise<{origin: string, url: (path: string) => string, requests: string[], close: () => Promise<void>}>}
 */
export async function startStaticServer(root, basePath = '/') {
  const requests = [];
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    requests.push(path);
    if (!path.startsWith(basePath)) {
      res.writeHead(404).end();
      return;
    }
    let file = normalize(join(root, path.slice(basePath.length)));
    if (!file.startsWith(normalize(root + sep)) && file !== normalize(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      // Like GitHub Pages: a directory URL serves its index.html.
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    url: (p) => origin + basePath + p.replace(/^\//, ''),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
