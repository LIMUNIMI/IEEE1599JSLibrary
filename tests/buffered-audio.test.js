import test from 'node:test';
import assert from 'node:assert/strict';
import { createBufferedAudioPlayer } from '../src/media/buffered-audio.js';

class FakeContext extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
    this.sources = [];
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createStereoPanner() {
    return {
      pan: { value: 0 }, connect() {},
      disconnect() { this.disconnected = true; }
    };
  }
  createBufferSource() {
    const source = {
      playbackRate: { value: 1 }, onended: null,
      connect() {}, disconnect() {}, stop() { this.stopped = true; },
      start(when, offset) { this.when = when; this.offset = offset; }
    };
    this.sources.push(source);
    return source;
  }
  async resume() { this.state = 'running'; this.dispatchEvent(new Event('statechange')); }
  async close() { this.state = 'closed'; }
  setState(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}

test('schedules independent instances on one clock, with seek, gain and rate', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  const buffer = { duration: 10 };
  player.addAudio(buffer, { id: 'one' });
  player.addAudio(buffer, { id: 'two', offset: 2, gain: 0.5 });
  await player.play();
  assert.equal(context.sources[0].when, 0);
  assert.equal(context.sources[1].when, 2);
  player.setGain('two', 0);
  assert.equal(player.active[0].gain.gain.value, 1);
  assert.equal(player.active[1].gain.gain.value, 0);
  context.currentTime = 3;
  player.setRate(2);
  assert.equal(player.currentTime, 3);
  assert.equal(context.sources[2].offset, 3);
  assert.equal(context.sources[3].offset, 1);
  context.currentTime = 4;
  assert.equal(player.currentTime, 5);
  player.seek(8);
  assert.equal(context.sources[4].offset, 8);
  assert.equal(context.sources[5].offset, 6);
  player.pause();
  assert.equal(player.state, 'paused');
  assert.equal(context.state, 'running');
  await player.dispose();
  assert.equal(context.state, 'running');
});

test('panning one instance leaves peers and group scheduling alone and survives seek', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  const buffer = { duration: 10, numberOfChannels: 1 };
  player.addAudio(buffer, { id: 'one', pan: -1 });
  player.addAudio(buffer, { id: 'two' });
  await player.play();
  const [{ panner: first }, { panner: second }] = player.active;
  assert.equal(first.pan.value, -1);
  assert.equal(second.pan.value, 0);
  player.setPan('one', 0.75);
  assert.equal(first.pan.value, 0.75);
  assert.equal(second.pan.value, 0);
  assert.equal(context.sources.length, 2);
  assert.throws(() => player.setPan('one', NaN), RangeError);
  assert.throws(() => player.setPan('missing', 0), /Unknown audio instance/);
  player.seek(2);
  assert.equal(first.disconnected, true);
  assert.equal(second.disconnected, true);
  assert.equal(player.active[0].panner.pan.value, 0.75);
  await player.dispose();
});

test('nonzero pan is rejected for multichannel sources without changing their default routing', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  const buffer = { duration: 10, numberOfChannels: 4 };
  assert.throws(() => player.addAudio(buffer, { id: 'surround', pan: 0.5 }), /requires mono or stereo/);
  assert.throws(() => player.addAudio({ ...buffer, numberOfChannels: 2 }, { id: 'stereo', pan: -1.01 }), RangeError);
  player.addAudio(buffer, { id: 'surround' });
  assert.throws(() => player.setPan('surround', -1), /requires mono or stereo/);
  await player.play();
  assert.equal(player.active[0].panner, undefined);
  await player.dispose();
});

test('ends after the last required instance and stops optional peers', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  player.addAudio({ duration: 1 }, { id: 'short' });
  player.addAudio({ duration: 2 }, { id: 'long' });
  player.addAudio({ duration: 4 }, { id: 'optional', required: false });
  await player.play();
  context.sources[0].onended();
  assert.equal(player.state, 'playing');
  context.currentTime = 2;
  context.sources[1].onended();
  assert.equal(player.state, 'ended');
  assert.equal(player.currentTime, 2);
  assert.equal(context.sources[2].stopped, true);
  await player.play();
  assert.equal(context.sources[3].offset, 0);
  player.seek(100);
  assert.equal(player.state, 'ended');
  assert.equal(player.currentTime, 2);
  await player.dispose();
});

test('freezes and resumes as a group when the context is interrupted', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  player.addAudio({ duration: 10 }, { id: 'one' });
  player.addAudio({ duration: 10 }, { id: 'two' });
  await player.play();
  context.currentTime = 3;
  context.setState('suspended');
  assert.equal(player.state, 'buffering');
  assert.equal(player.currentTime, 3);
  assert.match(player.diagnostics.snapshot()[0].message, /interrupted/);
  assert.equal(context.sources[0].stopped, true);
  assert.equal(context.sources[1].stopped, true);
  context.setState('running');
  assert.equal(player.state, 'playing');
  assert.equal(context.sources[2].offset, 3);
  assert.equal(context.sources[3].offset, 3);
  context.setState('suspended');
  player.pause();
  context.setState('running');
  assert.equal(player.state, 'paused');
  await player.dispose();
});

test('invalid inputs and delayed activation do not start a paused group', async () => {
  const context = new FakeContext();
  context.state = 'suspended';
  let resume;
  context.resume = () => new Promise((resolve) => { resume = resolve; });
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  await assert.rejects(player.play(), /required/);
  player.addAudio({ duration: 5 }, { id: 'a' });
  assert.throws(() => player.addAudio({ duration: 5 }, { id: 'a' }), /duplicate/);
  assert.throws(() => player.setRate(0), /rate/);
  assert.throws(() => player.seek(-1), /seek/);
  const pending = player.play();
  player.pause();
  context.state = 'running';
  resume();
  await pending;
  assert.equal(context.sources.length, 0);
  assert.equal(player.state, 'paused');
  await player.dispose();
});

test('a command at the elapsed group end does not restart an empty schedule', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  player.addAudio({ duration: 1 }, { id: 'a' });
  await player.play();
  context.currentTime = 2;
  player.setRate(2);
  assert.equal(player.state, 'ended');
  assert.equal(player.currentTime, 1);
  await player.dispose();
});

test('a scheduling failure stops already scheduled peers and reports an error', async () => {
  const context = new FakeContext();
  const create = context.createBufferSource.bind(context);
  context.createBufferSource = () => {
    const source = create();
    if (context.sources.length === 2) source.start = () => { throw new Error('device failure'); };
    return source;
  };
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  player.addAudio({ duration: 1 }, { id: 'one' });
  player.addAudio({ duration: 1 }, { id: 'two' });
  let errors = 0;
  player.addEventListener('error', () => errors++);
  await assert.rejects(player.play(), /device failure/);
  assert.equal(player.state, 'error');
  assert.equal(context.sources[0].stopped, true);
  assert.equal(errors, 1);
  await player.dispose();
});

test('disposal stops playback and clears the loaded schedule', async () => {
  const context = new FakeContext();
  const player = createBufferedAudioPlayer({ context, diagnostics: { console: false } });
  player.addAudio({ duration: 2 }, { id: 'recording' });
  player.seek(1);
  await player.play();
  await player.dispose();
  assert.equal(player.state, 'disposed');
  assert.equal(player.currentTime, 0);
  assert.equal(player.duration, 0);
  assert.equal(context.sources[0].stopped, true);
});
