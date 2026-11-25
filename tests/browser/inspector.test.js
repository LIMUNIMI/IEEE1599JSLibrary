import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { startBrowserHarness } from './harness.js';

let harness;

before(async () => {
  harness = await startBrowserHarness();
});

after(async () => {
  await harness?.close();
});

test('inspector shows validation, six layers, Spine/LOS and event links for the sample', async () => {
  const page = await harness.browser.newPage();
  await page.goto(`${harness.base}examples/inspector/index.html`);
  await page.getByRole('button', { name: 'all-layers sample' }).click();
  await page.locator('#summary').getByText('valid against').waitFor();
  assert.match(await page.locator('#summary').textContent(), /: valid against IEEE 1599 DTD 1\.0 \(0 error\(s\), 0 warning\(s\)\)\. 6 Spine events, 2 staves, 1 parts,/);
  const rows = await page.locator('#layers tr').evaluateAll((items) => items.map((row) => [...row.cells].map((cell) => cell.textContent)));
  assert.deepEqual(rows.map((row) => row.slice(0, 2)), ['general', 'logic', 'structural', 'notational', 'performance', 'audio'].map((name) => [name, 'yes']));
  assert.ok(rows.every((row) => Number(row[2]) > 0));
  assert.ok(Number(rows.find((row) => row[0] === 'logic')[3]) > 0, 'SVG content is counted as imported vocabulary');
  assert.equal(await page.locator('#spine tr').count(), 6);
  await page.locator('#spine').getByRole('button', { name: 'e1', exact: true }).click();
  const links = await page.locator('#links li').allTextContents();
  assert.ok(links.some((line) => line.startsWith('logic: ')), links.join('\n'));
  assert.ok(links.some((line) => line.startsWith('audio: ')), links.join('\n'));
  assert.equal(await page.locator('#error').textContent(), '');
  await page.close();
});

test('inspector reports invalid files leniently and malformed files as errors', async () => {
  const page = await harness.browser.newPage();
  await page.goto(`${harness.base}examples/inspector/index.html`);
  await page.locator('#file').setInputFiles({ name: 'bad.xml', mimeType: 'application/xml',
    buffer: Buffer.from('<ieee1599><general/><logic><spine><event id="a"/><event id="a"/></spine></logic></ieee1599>') });
  await page.locator('#summary').getByText('invalid against').waitFor();
  const findings = await page.locator('#issues li.error').allTextContents();
  assert.ok(findings.some((line) => line.startsWith('id-duplicate ')), findings.join('\n'));
  await page.locator('#file').setInputFiles({ name: 'broken.xml', mimeType: 'application/xml', buffer: Buffer.from('<ieee1599>') });
  await page.locator('#error').getByText('Malformed IEEE 1599 XML or invalid root element').waitFor();
  await page.close();
});
