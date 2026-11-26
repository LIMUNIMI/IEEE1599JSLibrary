import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { startBrowserHarness } from './harness.js';

let harness;
let browser;
let base;
let xml;

before(async () => {
  xml = await readFile(new URL('../fixtures/minimal.xml', import.meta.url), 'utf8');
  harness = await startBrowserHarness();
  ({ browser, base } = harness);
});

after(async () => {
  await harness?.close();
});

test('parses the supported subset and resolves media URLs in a real browser', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const data = await page.evaluate(async () => {
    const { loadIEEE1599 } = await import('/src/xml/parse.js');
    return loadIEEE1599('/tests/fixtures/minimal.xml');
  });
  assert.equal(data.metadata.mainTitle, 'Example');
  assert.deepEqual(data.spine.map((event) => event.id), ['a', 'b']);
  assert.equal(data.logicalEvents[0].pitches[0].step, 'C');
  assert.deepEqual(data.graphicInstances[0].pages.map((page) => page.position), [1, 2]);
  assert.equal(data.graphicInstances[0].pages[0].url, `${base}tests/fixtures/page-1.png`);
  assert.deepEqual(data.audioTracks[0].events.map((event) => event.time), [0, 1.25]);
  assert.deepEqual(data.warnings, ['Unsupported XML element: unsupported_layer', 'Unsupported XML element: unknown_item']);
  await page.close();
});

test('rejects malformed, inconsistent, entity-bearing and failed requests', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const failures = await page.evaluate(async (source) => {
    const { parseIEEE1599, loadIEEE1599 } = await import('/src/xml/parse.js');
    const cases = [
      () => parseIEEE1599('<ieee1599>'),
      () => parseIEEE1599(source.replace('event_ref="b"', 'event_ref="missing"'), { baseURL: location.href }),
      () => parseIEEE1599('<!DOCTYPE ieee1599 [<!ENTITY x "x">]><ieee1599/>'),
      () => loadIEEE1599('/tests/fixtures/missing.xml')
    ];
    return Promise.all(cases.map(async (fn) => {
      try { await fn(); return null; } catch (error) { return error.message; }
    }));
  }, xml);
  assert.match(failures[0], /Malformed/);
  assert.match(failures[1], /Unknown spine/);
  assert.match(failures[2], /entity declarations/);
  assert.match(failures[3], /HTTP 404/);
  await page.close();
});

test('projects normalized references, optional offsets and only usable tracks and pages', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base);
    const result = await page.evaluate(async () => {
      const { parseIEEE1599Document, createPlayerProjection } = await import('/src/index.js');
      const fixture = await fetch('/tests/fixtures/all-layers.xml').then((response) => response.text());
      const source = fixture.replace('<event id="e5"/>', '<event id=" e5 " timing="null" hpos="null"/>')
        .replace('start_time="0" event_ref="e1"', 'start_time="0" event_ref=" e1 "')
        .replace('measurement_unit="pixels"', 'measurement_unit="millimeters"')
        .replace('</audio>', '<track file_name="samples.wav" file_format="audio_wav" encoding_format="audio_wav">'
          + '<track_indexing timing_type="samples"><track_event start_time="0" event_ref="e1"/></track_indexing></track></audio>');
      return createPlayerProjection(parseIEEE1599Document(source, { baseURL: location.href }));
    });
    assert.deepEqual(result.spine[4], { id: 'e5', timing: null, hpos: null });
    assert.equal(result.audioTracks[0].events[0].eventRef, 'e1');
    assert.deepEqual(result.audioTracks[1].events, []);
    assert.deepEqual(result.graphicInstances, []);
    assert.ok(result.warnings.some((warning) => warning.includes('millimeters')));
    assert.ok(result.warnings.some((warning) => warning.includes('samples')));
  } finally { await page.close(); }
});

test('preserves legacy encoded text in both URL loaders and rejects malformed bytes', async () => {
  const page = await browser.newPage();
  const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><ieee1599><general><description><main_title>\u00c9tude</main_title></description></general></ieee1599>';
  try {
    await page.route('**/latin.xml', (route) => route.fulfill({
      body: Buffer.from(xml, 'latin1'), contentType: 'application/xml'
    }));
    await page.route('**/bad.xml', (route) => route.fulfill({
      body: Buffer.from(xml.replace(/<\?.*?\?>/, ''), 'latin1'), contentType: 'application/xml'
    }));
    await page.goto(base);
    const result = await page.evaluate(async () => {
      const { loadIEEE1599Document, loadIEEE1599 } = await import('/src/index.js');
      const doc = await loadIEEE1599Document('/latin.xml', { strict: false });
      const projected = await loadIEEE1599('/latin.xml');
      const bad = await loadIEEE1599('/bad.xml').catch((error) => error.message);
      return [doc.general.element('description').element('main_title').text, projected.metadata.mainTitle, bad];
    });
    assert.deepEqual(result.slice(0, 2), ['\u00c9tude', '\u00c9tude']);
    assert.match(result[2], /Cannot decode.*utf-8/i);
  } finally { await page.close(); }
});

test('recognizes declarations only in the XML prolog and preserves their order', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base);
    const result = await page.evaluate(async () => {
      const { parseIEEE1599Document, serializeIEEE1599Document } = await import('/src/index.js');
      const fixture = await fetch('/tests/fixtures/all-layers.xml').then((response) => response.text());
      const source = fixture.replace(/<!-- Synthetic[^\n]+-->/, '<!-- <!DOCTYPE example> -->')
        .replace('dtd">', 'dtd" [<!-- ]> <!ENTITY example> -->]><?after-test ok?>')
        .replace('<raw> & text', '<!ENTITY illustrative>');
      const doc = parseIEEE1599Document(source);
      const written = serializeIEEE1599Document(doc);
      const invalidSpace = parseIEEE1599Document(source.replace('<spine>', '<spine>\u00a0'), { strict: false });
      return [doc.doctype.name, written.indexOf('<?app-hint'), written.indexOf('<!DOCTYPE ieee1599'),
        written.indexOf('<?after-test'), written.includes('<![CDATA[<!ENTITY illustrative>]]>'),
        invalidSpace.issues.some((issue) => issue.code === 'text-not-allowed')];
    });
    assert.equal(result[0], 'ieee1599');
    assert.ok(result[1] < result[2] && result[2] < result[3]);
    assert.deepEqual(result.slice(4), [true, true]);
  } finally { await page.close(); }
});
