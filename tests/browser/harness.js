import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url);
const allowed = ['src/', 'examples/', 'tests/fixtures/', 'schema/', 'node_modules/mediabunny/dist/'];
const types = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', xml: 'application/xml', dtd: 'application/xml-dtd',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav'
};

/**
 * Start a static server for the repository's browser-facing files and launch
 * the test browser (installed Edge, or BROWSER_EXECUTABLE_PATH).
 * Any other path, including `/`, returns `blankPage`.
 * @param {{blankPage?: string}} [options]
 */
export async function startBrowserHarness({ blankPage = '<!doctype html>' } = {}) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).slice(1);
    const extension = path.split('.').at(-1) ?? '';
    if (!path.includes('..') && allowed.some((prefix) => path.startsWith(prefix)) && types[extension]) {
      const url = new URL(path, root);
      try {
        const { size } = await stat(url);
        response.writeHead(200, { 'Content-Type': types[extension], 'Content-Length': size });
        const stream = createReadStream(url);
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      } catch {
        response.writeHead(404).end();
      }
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(blankPage);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true }
    : { channel: 'msedge', headless: true });
  return {
    base,
    browser,
    async close() {
      await browser.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
