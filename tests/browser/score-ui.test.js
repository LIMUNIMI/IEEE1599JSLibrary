import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startBrowserHarness } from './harness.js';

let harness;
before(async () => { harness = await startBrowserHarness(); });
after(async () => { await harness.close(); });

test('IIIF 2/3 full images preserve source-pixel score hit targets and metadata errors are visible', async () => {
  const guide = await readFile(new URL('../../docs/score-ui.md', import.meta.url), 'utf8');
  const snippet = guide.match(/<graphic_instance_group\b[\s\S]+?<\/graphic_instance_group>/)?.[0];
  assert.ok(snippet, 'the guide includes a notational example');
  const page = await harness.browser.newPage();
  try {
    await page.route('**/iiif/**', (route) => {
      const url = new URL(route.request().url());
      const version = url.pathname.includes('/v2/') ? 2 : 3;
      const id = `${harness.base}iiif/v${version}/score%2Fpage`;
      if (url.pathname.endsWith('/info.json')) return route.fulfill({
        json: { '@context': `http://iiif.io/api/image/${version}/context.json`,
          [version === 3 ? 'id' : '@id']: id, width: 1000, height: 500,
          profile: version === 3 ? 'level1' : ['http://iiif.io/api/image/2/level1.json'] }
      });
      return route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="white"/></svg>' });
    });
    await page.goto(harness.base);
    for (const version of [2, 3]) {
      const result = await page.evaluate(async ({ base, version, snippet }) => {
        const { createScoreView } = await import('/src/ui/score-view.js');
        const { createPlayerProjection, parseIEEE1599Document } = await import('/src/index.js');
        const group = snippet.replace('https://images.example.org/iiif/score-page-1/info.json',
          `iiif/v${version}/score%2Fpage/info.json`);
        const projection = createPlayerProjection(parseIEEE1599Document(`<ieee1599 version="1.0">
          <general><description><main_title>IIIF example</main_title></description></general>
          <logic><spine><event id="e1"/></spine></logic>
          <notational>${group}</notational></ieee1599>`, { baseURL: `${base}piece.xml` }));
        const container = document.createElement('div');
        container.style.width = '200px';
        document.body.replaceChildren(container);
        window.seeked = [];
        window.score = createScoreView({ container, page: projection.graphicInstances[0].pages[0],
          onSeek: (ref) => window.seeked.push(ref) });
        await window.score.ready;
        return { box: container.querySelector('svg').getAttribute('viewBox'), url: container.querySelector('img').src };
      }, { base: harness.base, version, snippet });
      assert.equal(result.box, '0 0 1000 500');
      assert.match(result.url, version === 3 ? /score%2Fpage\/full\/max\/0\/default.jpg$/ : /score%2Fpage\/full\/full\/0\/default.jpg$/);
      const box = await page.locator('img').boundingBox();
      await page.mouse.click(box.x + 28, box.y + 50);
      assert.deepEqual(await page.evaluate(() => window.seeked), ['e1']);
      await page.evaluate(() => window.score.dispose());
    }
    await page.route('**/invalid/info.json', (route) => route.fulfill({ json: { type: 'Manifest' } }));
    await page.evaluate(async (base) => {
      const { createScoreView } = await import('/src/ui/score-view.js');
      const view = createScoreView({ container: document.body, page: { url: `${base}invalid/info.json`, events: [] }, onSeek() {} });
      await view.ready.catch(() => {});
    }, harness.base);
    await page.getByRole('alert').getByText('Unsupported or invalid IIIF').waitFor();
  } finally { await page.close(); }
});

test('pager zooms, follows pages, moves a themeable cursor and supports keyboard navigation', async () => {
  const page = await harness.browser.newPage();
  try {
    await page.goto(harness.base);
    await page.evaluate(async () => {
      const { createScorePager } = await import('/src/ui/score-pager.js');
      const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200"/>')}`;
      const container = document.createElement('div');
      container.style.width = '200px';
      container.style.setProperty('--ieee1599-highlight-color', 'red');
      document.body.append(container);
      window.seeked = [];
      window.pager = createScorePager({ container, pages: [
        { url: image, events: [
          { eventRef: 'a', x1: 10, y1: 10, x2: 40, y2: 40 },
          { eventRef: 'b', x1: 60, y1: 10, x2: 90, y2: 40 }
        ] },
        { url: image, events: [{ eventRef: 'c', x1: 30, y1: 10, x2: 50, y2: 40 }] }
      ], onSeek: (ref) => window.seeked.push(ref) });
      await window.pager.ready;
      window.pager.highlight(['a']);
    });
    const unchangedWrites = await page.evaluate(() => {
      const observer = new window.MutationObserver(() => {});
      observer.observe(document.querySelector('svg'), { subtree: true, attributes: true });
      window.pager.highlight(['a']);
      const count = observer.takeRecords().length;
      observer.disconnect();
      return count;
    });
    assert.equal(unchangedWrites, 0);
    const first = page.getByRole('button', { name: 'Seek to score event a' });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.seeked), ['b']);
    await page.evaluate(() => window.pager.highlight(['c']));
    assert.equal(await page.evaluate(() => window.pager.pageIndex), 0, 'Following must not remove the keyboard-focused event');
    await page.getByLabel('Zoom').fill('2');
    await page.evaluate(() => window.pager.highlight(['a']));
    assert.equal(await page.evaluate(() => window.pager.zoom), 2);
    assert.equal(await page.locator('img').evaluate((image) => image.getBoundingClientRect().width), 400);
    assert.equal(await page.locator('rect[aria-pressed=true]').evaluate((rect) => window.getComputedStyle(rect).fill), 'rgb(255, 0, 0)');
    await page.evaluate(() => window.pager.highlight(['c']));
    await page.getByRole('status').getByText('Page 2 of 2').waitFor();
    assert.equal(await page.locator('line').getAttribute('x1'), '30');
    await page.getByRole('region', { name: 'Score pages' }).focus();
    await page.keyboard.press('PageUp');
    await page.getByRole('status').getByText('Page 1 of 2').waitFor();
    await page.getByRole('button', { name: 'Next page' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('status').getByText('Page 2 of 2').waitFor();
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Score pages');
    await page.evaluate(() => window.pager.dispose());
    assert.equal(await page.getByRole('region').count(), 0);
  } finally { await page.close(); }
});
