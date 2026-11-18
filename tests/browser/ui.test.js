import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

let server;
let browser;
let base;

before(async () => {
  const score = await readFile(new URL('../../src/ui/score-view.js', import.meta.url), 'utf8');
  const controls = await readFile(new URL('../../src/ui/transport-controls.js', import.meta.url), 'utf8');
  const examplePaths = [
    'examples/index.html', 'examples/main.js', 'examples/score.svg', 'src/xml/parse.js',
    'src/core/timeline.js', 'src/media/buffered-audio.js', 'src/diagnostics/logger.js',
    'src/ui/score-view.js', 'src/ui/transport-controls.js'
  ];
  const files = new Map(await Promise.all(examplePaths.map(async (path) =>
    [`/${path}`, await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')])));
  server = createServer((request, response) => {
    if (request.url === '/score.js' || request.url === '/controls.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(request.url === '/score.js' ? score : controls);
    } else if (files.has(request.url)) {
      const type = request.url.endsWith('.html') ? 'text/html' : request.url.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
      response.writeHead(200, { 'Content-Type': type }).end(files.get(request.url));
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><div id="a" style="width: 100px"></div><div id="b"></div>');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true }
    : { channel: 'msedge', headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
});

test('example initializes, seeks by score event, and completes playback', async () => {
  const page = await browser.newPage();
  await page.goto(`${base}examples/index.html`);
  await page.getByRole('button', { name: 'Initialize audio' }).click();
  await page.getByRole('button', { name: 'Play' }).waitFor();
  await page.getByRole('button', { name: 'Seek to score event second' }).click();
  assert.equal(await page.locator('#controls input').inputValue(), '0.5');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.locator('#controls [role=status]').getByText('ended').waitFor();
  assert.equal(await page.locator('#message').textContent(), '');
  await page.close();
});

test('score views scale hit targets, highlight independently, and clean up', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.evaluate(async () => {
    const { createScoreView } = await import('/score.js');
    const image = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"></svg>';
    const score = { url: `data:image/svg+xml,${encodeURIComponent(image)}`, events: [
      { eventRef: 'note', x1: 20, y1: 10, x2: 60, y2: 50 }
    ] };
    window.clicks = [];
    window.firstView = createScoreView({ container: document.querySelector('#a'), page: score, onSeek: (id) => window.clicks.push(id) });
    window.secondView = createScoreView({ container: document.querySelector('#b'), page: score, onSeek: (id) => window.clicks.push(`b:${id}`) });
    window.firstView.highlight(['note']);
  });
  await page.locator('#a img').evaluate((image) => image.decode());
  const box = await page.locator('#a img').boundingBox();
  assert.equal(box.width, 100);
  await page.mouse.click(box.x + 15, box.y + 10);
  await page.locator('#a rect').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.clicks), ['note', 'note']);
  assert.match(await page.locator('#a rect').getAttribute('fill'), /255/);
  assert.equal(await page.locator('#b rect').getAttribute('fill'), 'transparent');
  await page.evaluate(() => window.firstView.dispose());
  assert.equal(await page.locator('#a img').count(), 0);
  assert.equal(await page.locator('#b img').count(), 1);
  await page.close();
});

test('transport controls invoke player commands and remove listeners on disposal', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const { createTransportControls } = await import('/controls.js');
    class Player extends EventTarget {
      state = 'paused'; currentTime = 0; duration = 10;
      async play() { this.state = 'playing'; this.dispatchEvent(new Event('statechange')); }
      pause() { this.state = 'paused'; this.dispatchEvent(new Event('statechange')); }
      seek(seconds) { this.currentTime = seconds; this.dispatchEvent(new Event('positionchange')); }
    }
    const player = new Player();
    const container = document.querySelector('#a');
    const controls = createTransportControls({ container, player });
    container.querySelector('button').click();
    await Promise.resolve();
    const playing = player.state;
    const input = container.querySelector('input');
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    const seek = player.currentTime;
    container.querySelector('button').click();
    const paused = player.state;
    controls.dispose();
    return { playing, seek, paused, children: container.childElementCount };
  });
  assert.deepEqual(result, { playing: 'playing', seek: 3, paused: 'paused', children: 0 });
  await page.close();
});
