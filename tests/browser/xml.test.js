import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

let server;
let browser;
let base;
let xml;

before(async () => {
  xml = await readFile(new URL('../fixtures/minimal.xml', import.meta.url), 'utf8');
  const moduleSource = await readFile(new URL('../../src/xml/parse.js', import.meta.url), 'utf8');
  server = createServer((request, response) => {
    if (request.url === '/src/xml/parse.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(moduleSource);
    } else if (request.url === '/score.xml') {
      response.writeHead(200, { 'Content-Type': 'application/xml' }).end(xml);
    } else if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html>');
    } else {
      response.writeHead(404).end();
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

test('parses the supported subset and resolves media URLs in a real browser', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const data = await page.evaluate(async () => {
    const { loadIEEE1599 } = await import('/src/xml/parse.js');
    return loadIEEE1599('/score.xml');
  });
  assert.equal(data.metadata.mainTitle, 'Example');
  assert.deepEqual(data.spine.map((event) => event.id), ['a', 'b']);
  assert.equal(data.logicalEvents[0].pitches[0].step, 'C');
  assert.deepEqual(data.graphicInstances[0].pages.map((page) => page.position), [1, 2]);
  assert.equal(data.graphicInstances[0].pages[0].url, `${base}page-1.png`);
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
      () => loadIEEE1599('/missing.xml')
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
