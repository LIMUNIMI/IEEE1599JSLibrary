import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVideoPresenter } from '../examples/shared/video.js';

function picture() {
  const drawn = [];
  const requested = [];
  const sample = (timestamp) => ({
    timestamp, duration: 0.1, close() {},
    displayWidth: 16, displayHeight: 9
  });
  return {
    drawn,
    requested,
    duration: 1,
    async frameAt(position) {
      requested.push(position);
      return position >= 1 ? null : sample(Math.floor(position * 10) / 10);
    },
    async *samples(position) {
      for (let i = Math.ceil(position * 10); i < 10; i++) yield sample(i / 10);
    },
    draw(frame) { drawn.push(frame.timestamp); },
    dispose() {}
  };
}

test('video readiness waits for an in-flight seek', async () => {
  const video = picture();
  const frameAt = video.frameAt;
  let release;
  video.frameAt = async (position) => {
    await new Promise((resolve) => { release = resolve; });
    return frameAt(position);
  };
  const presenter = createVideoPresenter(video);
  const seek = presenter.seek(0.5);
  assert.equal(presenter.isBuffering(0.5), true);
  const ready = presenter.whenReady();
  release();
  await Promise.all([seek, ready]);
  assert.equal(presenter.isBuffering(0.5), false);
  assert.deepEqual(video.drawn, [0.5]);
  presenter.dispose();
});

test('video readiness drains queued frames to the frozen clock without another seek', async () => {
  const video = picture();
  const presenter = createVideoPresenter(video);
  await presenter.seek(0);
  await presenter.present(0.45);
  assert.equal(presenter.isBuffering(0.45), true);
  await presenter.whenReady();
  assert.equal(presenter.isBuffering(0.45), false);
  assert.equal(video.drawn.at(-1), 0.4);
  assert.deepEqual(video.requested, [0]);
  presenter.dispose();
});

test('video seeks at or beyond its end hold the final frame', async () => {
  const video = picture();
  const presenter = createVideoPresenter(video);
  await presenter.seek(2);
  assert.equal(video.drawn.at(-1), 0.9);
  assert.equal(presenter.isBuffering(2), false);
  presenter.dispose();
});
