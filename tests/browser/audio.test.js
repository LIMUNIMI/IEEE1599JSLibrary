import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

let server;
let browser;
let base;

before(async () => {
  const moduleSource = await readFile(new URL('../../src/media/buffered-audio.js', import.meta.url), 'utf8');
  const loggerSource = await readFile(new URL('../../src/diagnostics/logger.js', import.meta.url), 'utf8');
  server = createServer((request, response) => {
    if (request.url === '/audio.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(moduleSource);
    } else if (request.url === '/diagnostics/logger.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(loggerSource);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html>');
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

test('decodes a synthetic WAV and plays multiple instances with native Web Audio', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const { createBufferedAudioPlayer } = await import('/audio.js');
    const context = new AudioContext();
    const player = createBufferedAudioPlayer({ context });
    const samples = 2400;
    const bytes = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(bytes);
    const write = (offset, text) => [...text].forEach((character, i) => view.setUint8(offset + i, character.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE');
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 24000, true);
    view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / 10) * 10000, true);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    try {
      const buffer = await player.loadAudio(url);
      player.addAudio(buffer, { id: 'a' });
      player.addAudio(buffer, { id: 'b', offset: 0.02, gain: 0.5 });
      const ended = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Audio did not finish')), 5000);
        player.addEventListener('statechange', () => {
          if (player.state === 'ended') { clearTimeout(timer); resolve(player.currentTime); }
        });
      });
      await player.play();
      const position = await ended;
      const state = player.state;
      await player.dispose();
      const sharedContextState = context.state;
      await context.close();
      return { duration: buffer.duration, position, state, sharedContextState };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  assert.ok(Math.abs(result.duration - 0.1) < 0.001);
  assert.ok(Math.abs(result.position - 0.12) < 0.001);
  assert.equal(result.state, 'ended');
  assert.equal(result.sharedContextState, 'running');
  await page.close();
});
