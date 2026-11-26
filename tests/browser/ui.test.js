import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserHarness } from './harness.js';

let harness;
let browser;
let base;

before(async () => {
  harness = await startBrowserHarness({ blankPage: '<!doctype html><div id="a" style="width: 100px"></div><div id="b"></div>' });
  ({ browser, base } = harness);
});

after(async () => {
  await harness?.close();
});

test('example initializes, seeks by score event, and completes playback', async (t) => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}examples/index.html`);
    if (!await page.evaluate(() => typeof AudioContext === 'function')) {
      t.skip('AudioContext is unavailable in this browser build');
      return;
    }
    await page.getByRole('button', { name: 'Initialize audio' }).click();
    await page.getByRole('button', { name: 'Play' }).waitFor();
    assert.match(await page.locator('#validation').textContent(), /^Valid against IEEE 1599 DTD 1\.0 \(0 findings\)\. Layers: general, logic, notational, audio\.$/);
    assert.deepEqual(await page.locator('#events li').allTextContents(), [
      'first: VTU 0, chord A4 (staff staff, measure 1)',
      'second: VTU 512, chord E5 (staff staff, measure 1)'
    ]);
    await page.getByRole('button', { name: 'Seek to score event second' }).click();
    assert.equal(await page.locator('#controls input').inputValue(), '0.5');
    assert.equal(await page.locator('#now').textContent(), 'second: VTU 512, chord E5 (staff staff, measure 1)');
    await page.getByRole('button', { name: 'Play' }).click();
    await page.locator('#controls [role=status]').getByText('ended').waitFor();
    assert.equal(await page.locator('#message').textContent(), '');
  } finally {
    await page.close();
  }
});

test('score views scale hit targets, highlight independently, and clean up', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.evaluate(async () => {
    const { createScoreView } = await import('/src/ui/score-view.js');
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
    const { createTransportControls } = await import('/src/ui/transport-controls.js');
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

test('transport controls report rejected asynchronous seeks', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.evaluate(async () => {
    const { createTransportControls } = await import('/src/ui/transport-controls.js');
    class Player extends EventTarget {
      state = 'paused'; currentTime = 0; duration = 10;
      async play() {}
      pause() {}
      async seek() { throw new Error('video is not ready'); }
    }
    const container = document.querySelector('#a');
    createTransportControls({ container, player: new Player() });
    const input = container.querySelector('input');
    input.dispatchEvent(new Event('input'));
  });
  await page.getByRole('alert').getByText('video is not ready').waitFor();
  await page.close();
});
