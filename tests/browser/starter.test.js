import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { startBrowserHarness } from './harness.js';

const materials = '/examples/starter/materials/';
const track = (file, format, a, b) => `<track file_name="${file}" file_format="${format}">
  <track_indexing timing_type="seconds">
    <track_event event_ref="a" start_time="${a}"/><track_event event_ref="b" start_time="${b}"/>
  </track_indexing></track>`;
const page = (position, ref) => `<graphic_instance position_in_group="${position}" file_name="page-${position}.svg">
  <graphic_event event_ref="${ref}" upper_left_x="10" upper_left_y="10" lower_right_x="60" lower_right_y="40"/>
</graphic_instance>`;
const piece = `<ieee1599 version="1.0"><general><description><main_title>Starter test</main_title>
  <author type="composer">Anonymous</author></description></general>
  <logic><spine><event id="a"/><event id="b"/></spine></logic>
  <notational><graphic_instance_group>${page(1, 'a')}${page(2, 'b')}</graphic_instance_group></notational>
  <audio>${track('first%20take.wav', 'audio_wav', 0.3, 0.7)}${track('second.wav', 'audio_wav', 0.9, 1.35)}
    ${track('film.mp4', 'video_quicktime', 0, 1)}</audio>
</ieee1599>`;
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="white"/></svg>';

/** Two seconds of silent mono 8 kHz PCM, decoded by the real AudioContext. */
function silence() {
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

const files = new Map([
  ['piece.xml', [piece, 'application/xml']], ['page-1.svg', [image, 'image/svg+xml']],
  ['page-2.svg', [image, 'image/svg+xml']], ['first take.wav', [silence(), 'audio/wav']],
  ['second.wav', [silence(), 'audio/wav']]
]);
let harness;
before(async () => { harness = await startBrowserHarness(); });
after(async () => { await harness.close(); });

/** @param {import('playwright-core').Page} tab */
async function serveMaterials(tab, missing = '') {
  await tab.route(`**${materials}**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(materials.length));
    const file = name === missing ? undefined : files.get(name);
    return file ? route.fulfill({ body: file[0], contentType: file[1] }) : route.fulfill({ status: 404 });
  });
}

test('starter follows the score, turns pages and keeps the score position across recordings', async () => {
  const tab = await harness.browser.newPage();
  tab.setDefaultTimeout(5000);
  try {
    await serveMaterials(tab);
    await tab.goto(`${harness.base}examples/starter/index.html?document=materials/piece.xml`);
    assert.equal(await tab.getByLabel('IEEE 1599 document').inputValue(), 'materials/piece.xml');
    await tab.locator('summary').click();
    await tab.getByRole('button', { name: 'Open', exact: true }).click();
    await tab.getByRole('button', { name: 'Play' }).waitFor();
    assert.equal(await tab.locator('#title').textContent(), 'Starter test');
    assert.equal(await tab.locator('#authors').textContent(), 'Anonymous (composer)');
    assert.deepEqual(await tab.getByLabel('Recording').locator('option').allTextContents(), ['first take.wav', 'second.wav']);
    assert.equal(await tab.locator('#page').textContent(), 'Page 1 of 2');
    assert.equal(await tab.getByRole('button', { name: 'Previous page' }).isDisabled(), true);

    await tab.getByRole('button', { name: 'Next page' }).click();
    await tab.getByRole('button', { name: 'Seek to score event b' }).click();
    await tab.locator('#now').getByText('b at 0.70 s').waitFor();
    await tab.getByLabel('Recording').selectOption({ label: 'second.wav' });
    await tab.locator('#now').getByText('b at 1.35 s').waitFor();
    assert.equal(await tab.locator('#page').textContent(), 'Page 2 of 2');

    await tab.getByRole('button', { name: 'Previous page' }).click();
    await tab.getByRole('button', { name: 'Seek to score event a' }).click();
    await tab.locator('#now').getByText('a at 0.90 s').waitFor();
    await tab.getByRole('button', { name: 'Play' }).click();
    await tab.locator('#page').getByText('Page 2 of 2').waitFor();
    assert.equal(await tab.locator('audio, video').count(), 0);
    assert.equal(await tab.locator('#status').textContent(), '');
  } finally {
    await tab.close();
  }
});

test('starter explains a missing recording and recovers with another one', async () => {
  const tab = await harness.browser.newPage();
  tab.setDefaultTimeout(5000);
  try {
    await serveMaterials(tab, 'first take.wav');
    await tab.goto(`${harness.base}examples/starter/index.html`);
    await tab.locator('summary').click();
    await tab.getByRole('button', { name: 'Open', exact: true }).click();
    await tab.locator('#status').getByText('HTTP 404').waitFor();
    assert.match(await tab.locator('#status').textContent(), /^Cannot play .*first%20take\.wav: Audio fetch failed: HTTP 404$/);
    await tab.getByLabel('Recording').selectOption({ label: 'second.wav' });
    await tab.getByRole('button', { name: 'Play' }).waitFor();
    assert.equal(await tab.locator('#status').textContent(), '');
  } finally {
    await tab.close();
  }
});

test('starter opens a private nested folder, switches recordings and clears without uploads or storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'starter-folder-'));
  const tab = await harness.browser.newPage();
  tab.setDefaultTimeout(5000);
  try {
    for (const [name, [body]] of files) {
      const path = join(directory, 'nested', name === 'piece.xml' ? 'piece étude #1.xml' : name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, name === 'piece.xml'
        ? Buffer.from(`<?xml version="1.0" encoding="ISO-8859-1"?>${piece.replace('Starter test', 'Starter étude')}`, 'latin1')
        : body);
    }
    await writeFile(join(directory, 'other.xml'), '<ieee1599 version="1.0"/>');
    await tab.addInitScript(() => {
      const created = new Set();
      const make = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { const url = make(blob); created.add(url); return url; };
      URL.revokeObjectURL = (url) => { created.delete(url); revoke(url); };
      globalThis.activeLocalURLs = created;
      globalThis.Storage.prototype.setItem = () => { throw new Error('Unexpected persistent storage'); };
      globalThis.indexedDB.open = () => { throw new Error('Unexpected IndexedDB'); };
      globalThis.caches.open = () => { throw new Error('Unexpected cache storage'); };
    });
    await tab.goto(`${harness.base}examples/starter/index.html`);
    const network = [];
    await tab.route('**/*', (route) => {
      if (new URL(route.request().url()).pathname.endsWith('.js') && route.request().method() === 'GET') return route.continue();
      network.push(route.request().url());
      return route.abort();
    });
    await tab.getByLabel('Materials folder', { exact: true }).setInputFiles(directory);
    await tab.getByLabel('XML in the selected folder').selectOption('nested/piece étude #1.xml');
    await tab.getByRole('button', { name: 'Open selected XML' }).click();
    await tab.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await tab.waitForFunction(() => document.querySelector('#score img')?.naturalWidth === 100);
    await tab.getByRole('button', { name: 'Next page' }).click();
    await tab.getByRole('button', { name: 'Seek to score event b' }).click();
    await tab.locator('#now').getByText('b at 0.70 s').waitFor();
    await tab.getByLabel('Recording').selectOption({ label: 'second.wav' });
    await tab.locator('#now').getByText('b at 1.35 s').waitFor();
    assert.equal(await tab.locator('#title').textContent(), 'Starter étude');
    assert.deepEqual(network, []);
    assert.ok(await tab.evaluate(() => globalThis.activeLocalURLs.size > 0));
    await tab.getByRole('button', { name: 'Clear materials' }).click();
    await tab.locator('#status').getByText('Materials cleared.').waitFor();
    assert.equal(await tab.evaluate(() => globalThis.activeLocalURLs.size), 0);
    assert.equal(await tab.locator('#folder').inputValue(), '');
    assert.equal(await tab.locator('#local-document option').count(), 0);
    assert.equal(await tab.locator('#score img').count(), 0);
    assert.equal(await tab.locator('#player').isHidden(), true);
    await tab.unroute('**/*');
    await tab.reload();
    assert.equal(await tab.locator('#folder').inputValue(), '');
    assert.equal(await tab.locator('#local-document option').count(), 0);
  } finally {
    await tab.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('local folder mode reports missing and remote references without fetching them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'starter-errors-'));
  const tab = await harness.browser.newPage();
  tab.setDefaultTimeout(5000);
  try {
    const localPiece = piece.replace('first%20take.wav', 'missing.wav');
    await writeFile(join(directory, 'missing.xml'), localPiece);
    await writeFile(join(directory, 'remote.xml'), piece.replace('first%20take.wav', 'https://example.org/private.wav'));
    await writeFile(join(directory, 'outside.xml'), piece.replace('first%20take.wav', '../outside.wav'));
    await writeFile(join(directory, 'bad.xml'), '<ieee1599>');
    const requested = [];
    await tab.goto(`${harness.base}examples/starter/index.html`);
    tab.on('request', (request) => {
      if (!new URL(request.url()).pathname.endsWith('.js')) requested.push(request.url());
    });
    await tab.getByLabel('Materials folder', { exact: true }).setInputFiles(directory);
    for (const [name, message] of [
      ['missing.xml', 'Missing asset: missing.wav'],
      ['remote.xml', 'Assets must be inside the selected assets folder'],
      ['outside.xml', 'Assets must be inside the selected assets folder'],
      ['bad.xml', 'Malformed IEEE 1599 XML']
    ]) {
      await tab.getByLabel('XML in the selected folder').selectOption(name);
      await tab.getByRole('button', { name: 'Open selected XML' }).click();
      await tab.locator('#status').getByText(message, { exact: false }).waitFor();
    }
    assert.deepEqual(requested.filter((url) => /^https?:/.test(url)), []);
  } finally {
    await tab.close();
    await rm(directory, { recursive: true, force: true });
  }
});
