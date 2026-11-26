import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { startBrowserHarness } from './harness.js';

let harness;
let browser;
let base;

before(async () => {
  harness = await startBrowserHarness();
  ({ browser, base } = harness);
});

after(async () => {
  await harness?.close();
});

test('records native audio and WebCodecs capability evidence using synthetic inputs', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base);
    const result = await page.evaluate(async () => {
      const { createSyntheticWav } = await import('/tests/fixtures/synthetic.js');
      /** @type {Record<string, unknown>} */
      const evidence = {
        browser: globalThis.navigator.userAgent,
        audioContext: typeof AudioContext === 'function',
        wavDecode: { supported: false },
        videoDecoderApi: typeof VideoDecoder === 'function',
        audioDecoderApi: typeof AudioDecoder === 'function'
      };
      if (typeof AudioContext === 'function') {
        const context = new AudioContext();
        try {
          const decoded = await context.decodeAudioData(createSyntheticWav());
          evidence.wavDecode = {
            supported: true,
            sampleRate: decoded.sampleRate,
            channels: decoded.numberOfChannels,
            duration: decoded.duration
          };
        } catch (error) {
          evidence.wavDecode = { supported: false, error: String(error) };
        } finally {
          await context.close();
        }
      }
      if (typeof VideoDecoder === 'function') {
        try {
          const { supported, config } = await VideoDecoder.isConfigSupported({
            codec: 'avc1.42E01E',
            codedWidth: 16,
            codedHeight: 16
          });
          evidence.h264BaselineConfig = { supported, config: config ?? null };
        } catch (error) {
          evidence.h264BaselineConfig = { supported: false, error: String(error) };
        }
      } else {
        evidence.h264BaselineConfig = { supported: false, reason: 'VideoDecoder API unavailable' };
      }
      if (typeof globalThis.AudioDecoder === 'function') {
        try {
          const { supported, config } = await globalThis.AudioDecoder.isConfigSupported({
            codec: 'mp4a.40.2',
            sampleRate: 48000,
            numberOfChannels: 2
          });
          evidence.aacConfig = { supported, config: config ?? null };
        } catch (error) {
          evidence.aacConfig = { supported: false, error: String(error) };
        }
      } else {
        evidence.aacConfig = { supported: false, reason: 'AudioDecoder API unavailable' };
      }
      return evidence;
    });
    assert.equal(typeof result.browser, 'string');
    assert.equal(typeof result.audioContext, 'boolean');
    assert.equal(typeof result.videoDecoderApi, 'boolean');
    assert.equal(typeof result.audioDecoderApi, 'boolean');
    if (process.env.CAPABILITY_OUTPUT) {
      await mkdir(dirname(process.env.CAPABILITY_OUTPUT), { recursive: true });
      await writeFile(process.env.CAPABILITY_OUTPUT, `${JSON.stringify({
        engine: process.env.BROWSER ?? 'msedge',
        capturedAt: new Date().toISOString(),
        evidence: result
      }, null, 2)}\n`);
    }
    console.info(`Browser capability evidence: ${JSON.stringify(result)}`);
  } finally {
    await page.close();
  }
});
