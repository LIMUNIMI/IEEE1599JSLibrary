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
      await writeFile(file, body);
    }
    const sent = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith(prefix)) sent.push(request.url());
    });
    await page.goto(new URL(`${example}index.html`, harness.base).href);
    await page.locator('#assets').setInputFiles(directory);
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    assert.equal(await page.locator('#title').textContent(), 'Synthetic listening test');
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

    assert.equal(await left.getByLabel('Angle').locator('option').count(), 2);
    await left.getByLabel('Angle').selectOption({ label: '90° (Right)' });
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
    await page.getByRole('button', { name: 'Load served assets' }).click();
    await page.waitForFunction(() => document.querySelector('#error').textContent.includes('HTTP 404'));
    assert.match(await page.locator('#error').textContent(), /sound_front\.wav/);
    assert.equal(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled(), true);
    await page.getByRole('group', { name: 'Center' }).getByLabel('Angle').selectOption('1');
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    assert.equal(await page.locator('#error').textContent(), '');
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
    assert.equal(await page.locator('#play').isDisabled(), false);
    assert.equal(await page.locator('.video-feed:not([hidden])').count(), 0);
    assert.equal(await page.locator('.compass').first().isVisible(), true);
    assert.equal(await page.locator('audio, video').count(), 0);
    assert.equal(await page.locator('#error').textContent(), '');
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});
