import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/diagnostics/logger.js';

test('retains bounded records and isolates snapshots', () => {
  const logger = createLogger({ capacity: 2, console: false });
  logger.log('debug', 'test', 'hidden');
  logger.log('warn', 'test', 'first');
  logger.log('error', 'test', 'second');
  logger.log('warn', 'test', 'third');
  const snapshot = logger.snapshot();
  assert.deepEqual(snapshot.map((record) => record.message), ['second', 'third']);
  snapshot[0].message = 'changed';
  assert.equal(logger.snapshot()[0].message, 'second');
  logger.clear();
  assert.deepEqual(logger.snapshot(), []);
});

test('verbose logging is opt-in and capacity is validated', () => {
  const logger = createLogger({ verbose: true, capacity: 1, console: false });
  logger.log('info', 'media', 'ready');
  assert.equal(logger.snapshot()[0].message, 'ready');
  assert.throws(() => createLogger({ capacity: -1 }), /capacity/);
});
