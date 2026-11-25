/**
 * Minimal, dependency-free static file server for trying the library and
 * examples locally: `pnpm run serve [-- --port 8000] [-- --root path]`.
 * It binds to 127.0.0.1 only, so local materials are never exposed to the
 * network, and it supports byte ranges for large media files.
 * @module tools/serve
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Content types for files a web player commonly serves. */
export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml', '.dtd': 'application/xml-dtd', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.mp4': 'video/mp4',
  '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.pdf': 'application/pdf'
};

/**
 * Parse a single `bytes=` range against a file size.
 * @param {string | undefined} header `Range` request header.
 * @param {number} size File size in bytes.
 * @returns {{start: number, end: number} | null | 'invalid'} Inclusive range,
 *   `null` for the whole file, or `'invalid'` when it cannot be satisfied.
 */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return 'invalid';
  let start = match[1] ? Number(match[1]) : size - Number(match[2]);
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  start = Math.max(start, 0);
  end = Math.min(end, size - 1);
  return start > end || start >= size ? 'invalid' : { start, end };
}

/**
 * Start serving a directory on 127.0.0.1. Directory URLs serve `index.html`.
 * @param {{root?: string, port?: number}} [options] `root` defaults to the
 *   repository checkout; `port` `0` picks a free port.
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
export async function startStaticServer({ root = fileURLToPath(new URL('../', import.meta.url)), port = 8000 } = {}) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(base, `.${path}`);
      if (file !== base && !file.startsWith(base + sep)) return response.writeHead(403).end();
      const info = await stat(file);
      if (info.isDirectory()) return response.writeHead(301, { Location: `${path}/` }).end();
      const range = parseRange(request.headers.range, info.size);
      const headers = { 'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      if (range === 'invalid') return response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      const { start, end } = range ?? { start: 0, end: info.size - 1 };
      response.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': Math.max(end - start + 1, 0),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}) });
      if (request.method === 'HEAD' || info.size === 0) return response.end();
      const stream = createReadStream(file, { start, end });
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => done(undefined));
  });
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://127.0.0.1:${actual}/`,
    close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done()))
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const { url } = await startStaticServer({ root: option('root'), port: Number(option('port') ?? 8000) });
  console.log(`Serving on ${url} (Ctrl+C to stop)`);
  console.log(`  Minimal player:         ${url}examples/`);
  console.log(`  Starter player:         ${url}examples/starter/`);
}
