import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline } from '../src/core/timeline.js';

test('switches by spine order, preferring earlier then later mappings', () => {
  const timeline = createTimeline(['a', 'b', 'c', 'd'], [
    { eventRef: 'b', time: 12 }, { eventRef: 'd', time: 0 }
  ]);
  assert.deepEqual(timeline.resolve('c'), { eventRef: 'b', time: 12, occurrence: 0 });
  assert.deepEqual(timeline.resolve('a'), { eventRef: 'b', time: 12, occurrence: 0 });
  assert.deepEqual(timeline.resolve('d'), { eventRef: 'd', time: 0, occurrence: 0 });
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

test('rejects duplicate spine events and invalid mappings', () => {
  assert.throws(() => createTimeline(['a', 'a'], []), /duplicate/);
  assert.throws(() => createTimeline(['a'], [{ eventRef: 'x', time: 0 }]), /Unknown/);
  assert.throws(() => createTimeline(['a'], [{ eventRef: 'a', time: -1 }]), /Invalid/);
});

test('maps repeated sections and keeps the repetition when switching performance', () => {
  const first = createTimeline(['a', 'b', 'c'], [
    { eventRef: 'a', time: 0 }, { eventRef: 'b', time: 1 }, { eventRef: 'a', time: 2 },
    { eventRef: 'b', time: 3 }, { eventRef: 'b', time: 3 }, { eventRef: 'c', time: 4 }
  ]);
  assert.deepEqual(first.eventsAt(3.5), ['b']);
  assert.deepEqual(first.eventsAt(2), ['a']);
  assert.equal(first.occurrenceAt('b', 0.5), 0);
  assert.equal(first.occurrenceAt('b', 3.5), 1);
  assert.equal(first.occurrenceAt('c', 9), 0);
  assert.equal(first.occurrenceAt('unmapped', 9), 0);
  const second = createTimeline(['a', 'b', 'c'], [
    { eventRef: 'b', time: 12 }, { eventRef: 'a', time: 10 }, { eventRef: 'a', time: 20 }, { eventRef: 'b', time: 22 }
  ]);
  assert.deepEqual(second.resolve('b', first.occurrenceAt('b', 3.5)), { eventRef: 'b', time: 22, occurrence: 1 });
  assert.deepEqual(second.resolve('b'), { eventRef: 'b', time: 12, occurrence: 0 });
  assert.deepEqual(second.resolve('a', 7), { eventRef: 'a', time: 20, occurrence: 1 });
  assert.deepEqual(second.resolve('c', 1), { eventRef: 'b', time: 22, occurrence: 1 });
});
