import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline } from '../src/core/timeline.js';

test('switches by spine order, preferring earlier then later mappings', () => {
  const timeline = createTimeline(['a', 'b', 'c', 'd'], [
    { eventRef: 'b', time: 12 }, { eventRef: 'd', time: 0 }
  ]);
  assert.deepEqual(timeline.resolve('c'), { eventRef: 'b', time: 12 });
  assert.deepEqual(timeline.resolve('a'), { eventRef: 'b', time: 12 });
  assert.deepEqual(timeline.resolve('d'), { eventRef: 'd', time: 0 });
  assert.throws(() => timeline.resolve('missing'), /Unknown spine/);
  assert.throws(() => createTimeline(['a'], []).resolve('a'), /no mapped/);
});

test('indexes simultaneous timestamps and does not invent an event before the first', () => {
  const timeline = createTimeline(['a', 'b', 'c'], [
    { eventRef: 'c', time: 2 }, { eventRef: 'a', time: 1 }, { eventRef: 'b', time: 1 }
  ]);
  assert.deepEqual(timeline.eventsAt(0), []);
  assert.deepEqual(timeline.eventsAt(1), ['a', 'b']);
  assert.deepEqual(timeline.eventsAt(2), ['c']);
  assert.throws(() => timeline.eventsAt(NaN), /Invalid/);
});

test('rejects duplicate and invalid mappings', () => {
  assert.throws(() => createTimeline(['a', 'a'], []), /duplicate/);
  assert.throws(() => createTimeline(['a'], [{ eventRef: 'x', time: 0 }]), /Unknown/);
  assert.throws(() => createTimeline(['a'], [{ eventRef: 'a', time: -1 }]), /Invalid/);
  assert.throws(() => createTimeline(['a'], [
    { eventRef: 'a', time: 0 }, { eventRef: 'a', time: 1 }
  ]), /Duplicate/);
});
