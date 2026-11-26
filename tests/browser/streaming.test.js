import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserHarness } from './harness.js';

let harness;
before(async () => { harness = await startBrowserHarness(); });
after(async () => { await harness.close(); });

async function openPage(page) {
  await page.goto(harness.base);
  await page.setContent('<button>Enable audio</button>');
  await page.evaluate(() => {
    window.until = async (condition, label) => {
      const start = Date.now();
      while (!condition()) {
        if (Date.now() - start > 5000) throw new Error(`Timed out waiting for ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
  });
  await page.getByRole('button', { name: 'Enable audio' }).click();
}

test('native AudioDecoder/worklet playback stays bounded, seeks and preserves an injected context', { timeout: 20000 }, async (t) => {
  const page = await harness.browser.newPage();
  try {
    await openPage(page);
    const result = await page.evaluate(async () => {
      const config = { codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 1 };
      if (!globalThis.AudioDecoder || !(await AudioDecoder.isConfigSupported(config)).supported) return { unsupported: true };
      const { createStreamingAudioPlayer } = await import('/src/media/streaming-audio.js');
      const context = new AudioContext({ sampleRate: 48000 });
      let generated = 0;
      const track = {
        decoderConfig: config, duration: 2,
        async *chunks(seconds, signal) {
          for (let i = Math.floor(seconds * 20); i < 40; i++) {
            signal.throwIfAborted();
            generated++;
            yield new EncodedAudioChunk({ type: 'key', timestamp: i * 50000, duration: 50000,
              data: Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i / 10) * 0.3) });
          }
        }
      };
      const player = await createStreamingAudioPlayer({ track, context, bufferSeconds: 0.5 });
      const analyser = context.createAnalyser();
      player.node.connect(analyser);
      await player.play();
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      await window.until(() => {
        analyser.getFloatTimeDomainData(samples);
        peak = Math.max(...samples.map(Math.abs));
        return peak > 0.01 && player.currentTime > 0;
      }, 'decoded samples in the audio graph');
      const firstTime = player.currentTime;
      const queued = player.bufferedFrames;
      const producedBeforeSeek = generated;
      player.pause();
      const paused = player.currentTime;
      await new Promise((resolve) => setTimeout(resolve, 70));
      const stable = player.currentTime === paused;
      await player.seek(1.7);
      const atSeek = player.currentTime;
      const ended = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Streaming did not end')), 5000);
        player.addEventListener('statechange', () => {
          if (player.state === 'ended') { clearTimeout(timer); resolve(player.currentTime); }
        });
      });
      await player.play();
      const end = await ended;
      await player.dispose();
      const contextState = context.state;
      await context.close();
      return { peak, firstTime, queued, producedBeforeSeek, stable, atSeek, end, contextState };
    });
    if (result.unsupported) { t.skip('Native PCM AudioDecoder is unavailable in this browser build'); return; }
    assert.ok(result.peak > 0.01, `Decoded audio should reach the native graph: ${result.peak}`);
    assert.ok(result.firstTime > 0 && result.firstTime <= 2);
    assert.ok(result.queued <= 24000);
    assert.ok(result.producedBeforeSeek * 2400 <= result.firstTime * 48000 + 24000 + 2400,
      'Read-ahead must stay within the PCM capacity plus one input packet');
    assert.equal(result.stable, true);
    assert.equal(result.atSeek, 1.7);
    assert.equal(result.end, 2);
    assert.equal(result.contextState, 'running');
  } finally { await page.close(); }
});

test('streaming underrun freezes media time, recovers, and a pending start is superseded by pause', { timeout: 20000 }, async (t) => {
  const page = await harness.browser.newPage();
  try {
    await openPage(page);
    const result = await page.evaluate(async () => {
      const config = { codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 1 };
      if (!globalThis.AudioDecoder || !(await AudioDecoder.isConfigSupported(config)).supported) return { unsupported: true };
      const { createStreamingAudioPlayer } = await import('/src/media/streaming-audio.js');
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const states = [];
      const track = { decoderConfig: config, duration: 1,
        async *chunks(seconds, signal) {
          for (let i = Math.floor(seconds * 10); i < 10; i++) {
            if (i === 3) await gate;
            signal.throwIfAborted();
            yield new EncodedAudioChunk({ type: 'key', timestamp: i * 100000, duration: 100000, data: new Float32Array(4800) });
          }
        }
      };
      const player = await createStreamingAudioPlayer({ track, bufferSeconds: 0.5 });
      player.addEventListener('statechange', () => states.push(player.state));
      await player.play();
      await window.until(() => player.state === 'buffering', 'starvation');
      const stalled = player.state;
      const position = player.currentTime;
      await new Promise((resolve) => setTimeout(resolve, 80));
      const frozen = player.currentTime === position;
      release();
      await window.until(() => player.state === 'playing', 'refill recovery');
      const recovered = player.state;
      await player.dispose();
      let releaseSecond;
      const delayed = await createStreamingAudioPlayer({ track: { ...track,
        async *chunks(_seconds, signal) {
          await new Promise((resolve) => { releaseSecond = resolve; });
          signal.throwIfAborted();
          yield new EncodedAudioChunk({ type: 'key', timestamp: 0, data: new Float32Array(4800) });
        }
      } });
      const starting = delayed.play();
      while (!releaseSecond) await new Promise((resolve) => setTimeout(resolve, 0));
      delayed.pause();
      releaseSecond();
      await starting;
      const cancelled = delayed.state;
      await delayed.dispose();
      return { stalled, frozen, position, recovered, cancelled, states };
    });

    if (result.unsupported) { t.skip('Native PCM AudioDecoder is unavailable in this browser build'); return; }
    assert.equal(result.stalled, 'buffering');
    assert.equal(result.frozen, true);
    assert.ok(Math.abs(result.position - 0.3) < 0.001);
    assert.equal(result.recovered, 'playing');
    assert.equal(result.cancelled, 'paused');
  } finally { await page.close(); }
});

test('streaming reports bad sources, context rates and packet budgets instead of silent playback', { timeout: 20000 }, async (t) => {
  const page = await harness.browser.newPage();
  try {
    await openPage(page);
    const result = await page.evaluate(async () => {
      const config = { codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 1 };
      if (!globalThis.AudioDecoder || !(await AudioDecoder.isConfigSupported(config)).supported) return { unsupported: true };
      const { createStreamingAudioPlayer } = await import('/src/media/streaming-audio.js');
      const track = { duration: 1, decoderConfig: config, async *chunks() {
        yield new EncodedAudioChunk({ type: 'key', timestamp: 0, data: new Float32Array(4800) });
      } };
      const messages = [];
      for (const options of [
        { track: { ...track, async *chunks() {} } },
        { track, maxPacketBytes: 16 },
        { track: { ...track, async *chunks() {
          yield new EncodedAudioChunk({ type: 'key', timestamp: 0, data: new Float32Array(24000) });
        } }, bufferSeconds: 0.5 }
      ]) {
        const player = await createStreamingAudioPlayer(options);
        const errors = [];
        player.addEventListener('error', (event) => errors.push(event.detail.error.message));
        try { await player.play(); messages.push('unexpected success'); }
        catch (error) { messages.push(`${player.state}: ${error.message}`); }
        if (!errors.length) throw new Error('Failure must emit an error event');
        await player.dispose();
      }
      const context = new AudioContext({ sampleRate: 44100 });
      try { await createStreamingAudioPlayer({ track, context }); }
      catch (error) { messages.push(error.message); }
      const sharedState = context.state;
      await context.close();
      const shared = new AudioContext({ sampleRate: 48000 });
      const first = await createStreamingAudioPlayer({ track, context: shared });
      const second = await createStreamingAudioPlayer({ track, context: shared });
      await Promise.all([first.play(), second.play()]);
      first.pause();
      const secondState = second.state;
      await first.dispose();
      await second.dispose();
      await shared.close();
      return { messages, sharedState, secondState };
    });
    if (result.unsupported) { t.skip('Native PCM AudioDecoder is unavailable in this browser build'); return; }
    assert.match(result.messages[0], /^error: .*no audio/);
    assert.match(result.messages[1], /^error: .*byte budget/);
    assert.match(result.messages[2], /^error: .*PCM.*budget/);
    assert.match(result.messages[3], /matching context and track sample rates/);
    assert.notEqual(result.sharedState, 'closed');
    assert.equal(result.secondState, 'playing');
  } finally { await page.close(); }
});

test('streaming retains independent native stereo channels', { timeout: 20000 }, async (t) => {
  const page = await harness.browser.newPage();
  try {
    await openPage(page);
    const result = await page.evaluate(async () => {
      const config = { codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 2 };
      if (!globalThis.AudioDecoder || !(await AudioDecoder.isConfigSupported(config)).supported) return { unsupported: true };
      const { createStreamingAudioPlayer } = await import('/src/media/streaming-audio.js');
      const player = await createStreamingAudioPlayer({ bufferSeconds: 0.5, track: {
        duration: 2, decoderConfig: config,
        async *chunks(_seconds, signal) {
          for (let i = 0; i < 40; i++) {
            signal.throwIfAborted();
            yield new EncodedAudioChunk({ type: 'key', timestamp: i * 50000, data:
              Float32Array.from({ length: 4800 }, (_, index) => index % 2 ? -0.5 : 0.25) });
          }
        }
      } });
      const splitter = player.context.createChannelSplitter(2);
      const analysers = [player.context.createAnalyser(), player.context.createAnalyser()];
      player.node.connect(splitter);
      analysers.forEach((analyser, channel) => splitter.connect(analyser, channel));
      await player.play();
      let channels = [];
      await window.until(() => {
        channels = analysers.map((analyser) => {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
        });
        return Math.abs(channels[0] - 0.25) < 0.001 && Math.abs(channels[1] + 0.5) < 0.001;
      }, 'independent stereo samples');
      await player.dispose();
      return { channels };
    });
    if (result.unsupported) { t.skip('Native stereo PCM AudioDecoder is unavailable'); return; }
    assert.ok(Math.abs(result.channels[0] - 0.25) < 0.001);
    assert.ok(Math.abs(result.channels[1] + 0.5) < 0.001);
  } finally { await page.close(); }
});

test('synthetic streaming example plays and seeks through its native controls', { timeout: 20000 }, async (t) => {
  const page = await harness.browser.newPage();
  try {
    await page.goto(`${harness.base}examples/streaming/index.html`);
    const supported = await page.evaluate(async () => !!globalThis.AudioDecoder && typeof AudioWorkletNode === 'function'
      && (await AudioDecoder.isConfigSupported({ codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 1 })).supported);
    await page.getByRole('button', { name: 'Initialize streaming' }).click();
    if (!supported) {
      await page.getByRole('alert').getByText(/Streaming requires native|Unsupported native streaming audio codec/).waitFor();
      t.skip('Native PCM streaming is unavailable');
      return;
    }
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.getByRole('slider', { name: 'Playback position' }).fill('9.9');
    await page.locator('#status').getByText('ended').waitFor();
    assert.deepEqual(await page.getByRole('alert').allTextContents(), ['', '']);
    assert.equal(await page.locator('audio,video').count(), 0);
  } finally { await page.close(); }
});
