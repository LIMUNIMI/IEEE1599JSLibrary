import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { startBrowserHarness } from './harness.js';

const example = 'examples/dmite/';
const prefix = `/${example}assets/`;
const params = `<params><instruments><instrument name="Example" track_prefix="sound">
  <angle value="90" track_suffix="right"/><angle value="0" track_suffix="front"/>
  <angle value="180" track_suffix="not-indexed"/>
</instrument></instruments></params>`;
const paths = ['audio_files/Example/sound_front.wav', 'audio_files/Example/sound_right.wav'];
const track = (path, a, b) => `<track file_name="${path}" file_format="audio_wav">
  <track_indexing timing_type="seconds">
    <track_event event_ref="a" start_time="${a}"/><track_event event_ref="b" start_time="${b}"/>
  </track_indexing></track>`;
const pageXML = (page, ref) => `<graphic_instance position_in_group="${page}" file_name="score_files/score-${page}.svg">
  <graphic_event event_ref="${ref}" upper_left_x="10" upper_left_y="10" lower_right_x="60" lower_right_y="40"/>
</graphic_instance>`;
const score = `<ieee1599 version="1.0"><general><description><main_title>Synthetic listening test</main_title></description></general>
  <logic><spine><event id="a"/><event id="b"/></spine></logic>
  <notational><graphic_instance_group>${pageXML(1, 'a')}${pageXML(2, 'b')}</graphic_instance_group></notational>
  <audio>${track(paths[0], 0.3, 0.7)}${track(paths[1], 0.9, 1.35)}</audio>
</ieee1599>`;
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="white"/></svg>';
const videoPath = 'audio_files/Example/sound.mp4';
const videoParams = params.replace('track_prefix="sound"', 'track_prefix="sound" video_suffix=".mp4"');
const videoScore = score.replace('</audio>', `${track(videoPath, 0.4, 0.9).replace('audio_wav', 'video_quicktime')}</audio>`);
const fakeMediabunny = `
export const MP4 = {}, QTFF = {};
export class UrlSource { constructor(url) { this.url = url; } }
export class BlobSource { constructor(blob) { this.blob = blob; } }
class Track {
  type = 'video';
  async getCodedWidth() { return 16; }
  async getCodec() { return 'avc1.42E01E'; }
  async getDecoderConfig() { return { codec: 'avc1.42E01E', codedWidth: 16, codedHeight: 9 }; }
  async canDecode() { return true; }
  async getDurationFromMetadata() { return 2; }
}
export class Input {
  constructor() { this.track = new Track(); }
  async getMimeType() { return 'video/mp4'; }
  async getTracks() { return [this.track]; }
  dispose() {}
}
export class EncodedPacketSink {}
function sample(timestamp) {
  return {
    timestamp, duration: 0.1, displayWidth: 16, displayHeight: 9,
    draw(context) {
      context.fillStyle = timestamp >= 0.4 ? '#ff0000' : '#0000ff';
      context.fillRect(0, 0, 16, 9);
    },
    close() {}
  };
}
export class VideoSampleSink {
  async getSample(position) {
    if (position >= 2) return null;
    return sample(Math.floor(position * 10 + 1e-8) / 10);
  }
  async *samples(position) {
    for (let time = Math.ceil(position * 10 - 1e-8) / 10; time < 2; time = Math.round((time + 0.1) * 10) / 10) {
      yield sample(time);
    }
  }
}`;

/** Two seconds of silent, mono 8 kHz PCM; decoded by the real AudioContext. */
function syntheticWave() {
  const bytes = Buffer.alloc(44 + 32000);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

const assets = new Map([
  ['params.xml', params], ['variationsserieuses.xml', score],
  ['score_files/score-1.svg', image], ['score_files/score-2.svg', image],
  [paths[0], syntheticWave()], [paths[1], syntheticWave()]
]);
let harness;
before(async () => { harness = await startBrowserHarness(); });
after(async () => { await harness.close(); });

test('uses private folder files without fetching them and follows the selected performance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dmite-test-'));
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    for (const [name, body] of assets) {
      const file = join(directory, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, name === 'variationsserieuses.xml'
        ? Buffer.from(`<?xml version="1.0" encoding="ISO-8859-1"?>${score.replace('Synthetic listening test', 'Synthetic Étude')}`, 'latin1')
        : body);
    }
    const sent = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith(prefix)) sent.push(request.url());
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.locator('#assets').setInputFiles(directory);
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    assert.equal(await page.locator('#title').textContent(), 'Synthetic Étude');
    assert.equal(await page.locator('.instrument').count(), 3);
    const left = page.getByRole('group', { name: 'Left' });
    const center = page.getByRole('group', { name: 'Center' });
    assert.equal(await center.getByRole('radio').isChecked(), true);
    const canvas = page.locator('#score');
    await canvas.click({ position: { x: 20, y: 20 } });
    await page.waitForFunction(() => document.querySelector('#time').value === '0.30 / 2.00 s');
    assert.equal(await canvas.getAttribute('data-highlighted'), 'a');
    const pixel = await canvas.evaluate((el) => Array.from(el.getContext('2d').getImageData(20, 20, 1, 1).data));
    assert.ok(pixel[0] > pixel[1], 'score rectangle is visibly highlighted');

    const angle = left.getByRole('slider', { name: 'Angle' });
    assert.equal(await angle.getAttribute('max'), '1');
    await angle.fill('1');
    assert.equal(await angle.getAttribute('aria-valuetext'), '90° (Right)');
    assert.equal(await page.locator('#time').textContent(), '0.30 / 2.00 s');
    await left.getByRole('radio').check();
    await page.waitForFunction(() => document.querySelector('#time').value === '0.90 / 2.00 s');
    await page.getByLabel('Slow down').click();
    assert.equal(await page.getByLabel('Reset playback speed').textContent(), '95%');
    await page.getByLabel('One Note').check();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#play').textContent === 'Pause');
    await page.waitForFunction(() => document.querySelector('#time').value === '1.35 / 2.00 s'
      && document.querySelector('#play').textContent === 'Play' && document.querySelector('#page').value === '1');
    assert.equal(await canvas.getAttribute('data-highlighted'), 'b');
    await page.getByRole('button', { name: 'Rewind' }).click();
    assert.equal(await page.locator('#time').textContent(), '0.00 / 2.00 s');
    assert.equal(await page.locator('#page').inputValue(), '0');
    assert.equal(await page.locator('audio, video').count(), 0);
    assert.deepEqual(sent, []);
    assert.equal(await page.locator('#error').textContent(), '');
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('served assets report a missing recording and allow another angle to recover', async () => {
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.route(`**${prefix}**`, (route) => {
      const name = new URL(route.request().url()).pathname.slice(prefix.length);
      const body = name === paths[0] ? undefined : assets.get(name);
      if (body === undefined) return route.fulfill({ status: 404 });
      const contentType = name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/xml';
      return route.fulfill({ body, contentType });
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.getByRole('button', { name: 'Served assets' }).click();
    await page.waitForFunction(() => document.querySelector('#error').textContent.includes('HTTP 404'));
    assert.match(await page.locator('#error').textContent(), /sound_front\.wav/);
    assert.equal(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled(), true);
    const knob = page.getByRole('group', { name: 'Center' }).locator('.knob svg');
    const box = await knob.boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + box.width * 0.95, box.y + box.height / 2);
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    assert.equal(await page.getByRole('group', { name: 'Center' }).getByRole('slider', { name: 'Angle' })
      .getAttribute('aria-valuetext'), '90° (Right)');
    assert.equal(await page.locator('#error').textContent(), '');
  } finally {
    await page.close();
  }
});

test('keeps three proportional angle knobs side by side as the window resizes', async () => {
  const page = await harness.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(5000);
  try {
    await page.route(`**${prefix}**`, (route) => {
      const name = new URL(route.request().url()).pathname.slice(prefix.length);
      const body = assets.get(name);
      if (body === undefined) return route.fulfill({ status: 404 });
      const contentType = name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/xml';
      return route.fulfill({ body, contentType });
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.getByRole('button', { name: 'Served assets' }).click();
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    const measure = () => page.evaluate(() => {
      const pictures = [...document.querySelectorAll('.picture')].map((element) => element.getBoundingClientRect());
      const knob = document.querySelector('.picture .knob').getBoundingClientRect();
      const fitted = Math.min(pictures[0].height - 2, (pictures[0].width - 2) * 0.75);
      return {
        tops: pictures.map(({ top }) => Math.round(top)),
        widths: pictures.map(({ width }) => Math.round(width)),
        scrolls: document.scrollingElement.scrollHeight > window.innerHeight,
        ratio: knob.width / fitted
      };
    });
    const wide = await measure();
    assert.equal(new Set(wide.tops).size, 1, 'panels share one row');
    assert.ok(Math.max(...wide.widths) - Math.min(...wide.widths) <= 1, 'panels share the width');
    assert.ok(wide.widths.reduce((sum, width) => sum + width) >= 1270, 'panels fill the window');
    assert.equal(wide.scrolls, false);
    assert.ok(Math.abs(wide.ratio - 0.9313) < 0.02, `knob follows the original proportion: ${wide.ratio}`);
    await page.setViewportSize({ width: 900, height: 1000 });
    const tall = await measure();
    assert.equal(new Set(tall.tops).size, 1);
    assert.ok(tall.widths[0] < wide.widths[0]);
    assert.ok(Math.abs(tall.ratio - 0.9313) < 0.02, `knob adapts after resizing: ${tall.ratio}`);

    const angle = page.getByRole('group', { name: 'Left' }).getByRole('slider', { name: 'Angle' });
    await angle.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await angle.getAttribute('aria-valuetext'), '90° (Right)');
  } finally {
    await page.close();
  }
});

test('reads each private MP4 video into a canvas and follows the selected audio Spine clock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dmite-video-test-'));
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    const videoAssets = new Map(assets);
    videoAssets.set('params.xml', videoParams);
    videoAssets.set('variationsserieuses.xml', videoScore);
    videoAssets.set(videoPath, Buffer.from('synthetic container; decoded by the test module'));
    for (const [name, body] of videoAssets) {
      const file = join(directory, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    }
    const sent = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith(prefix)) sent.push(request.url());
    });
    await page.route('https://cdn.jsdelivr.net/npm/mediabunny@1.66.1/dist/bundles/mediabunny.mjs',
      (route) => route.fulfill({ contentType: 'text/javascript', body: fakeMediabunny }));
    await page.addInitScript(() => {
      if (!('VideoDecoder' in window)) Object.defineProperty(window, 'VideoDecoder', { value: function VideoDecoder() {} });
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.locator('#assets').setInputFiles(directory);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.video-feed'))
      .every((canvas) => canvas.dataset.timestamp !== undefined));
    const feeds = page.locator('.video-feed');
    assert.equal(await feeds.count(), 3);
    assert.equal(await page.locator('audio, video').count(), 0);

    await page.locator('#score').click({ position: { x: 20, y: 20 } });
    await page.waitForFunction(() => Number(document.querySelector('.video-feed').dataset.timestamp) >= 0.4);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('#time').value.split(' / ')[0]) >= 0.65);
    await page.waitForFunction(() => Number(document.querySelector('.video-feed').dataset.timestamp) >= 0.7);
    assert.equal(await page.locator('#error').textContent(), '');
    assert.deepEqual(sent, []);
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('reports an unsupported native video codec without interrupting audio playback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dmite-unsupported-video-test-'));
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    const videoAssets = new Map(assets);
    videoAssets.set('params.xml', videoParams);
    videoAssets.set('variationsserieuses.xml', videoScore);
    videoAssets.set(videoPath, Buffer.from('synthetic container'));
    for (const [name, body] of videoAssets) {
      const file = join(directory, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    }
    await page.route('https://cdn.jsdelivr.net/npm/mediabunny@1.66.1/dist/bundles/mediabunny.mjs',
      (route) => route.fulfill({
        contentType: 'text/javascript',
        body: fakeMediabunny.replace('async canDecode() { return true; }', 'async canDecode() { return false; }')
      }));
    await page.addInitScript(() => {
      if (!('VideoDecoder' in window)) Object.defineProperty(window, 'VideoDecoder', { value: function VideoDecoder() {} });
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.locator('#assets').setInputFiles(directory);
    await page.waitForFunction(() => document.querySelector('.video-status').textContent.includes('cannot decode video codec'));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('#time').value.split(' / ')[0]) >= 0.1);
    assert.equal(await page.locator('.video-feed:not([hidden])').count(), 0);
    assert.equal(await page.locator('.knob').first().isVisible(), true);
    assert.equal(await page.locator('audio, video').count(), 0);
    assert.equal(await page.locator('#error').textContent(), '');
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('slow videos stay synchronized across paused, playing and rapid recording changes', async () => {
  const alternateAudio = paths[0].replace('/Example/', '/Alternate/');
  const alternateVideo = videoPath.replace('/Example/', '/Alternate/');
  const videoAssets = new Map(assets);
  videoAssets.set('params.xml', videoParams.replace('</instruments>', `<instrument name="Alternate"
    track_prefix="sound" video_suffix=".mp4"><angle value="0" track_suffix="front"/></instrument></instruments>`));
  videoAssets.set('variationsserieuses.xml', videoScore.replace('</audio>',
    `${track(alternateAudio, 0.3, 0.7)}${track(alternateVideo, 0.6, 1.1).replace('audio_wav', 'video_quicktime')}</audio>`));
  videoAssets.set(alternateAudio, assets.get(paths[0]));
  const slowMediabunny = fakeMediabunny
    .replace('  async getSample(position) {', `  async getSample(position) {
    (window.videoSeeks ??= []).push(position);
    await new Promise((resolve) => setTimeout(resolve, 650));`)
    .replace('      yield sample(time);', `      await new Promise((resolve) => setTimeout(resolve, 120));
      yield sample(time);`);
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(10000);
  try {
    await page.route(`**${prefix}**`, async (route) => {
      const name = new URL(route.request().url()).pathname.slice(prefix.length);
      if (name === paths[1]) await new Promise((resolve) => setTimeout(resolve, 200));
      const body = videoAssets.get(name);
      if (body === undefined) return route.fulfill({ status: 404 });
      const contentType = name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/xml';
      return route.fulfill({ body, contentType });
    });
    await page.route('https://cdn.jsdelivr.net/npm/mediabunny@1.66.1/dist/bundles/mediabunny.mjs',
      (route) => route.fulfill({ contentType: 'text/javascript', body: slowMediabunny }));
    await page.addInitScript(() => {
      if (!('VideoDecoder' in window)) Object.defineProperty(window, 'VideoDecoder', { value: function VideoDecoder() {} });
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.locator('#served').click();
    await page.waitForFunction(() => !document.querySelector('#play').disabled
      && [...document.querySelectorAll('.video-feed')].every((canvas) => !canvas.hidden));
    await page.locator('#position').fill('0.5');
    await page.waitForFunction(() => [...document.querySelectorAll('.video-feed')]
      .every((canvas) => Math.abs(Number(canvas.dataset.timestamp) - 0.6) < 0.01));

    const left = page.getByRole('group', { name: 'Left' });
    await left.locator('.instrument-select').selectOption({ label: 'Alternate' });
    await page.waitForFunction(() => !document.querySelector('.video-feed').hidden
      && Math.abs(Number(document.querySelector('.video-feed').dataset.timestamp) - 0.8) < 0.01);
    await page.evaluate(() => { window.videoSeeks = []; });
    await page.getByRole('group', { name: 'Center' }).getByRole('slider', { name: 'Angle' }).fill('1');
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    assert.equal(await page.locator('#time').textContent(), '0.90 / 2.00 s');
    assert.equal(await page.locator('#play').textContent(), 'Play');
    assert.ok((await page.evaluate(() => window.videoSeeks)).every((position) => position > 0),
      'loading a replacement recording must not rewind existing videos to zero');

    await page.locator('#play').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#time').textContent(), '0.90 / 2.00 s',
      'audio waits for slow video seeks before starting');
    await page.waitForFunction(() => Number(document.querySelector('#time').value.split(' / ')[0]) >= 1);
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Buffering video…');
    await page.locator('#play').click();
    const pausedTime = await page.locator('#time').textContent();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#time').textContent(), pausedTime);
    assert.equal(await page.locator('#play').textContent(), 'Play',
      'pausing during rebuffering must cancel automatic resume');
    await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector('#play').textContent === 'Pause');
    const lead = await page.evaluate(async () => {
      let maximum = 0;
      for (let i = 0; i < 50; i++) {
        const seconds = Number(document.querySelector('#time').value.split(' / ')[0]);
        const anchor = seconds >= 1.35 ? 1.35 : 0.9;
        const videoAnchor = seconds >= 1.35 ? 0.9 : 0.4;
        const feeds = [...document.querySelectorAll('.video-feed')];
        feeds.forEach((canvas, index) => {
          const expected = videoAnchor + (index === 0 ? 0.2 : 0) + seconds - anchor;
          maximum = Math.max(maximum, expected - Number(canvas.dataset.timestamp));
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return maximum;
    });
    assert.ok(lead < 0.25, `audio must not outrun the three video decoders: ${lead.toFixed(3)} s`);
    await page.waitForFunction(() => document.querySelector('#time').value === '2.00 / 2.00 s'
      && document.querySelector('#play').textContent === 'Play');
    await page.waitForFunction(() => [...document.querySelectorAll('.video-feed')]
      .every((canvas, index) => Math.abs(Number(canvas.dataset.timestamp) - (index === 0 ? 1.7 : 1.5)) < 0.01));

    await page.locator('#rewind').click();
    await page.waitForFunction(() => document.querySelector('#time').value === '0.00 / 2.00 s');
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#time').value.split(' / ')[0]) >= 0.35);
    const center = page.getByRole('group', { name: 'Center' });
    await center.locator('.instrument-select').selectOption({ label: 'Alternate' });
    await page.waitForFunction(() => !document.querySelector('#play').disabled
      && !document.querySelectorAll('.video-feed')[1].hidden);
    const switchedTime = Number((await page.locator('#time').textContent()).split(' / ')[0]);
    const switchedFrame = Number(await center.locator('.video-feed').getAttribute('data-timestamp'));
    await page.waitForFunction((previous) => Number(document.querySelector('#time').value.split(' / ')[0]) > previous + 0.2,
      switchedTime);
    await page.waitForFunction((previous) => Number(document.querySelectorAll('.video-feed')[1].dataset.timestamp) > previous + 0.1,
      switchedFrame);

    await center.locator('.instrument-select').selectOption({ label: 'Example' });
    await center.getByRole('slider', { name: 'Angle' }).fill('1');
    await page.waitForFunction(() => !document.querySelector('#play').disabled
      && !document.querySelectorAll('.video-feed')[1].hidden);
    assert.equal(await center.getByRole('slider', { name: 'Angle' }).inputValue(), '1');
    const resumedTime = Number((await page.locator('#time').textContent()).split(' / ')[0]);
    await page.waitForFunction((previous) => {
      const seconds = Number(document.querySelector('#time').value.split(' / ')[0]);
      return seconds > previous || (seconds === 2 && document.querySelector('#play').textContent === 'Play');
    }, resumedTime);
    assert.equal(await page.locator('#error').textContent(), '');
  } finally {
    await page.close();
  }
});

test('superseded video primes cannot dispose or draw over a newer instrument feed', async () => {
  const alternateAudio = paths[0].replace('/Example/', '/Alternate/');
  const alternateVideo = videoPath.replace('/Example/', '/Alternate/');
  const videoAssets = new Map(assets);
  videoAssets.set('params.xml', videoParams.replace('</instruments>', `<instrument name="Alternate"
    track_prefix="sound" video_suffix=".mp4"><angle value="0" track_suffix="front"/></instrument></instruments>`));
  videoAssets.set('variationsserieuses.xml', videoScore.replace('</audio>',
    `${track(alternateAudio, 0.3, 0.7)}${track(alternateVideo, 0.4, 0.9).replace('audio_wav', 'video_quicktime')}</audio>`));
  videoAssets.set(alternateAudio, assets.get(paths[0]));
  const delayedMediabunny = fakeMediabunny
    .replace('constructor() { this.track = new Track(); }', `constructor({ source }) {
      this.track = new Track();
      this.track.first = source.url.includes('/Example/');
    }`)
    .replace('  async getSample(position) {', `  constructor(track) { this.track = track; }
  async getSample(position) {
    if (this.track.first) return new Promise((resolve, reject) => {
      const oldFrame = sample(position);
      const draw = oldFrame.draw;
      oldFrame.draw = (context) => {
        window.staleVideoDraws = (window.staleVideoDraws ?? 0) + 1;
        draw(context);
      };
      (window.oldVideoPrimes ??= []).push({ resolve: () => resolve(oldFrame), reject });
    });`);
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.route(`**${prefix}**`, (route) => {
      const name = new URL(route.request().url()).pathname.slice(prefix.length);
      const body = videoAssets.get(name);
      if (body === undefined) return route.fulfill({ status: 404 });
      const contentType = name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/xml';
      return route.fulfill({ body, contentType });
    });
    await page.route('https://cdn.jsdelivr.net/npm/mediabunny@1.66.1/dist/bundles/mediabunny.mjs',
      (route) => route.fulfill({ contentType: 'text/javascript', body: delayedMediabunny }));
    await page.addInitScript(() => {
      if (!('VideoDecoder' in window)) Object.defineProperty(window, 'VideoDecoder', { value: function VideoDecoder() {} });
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.getByRole('button', { name: 'Served assets' }).click();
    await page.waitForFunction(() => window.oldVideoPrimes?.length === 3);
    const center = page.getByRole('group', { name: 'Center' });
    const instrument = center.locator('.instrument-select');
    await instrument.selectOption({ label: 'Alternate' });
    const feed = center.locator('.video-feed');
    await feed.waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      for (const { reject } of window.oldVideoPrimes.splice(0)) reject(new Error('Superseded video prime'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(await feed.isVisible(), true);
    await page.locator('#score').click({ position: { x: 20, y: 20 } });
    await page.waitForFunction(() => Number(document.querySelectorAll('.video-feed')[1].dataset.timestamp) >= 0.4);
    assert.equal(await center.locator('.video-status').isVisible(), false);

    await instrument.selectOption({ label: 'Example' });
    await page.waitForFunction(() => window.oldVideoPrimes.length === 1);
    await instrument.selectOption({ label: 'Alternate' });
    await feed.waitFor({ state: 'visible' });
    const staleDraws = await page.evaluate(async () => {
      window.oldVideoPrimes.pop().resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return window.staleVideoDraws ?? 0;
    });
    assert.equal(staleDraws, 0);
  } finally {
    await page.close();
  }
});
