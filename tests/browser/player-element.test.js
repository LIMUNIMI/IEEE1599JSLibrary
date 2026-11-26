import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { startBrowserHarness } from './harness.js';
import { createSyntheticWav } from '../fixtures/synthetic.js';

let harness;
before(async () => { harness = await startBrowserHarness(); });
after(async () => { await harness.close(); });
const piece = (title, file = 'take.wav') => `<ieee1599 version="1.0">
  <general><description><main_title>${title}</main_title></description></general>
  <logic><spine><event id="a"/><event id="b"/></spine></logic>
  <notational><graphic_instance_group><graphic_instance position_in_group="1" file_name="page.svg">
    <graphic_event event_ref="a" upper_left_x="10" upper_left_y="10" lower_right_x="30" lower_right_y="40"/>
    <graphic_event event_ref="b" upper_left_x="40" upper_left_y="10" lower_right_x="60" lower_right_y="40"/>
  </graphic_instance></graphic_instance_group></notational>
  <audio><track file_name="${file}" file_format="audio_wav"><track_indexing timing_type="seconds">
    <track_event event_ref="a" start_time="0"/><track_event event_ref="b" start_time="0.5"/>
  </track_indexing></track></audio></ieee1599>`;

async function setup(page) {
  await page.route('**/materials/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('.xml')) return route.fulfill({ contentType: 'application/xml', body: piece(url.includes('second') ? 'Second' : 'First') });
    if (url.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"/>' });
    return route.fulfill({ contentType: 'audio/wav', body: Buffer.from(createSyntheticWav({ duration: 1 })) });
  });
  await page.goto(harness.base);
  await page.evaluate(async () => {
    const { defineIEEE1599Player } = await import('/src/ui/player-element.js');
    defineIEEE1599Player();
    window.players = [document.createElement('ieee1599-player'), document.createElement('ieee1599-player')];
    for (const player of window.players) {
      player.src = '/materials/first.xml';
      document.body.append(player);
    }
  });
  await page.locator('ieee1599-player').first().getByRole('heading', { name: 'First' }).waitFor();
  await page.locator('ieee1599-player').last().getByRole('heading', { name: 'First' }).waitFor();
}

test('embedding loads lazily, isolates players, seeks and disposes/reconnects without media elements', async () => {
  const page = await harness.browser.newPage();
  try {
    await setup(page);
    assert.deepEqual(await page.evaluate(() => window.players.map((player) => player.audio)), [null, null]);
    const component = page.locator('ieee1599-player').first();
    await component.getByRole('button', { name: 'Seek to score event b' }).click();
    await component.getByRole('button', { name: 'Play', exact: true }).click();
    await component.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.players[1].state), 'paused');
    assert.ok(await page.evaluate(() => window.players[0].currentTime) >= 0.5);
    const result = await page.evaluate(async () => {
      const player = window.players[0];
      player.pause();
      player.seek(0.25);
      const position = player.currentTime;
      const context = player.audio.context;
      player.remove();
      await player.dispose();
      document.body.append(player);
      return { position, contextState: context.state, media: player.shadowRoot.querySelectorAll('audio,video').length };
    });
    assert.equal(result.position, 0.25);
    assert.equal(result.contextState, 'closed');
    assert.equal(result.media, 0);
    await page.locator('ieee1599-player').last().getByRole('button', { name: 'Play', exact: true }).waitFor();
    await page.locator('ieee1599-player').last().evaluate((element) => { element.src = '/materials/second.xml'; });
    await page.locator('ieee1599-player').last().getByRole('heading', { name: 'Second' }).waitFor();
  } finally { await page.close(); }
});

test('a pause during slow audio loading prevents an eventual autoplay and document failures are visible', async () => {
  const page = await harness.browser.newPage();
  try {
    await setup(page);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route('**/take.wav', async (route) => {
      await gate;
      await route.fulfill({ contentType: 'audio/wav', body: Buffer.from(createSyntheticWav({ duration: 1 })) });
    });
    await page.evaluate(() => {
      window.starting = window.players[0].play();
    });
    await page.waitForFunction(() => window.players[0].audio !== null);
    await page.evaluate(() => window.players[0].pause());
    release();
    assert.equal(await page.evaluate(async () => { await window.starting; return window.players[0].state; }), 'paused');
    await page.route('**/missing.xml', (route) => route.fulfill({ status: 404 }));
    await page.evaluate(() => { window.players[0].src = '/missing.xml'; });
    await page.locator('ieee1599-player').first().locator('[part=error]').getByText('HTTP 404').waitFor();
  } finally { await page.close(); }
});

test('the plain HTML embedding example registers and opens a document without a framework', async () => {
  const page = await harness.browser.newPage();
  try {
    await setup(page);
    await page.goto(`${harness.base}examples/embed/index.html`);
    await page.getByRole('textbox', { name: 'IEEE 1599 document' }).fill('/materials/first.xml');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('ieee1599-player').getByRole('heading', { name: 'First' }).waitFor();
    assert.equal(await page.locator('ieee1599-player').evaluate((element) => element.audio), null);
    assert.equal(await page.locator('audio,video').count(), 0);
  } finally { await page.close(); }
});
