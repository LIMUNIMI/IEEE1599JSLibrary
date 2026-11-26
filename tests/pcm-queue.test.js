import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PCMQueue } from '../src/media/pcm-queue.js';

test('bounded PCM retains channels, trims preroll and freezes on starvation', () => {
  const queue = new PCMQueue(8);
  queue.reset(2);
  assert.equal(queue.append(0, [new Float32Array([1, 2, 3, 4]), new Float32Array([5, 6, 7, 8])]), 2);
  const output = [new Float32Array(4), new Float32Array(4)];
  assert.deepEqual(queue.render(output), { consumed: 2, status: 'buffering' });
  assert.deepEqual([...output[0]], [3, 4, 0, 0]);
  assert.deepEqual([...output[1]], [7, 8, 0, 0]);
  assert.equal(queue.position, 4);
  assert.equal(queue.frames, 0);
  queue.append(4, [new Float32Array([9, 10])]);
  queue.finish(6);
  assert.equal(queue.render(output).status, 'ended');
  assert.deepEqual([...output[0]], [9, 10, 0, 0]);
});

test('PCM gaps are silence only when the next timestamp or end is known', () => {
  const queue = new PCMQueue(4);
  queue.append(2, [new Float32Array([1, 2])]);
  const output = [new Float32Array(5)];
  assert.equal(queue.render(output).status, 'buffering');
  assert.deepEqual([...output[0]], [0, 0, 1, 2, 0]);
  assert.equal(queue.position, 4);
  queue.finish(5);
  assert.equal(queue.render(output).status, 'ended');
  assert.equal(queue.position, 5);
});

test('PCM rejects excess capacity, unordered data and malformed planes, and clears on seek', () => {
  const queue = new PCMQueue(4);
  queue.append(0, [new Float32Array(3)]);
  assert.throws(() => queue.append(3, [new Float32Array(2)]), /capacity/);
  assert.equal(queue.frames, 3);
  assert.throws(() => queue.append(1, [new Float32Array(1)]), /unordered/);
  assert.throws(() => queue.append(3, [new Float32Array(1), new Float32Array(2)]), /Invalid/);
  queue.reset(20);
  assert.equal(queue.frames, 0);
  assert.equal(queue.position, 20);
  assert.equal(queue.append(0, [new Float32Array(2)]), 0);
});
