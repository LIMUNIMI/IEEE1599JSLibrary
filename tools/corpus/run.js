/**
 * Run the library against a local corpus of IEEE 1599 documents.
 *
 * Usage: `pnpm run test:corpus [-- --root <folder>] [--out <folder>]
 * [--filter <substring>] [--concurrency <n>] [--no-audio] [--no-video]`.
 *
 * Every `*.xml` file whose root element is `ieee1599` is loaded in a real
 * browser (Edge by default, or `BROWSER=chromium|firefox|webkit`). Only files
 * referenced by `file_name` are fetched. The corpus is served read-only from
 * localhost with HTTP range support; nothing is copied or uploaded. Reports
 * name private files and are written to the git-ignored `corpus-report/`.
 * @module tools/corpus/run
 */
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launchTestBrowser } from '../../tests/browser/harness.js';
import { summarize } from './summary.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({
  options: {
    root: { type: 'string', default: join(repository, 'examples', 'assets') },
    out: { type: 'string', default: join(repository, 'corpus-report') },
    filter: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    timeout: { type: 'string', default: '600' },
    'no-audio': { type: 'boolean', default: false },
    'no-video': { type: 'boolean', default: false }
  }
});
const corpus = resolve(values.root);
const concurrency = Math.max(1, Number(values.concurrency) || 1);
const timeoutMs = Math.max(30, Number(values.timeout) || 600) * 1000;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.xml': 'application/xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv',
  '.mid': 'audio/midi', '.midi': 'audio/midi', '.pdf': 'application/pdf'
};

/**
 * Find IEEE 1599 documents by sniffing the root element, skipping macOS
 * resource forks and other non-IEEE 1599 XML.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function discover(directory) {
  /** @type {string[]} */
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await discover(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.xml' && await isIEEE1599(path)) found.push(path);
  }
  return found;
}

/** @param {string} path */
async function isIEEE1599(path) {
  const handle = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(8192), 0, 8192, 0);
    const head = buffer.subarray(0, bytesRead);
    const text = head[0] === 0xff || head[0] === 0xfe ? head.toString('utf16le') : head.toString('latin1');
    return /<ieee1599[\s>/]/.test(text);
  } finally {
    await handle.close();
  }
}

/** @type {Map<string, Promise<string[]>>} */
const listings = new Map();
/**
 * Find the on-disk spelling of a path under the corpus, so references that
 * only work on case-insensitive filesystems can be reported.
 * @param {string} relativePath Slash-separated path below the corpus root.
 * @returns {Promise<string | null>} Actual path, or null when it matches exactly.
 */
async function actualCase(relativePath) {
  const parts = relativePath.split('/').filter(Boolean);
  let directory = corpus;
  const actual = [];
  let mismatch = false;
  for (const part of parts) {
    if (!listings.has(directory)) listings.set(directory, readdir(directory).catch(() => []));
    const names = await /** @type {Promise<string[]>} */ (listings.get(directory));
    const exact = names.includes(part);
    const name = exact ? part : names.find((candidate) => candidate.toLowerCase() === part.toLowerCase());
    if (!name) return null;
    mismatch ||= !exact;
    actual.push(name);
    directory = join(directory, name);
  }
  return mismatch ? actual.join('/') : null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  /** @type {string | null} */
  let file = null;
  if (path.startsWith('/corpus/')) {
    file = resolve(corpus, '.' + path.slice('/corpus'.length));
    if (file !== corpus && !file.startsWith(corpus + sep)) file = null;
  } else if (/^\/(?:src|tools\/corpus|node_modules\/mediabunny\/dist)\//.test(path) && !path.includes('..')) {
    file = join(repository, path);
  }
  if (!file) {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>corpus</title>');
    return;
  }
  let info;
  try {
    info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
  } catch {
    response.writeHead(404).end();
    return;
  }
  /** @type {Record<string, string | number>} */
  const headers = {
    'Content-Type': TYPES[/** @type {keyof typeof TYPES} */ (extname(file).toLowerCase())] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'
  };
  if (path.startsWith('/corpus/')) {
    const actual = await actualCase(path.slice('/corpus/'.length));
    if (actual) headers['X-Case-Mismatch'] = actual;
    headers['Access-Control-Expose-Headers'] = 'X-Case-Mismatch, Content-Range';
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  let start = 0;
  let end = info.size - 1;
  if (range && info.size > 0) {
    start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
  } else {
    response.writeHead(200, { ...headers, 'Content-Length': info.size });
  }
  if (request.method === 'HEAD' || info.size === 0) {
    response.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  response.on('close', () => stream.destroy());
  stream.pipe(response);
});

/**
 * Suggest same-named files under the document's top-level corpus folder for
 * missing references. Suggestions are hints for curators; they are never used.
 * @param {string} documentPath
 * @param {string} reference
 * @returns {Promise<string[]>}
 */
async function candidates(documentPath, reference) {
  const top = relative(corpus, documentPath).split(sep);
  const scope = top.length > 1 ? join(corpus, top[0]) : dirname(documentPath);
  const wanted = basename(reference.replace(/\\/g, '/')).toLowerCase();
  if (!wanted) return [];
  const index = await fileIndex(scope);
  return (index.get(wanted) ?? []).slice(0, 3).map((path) => relative(dirname(documentPath), path).split(sep).join('/'));
}

/** @type {Map<string, Promise<Map<string, string[]>>>} */
const indexes = new Map();
/** @param {string} scope */
function fileIndex(scope) {
  if (!indexes.has(scope)) {
    indexes.set(scope, (async () => {
      /** @type {Map<string, string[]>} */
      const index = new Map();
      /** @param {string} directory */
      const walk = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await walk(path);
          else index.set(entry.name.toLowerCase(), [...(index.get(entry.name.toLowerCase()) ?? []), path]);
        }
      };
      await walk(scope);
      return index;
    })());
  }
  return /** @type {Promise<Map<string, string[]>>} */ (indexes.get(scope));
}

let documents = await discover(corpus);
if (values.filter) documents = documents.filter((path) => relative(corpus, path).split(sep).join('/').includes(/** @type {string} */ (values.filter)));
documents.sort();
console.info(`Found ${documents.length} IEEE 1599 documents under ${corpus}`);

await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
const address = /** @type {import('node:net').AddressInfo} */ (server.address());
const base = `http://127.0.0.1:${address.port}/`;
const browser = await launchTestBrowser();
const browserName = `${process.env.BROWSER ?? 'msedge'} ${browser.version()}`;
/** @type {any[]} */
const reports = [];
let next = 0;
const started = Date.now();

async function worker() {
  while (next < documents.length) {
    const path = documents[next++];
    const name = relative(corpus, path).split(sep).join('/');
    const url = new URL(`corpus/${name.split('/').map(encodeURIComponent).join('/')}`, base).href;
    const page = await browser.newPage();
    /** @type {any} */
    let report;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    try {
      await page.goto(base);
      report = await Promise.race([
        page.evaluate(async ({ url, options }) => {
          const { checkDocument } = await import('/tools/corpus/check.js');
          return checkDocument(url, options);
        }, { url, options: { decodeAudio: !values['no-audio'], decodeVideo: !values['no-video'] } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000} s`)), timeoutMs); })
      ]);
    } catch (error) {
      report = { url, strictValid: false, validationErrors: 0, projected: false, media: [],
        findings: [{ severity: 'error', code: 'runner-failed', message: error instanceof Error ? error.message.split('\n')[0] : String(error) }] };
    } finally {
      clearTimeout(timer);
      await page.close().catch(() => {});
    }
    report.document = name;
    for (const finding of report.findings) {
      if (finding.code === 'missing-file' && finding.reference) finding.candidates = await candidates(path, finding.reference);
    }
    reports.push(report);
    const errors = report.findings.filter((/** @type {any} */ finding) => finding.severity === 'error').length;
    console.info(`[${reports.length}/${documents.length}] ${errors ? `${errors} error(s)` : 'ok'}  ${name}`);
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(concurrency, documents.length) }, worker));
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
reports.sort((a, b) => a.document.localeCompare(b.document));
const result = { generated: new Date().toISOString(), browser: browserName, root: corpus, elapsedSeconds: Math.round((Date.now() - started) / 1000), documents: reports };
await mkdir(values.out, { recursive: true });
await writeFile(join(values.out, 'report.json'), JSON.stringify(result, null, 2));
await writeFile(join(values.out, 'report.md'), summarize(result));
console.info(`Report written to ${join(values.out, 'report.md')}`);
const runnerFailures = reports.filter((report) => report.findings.some((/** @type {any} */ finding) => finding.code === 'runner-failed' || finding.code === 'round-trip'));
process.exitCode = runnerFailures.length ? 1 : 0;
