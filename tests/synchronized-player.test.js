import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSynchronizedMediaPlayer } from '../src/media/synchronized-player.js';

function fakeAudio() {
  const events = new EventTarget();
  const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  return {
    currentTime: 0,
    duration: 10,
    state: 'paused',
    calls: [],
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    async play() { this.calls.push('play'); this.state = 'playing'; emit('statechange', { state: this.state }); },
    pause() { this.calls.push('pause'); this.state = 'paused'; emit('statechange', { state: this.state }); },
    seek(seconds) {
      this.calls.push(`seek:${seconds}`);
      this.currentTime = Math.min(seconds, this.duration);
      emit('positionchange', { currentTime: this.currentTime });
    },
    async dispose() { this.calls.push('dispose'); this.state = 'disposed'; emit('statechange', { state: this.state }); }
  };
}

test('primes aligned video views before play and follows the audio clock', async () => {
  const audio = fakeAudio();
  const presented = [];
  const video = {
    async seek(seconds) { presented.push(`seek:${seconds}`); },
    async present(seconds) { presented.push(`present:${seconds}`); },
    dispose() { presented.push('dispose'); }
  };
  const player = createSynchronizedMediaPlayer({ audio, videos: [video] });
  await player.play();
  assert.deepEqual(presented, ['seek:0']);
  assert.equal(audio.calls.at(-1), 'play');
  audio.currentTime = 2.5;
  await player.present();
  assert.equal(presented.at(-1), 'present:2.5');
  await player.seek(4);
  assert.deepEqual(presented.slice(-1), ['seek:4']);
  assert.equal(audio.calls.at(-1), 'play');
  assert.equal(player.currentTime, 4);
  assert.equal(player.duration, 10);
  await player.dispose();
  assert.equal(presented.at(-1), 'dispose');
  assert.equal(audio.state, 'disposed');
});

test('does not resume playback after a newer pause supersedes asynchronous priming', async () => {
  const audio = fakeAudio();
  let finishSeek;
  const player = createSynchronizedMediaPlayer({
    audio,
    videos: [{
      seek: () => new Promise((resolve) => { finishSeek = resolve; }),
      async present() {}
    }]
  });
  const starting = player.play();
  player.pause();
  finishSeek();
  await starting;
  assert.equal(audio.state, 'paused');
  assert.equal(audio.calls.includes('play'), false);
});

test('pauses and resumes the audio group while a buffering-aware video view refills', async () => {
  const audio = fakeAudio();
  let ready = false;
  let finishRefill;
  const video = {
    async seek() {},
    async present() {},
    isBuffering() { return !ready; },
    whenReady() {
      return new Promise((resolve) => {
        finishRefill = () => { ready = true; resolve(); };
      });
    }
  };
  const player = createSynchronizedMediaPlayer({ audio, videos: [video] });
  await player.play();
  audio.currentTime = 2;
  const presenting = player.present();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(audio.state, 'paused');
  assert.equal(player.buffering, true);
  finishRefill();
  await presenting;
  assert.equal(audio.state, 'playing');
  assert.equal(player.buffering, false);
  await player.dispose();
});

test('forwards transport events and clears buffering when a newer pause supersedes refill', async () => {
  const audio = fakeAudio();
  let ready = false;
  let finishRefill;
  const player = createSynchronizedMediaPlayer({
    audio,
    videos: [{
      async seek() {},
      async present() {},
      isBuffering() { return !ready; },
      whenReady() {
        return new Promise((resolve) => {
          finishRefill = () => { ready = true; resolve(); };
        });
      }
    }]
  });
  const states = [];
  let positions = 0;
  player.addEventListener('statechange', (event) => states.push(event.detail.state));
  player.addEventListener('positionchange', () => { positions += 1; });

  await player.play();
  await player.seek(3);
  const presenting = player.present();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(player.state, 'buffering');
  player.pause();
  assert.equal(player.state, 'paused');
  assert.equal(player.buffering, false);
  finishRefill();
  await presenting;
  assert.equal(audio.state, 'paused');
  assert.ok(states.includes('buffering'));
  assert.equal(states.at(-1), 'paused');
  assert.ok(positions > 0);
  await player.dispose();
  assert.equal(states.at(-1), 'disposed');
});

test('repairs a stale video presentation that completes after a seek', async () => {
  const audio = fakeAudio();
  let finishPresent;
  const calls = [];
  const player = createSynchronizedMediaPlayer({
    audio,
    videos: [{
      async seek(seconds) { calls.push(`seek:${seconds}`); },
      present() {
        return new Promise((resolve) => { finishPresent = resolve; });
      }
    }]
  });
  await player.play();
  const presenting = player.present();
  await player.seek(5);
  finishPresent();
  await presenting;
  assert.equal(calls.at(-1), 'seek:5');
  await player.dispose();
});

test('disposal surfaces video cleanup failures while still releasing audio', async () => {
  const audio = fakeAudio();
  const player = createSynchronizedMediaPlayer({
    audio,
    videos: [{
      async seek() {},
      async present() {},
      dispose() { throw new Error('video cleanup failed'); }
    }]
  });
  await assert.rejects(player.dispose(), /video cleanup failed/);
  assert.equal(audio.state, 'disposed');
});

test('rejects invalid time and incompatible views', async () => {
  assert.throws(() => createSynchronizedMediaPlayer({ audio: fakeAudio(), videos: [{}] }), TypeError);
  assert.throws(() => createSynchronizedMediaPlayer({
    audio: fakeAudio(),
    videos: [{ async seek() {}, async present() {}, isBuffering() { return true; } }]
  }), TypeError);
  const player = createSynchronizedMediaPlayer({ audio: fakeAudio() });
  await assert.rejects(player.seek(Number.NaN), /Invalid seek position/);
  await player.dispose();
});

test('awaits an asynchronous audio seek before priming video and resuming', async () => {
  const audio = fakeAudio();
  const seek = audio.seek.bind(audio);
  let finishSeek;
  audio.seek = async (seconds) => {
    await new Promise((resolve) => { finishSeek = resolve; });
    seek(seconds);
  };
  const positions = [];
  const player = createSynchronizedMediaPlayer({ audio, videos: [{
    async seek(seconds) { positions.push(seconds); }, async present() {}
  }] });
  await player.play();
  const seeking = player.seek(6);
  assert.equal(audio.state, 'paused');
  assert.deepEqual(positions, [0]);
  finishSeek();
  await seeking;
  assert.equal(audio.state, 'playing');
  assert.deepEqual(positions, [0, 6]);
  await player.dispose();
});

test('rechecks all video views when starvation moves to another view during refill', async () => {
  const audio = fakeAudio();
  const waiting = [true, false];
  const refilled = [];
  const player = createSynchronizedMediaPlayer({ audio, videos: [0, 1].map((index) => ({
    async seek() {}, async present() {},
    isBuffering() { return waiting[index]; },
    async whenReady() {
      waiting[index] = false;
      if (index === 0) waiting[1] = true;
      refilled.push(index);
    }
  })) });
  await player.play();
  await player.present();
  assert.deepEqual(refilled, [0, 1]);
  assert.equal(player.state, 'playing');
  await player.dispose();
});
