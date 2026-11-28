import assert from 'node:assert/strict';
import { test } from 'node:test';
import { angleText, nearestAngle, pointAngle } from '../examples/dmite/knob.js';

test('DmITE knob names cardinal angles and keeps other angles numeric', () => {
  assert.equal(angleText(90), '90° (Right)');
  assert.equal(angleText(270), '270° (Left)');
  assert.equal(angleText(15), '15°');
});

test('DmITE knob measures pointer angles clockwise from the front', () => {
  assert.equal(pointAngle(0, -10), 0);
  assert.equal(pointAngle(10, 0), 90);
  assert.equal(pointAngle(0, 10), 180);
  assert.equal(pointAngle(-10, 0), 270);
});

test('DmITE knob snaps to the nearest recorded angle across 0°', () => {
  assert.equal(nearestAngle([0, 90, 180, 270], 100), 1);
  assert.equal(nearestAngle([90, 345, 180], 5), 1);
  assert.equal(nearestAngle([0, 90], 352), 0);
});
