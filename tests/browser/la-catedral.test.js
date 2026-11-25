import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url);
const example = 'examples/la-catedral/';
const hasFixture = existsSync(new URL(`${example}local/audio_files/catedral_vidovic_video.mp4`, root));
const types = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', mp4: 'video/mp4'
};
let server;
let browser;
let base;

/** @param {string} directory @param {Map<string, URL>} files */
async function addDirectory(directory, files) {
  for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) await addDirectory(`${path}/`, files);
    else if (entry.isFile() && types[entry.name.split('.').at(-1)]) files.set(`/${path}`, new URL(path, root));
  }
}

before(async () => {
  if (!hasFixture) return;
  const files = new Map([
    ['/node_modules/mediabunny/dist/bundles/mediabunny.mjs', new URL('node_modules/mediabunny/dist/bundles/mediabunny.mjs', root)]
  ]);
  await Promise.all([addDirectory(example, files), addDirectory('examples/shared/', files), addDirectory('src/', files)]);
  server = createServer(async (request, response) => {
    const url = files.get(request.url);
    if (!url) { response.writeHead(404).end(); return; }
    const { size } = await stat(url);
    response.writeHead(200, {
      'Content-Type': types[url.pathname.split('.').at(-1)], 'Content-Length': size
    });
    const stream = createReadStream(url);
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/${example}index.html`;
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true }
    : { channel: 'msedge', headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

const skip = !hasFixture && 'Prepare the local La Catedral fixture first';

test('real fixture keeps score-event order and all three performance mappings', { skip }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base);
    const data = await page.evaluate(async () => {
      const { loadIEEE1599 } = await import('/src/xml/parse.js');
      const { createTimeline } = await import('/src/core/timeline.js');
      const score = await loadIEEE1599('./local/catedral.xml');
      const ids = score.spine.map(({ id }) => id);
      return {
        titles: [score.metadata.mainTitle, score.metadata.workTitle],
        deltas: score.spine.slice(5, 9).map(({ timing }) => timing),
        pages: score.graphicInstances.map((group) => group.pages[0].events.length),
        times: score.audioTracks.map((track) => createTimeline(ids, track.events).resolve(ids[0]).time),
        counts: score.audioTracks.map((track) => track.events.length)
      };
    });
    assert.deepEqual(data.titles, ['Andante religioso', 'La Catedral']);
    assert.deepEqual(data.deltas, [512, 512, 0, 1024]);
    assert.deepEqual(data.pages, [217, 217]);
    assert.deepEqual(data.times, [0.71, 0, 84.32]);
    assert.deepEqual(data.counts, [217, 220, 220]);
  } finally {
    await page.close();
  }
});

test('real example selects audio/video, seeks from the canvas and follows the score', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.setDefaultTimeout(5000);
  const firstRef = 'Guitar_1_voice0_measure1_ev0';
  try {
    await page.goto(base);
    await page.waitForFunction(() => !document.querySelector('#play').disabled || document.querySelector('#error').textContent);
    assert.equal(await page.locator('#error').textContent(), '');
    await page.waitForFunction(() => document.querySelector('#score').width === 2550);
    const canvas = page.locator('#score');
    const box = await canvas.boundingBox();
    assert.ok(box.width < 2550);
    await canvas.click({ position: { x: 570 * (box.width - 2) / 2550, y: 750 * (box.height - 2) / 3300 } });
    await page.waitForFunction(() => document.querySelector('#time').value === '0.71 s');
    assert.match(await canvas.getAttribute('data-highlighted'), new RegExp(firstRef));
    assert.match(await page.locator('#validation').textContent(), /^Valid IEEE 1599 document: \d+ Spine events, \d+ part\(s\), 1 warning\(s\)\.$/);
    await page.waitForFunction(() => document.querySelector('#event-info').value !== '');
    assert.match(await page.locator('#event-info').textContent(), /^measure 1: D5\b/);
    const pixel = await canvas.evaluate((surface) => Array.from(surface.getContext('2d').getImageData(570, 750, 1, 1).data));
    assert.ok(pixel[0] > pixel[2], 'highlight is drawn in the canvas, not just tracked in state');

    await page.locator('#edition').selectOption('1');
    await page.waitForFunction(() => document.querySelector('#score').width === 1206);
    await page.locator('#performance').selectOption('1');
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'playing');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForFunction(() => document.querySelector('#time').value === '0.00 s');

    await page.locator('#performance').selectOption('2');
    await page.locator('#video').waitFor();
    await page.waitForFunction(() => Number(document.querySelector('#video').dataset.timestamp) >= 84.2);
    assert.equal(await page.locator('#time').textContent(), '84.32 s');
    assert.equal(await page.locator('video, audio').count(), 0);
    const startFrame = Number(await page.locator('#video').getAttribute('data-timestamp'));
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction((start) => Number(document.querySelector('#video').dataset.timestamp) > start + 0.3, startFrame);
    const mediaTime = Number.parseFloat(await page.locator('#time').textContent());
    const frameTime = Number(await page.locator('#video').getAttribute('data-timestamp'));
    assert.ok(Math.abs(mediaTime - frameTime) < 0.20, `clock ${mediaTime}, video ${frameTime}`);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForFunction(() => Number(document.querySelector('#video').dataset.timestamp) === 0);
    assert.equal(await page.locator('#time').textContent(), '0.00 s');
    assert.equal(await page.locator('#error').textContent(), '');
  } finally {
    await page.close();
  }
});

test('rapid selection discards stale loads and an aligned audio group shares one clock', { skip }, async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Play' }).waitFor();
    const select = page.locator('#performance');
    await select.selectOption('2');
    await select.selectOption('1');
    await page.getByRole('button', { name: 'Play' }).click();
    assert.equal(await page.locator('#video').isHidden(), true);
    assert.equal(await page.locator('#error').textContent(), '');
    const result = await page.evaluate(async () => {
      const { openPerformance } = await import('./playback.js');
      const context = new AudioContext();
      const audioURL = './local/audio_files/catedral_mavrudis_1990.mp3';
      const group = await openPerformance({
        context, canvas: document.createElement('canvas'), signal: new AbortController().signal,
        audio: [{ url: audioURL }, { url: audioURL, offset: 1 }]
      });
      try {
        await group.seek(2);
        await group.play();
        const nodes = group.player.active.length;
        group.pause();
        return { nodes, state: group.player.state, time: group.player.currentTime };
      } finally {
        await group.dispose();
        await context.close();
      }
    });
    assert.equal(result.nodes, 2);
    assert.equal(result.state, 'paused');
    assert.ok(result.time >= 2 && result.time < 2.2);
  } finally {
    await page.close();
  }
});
