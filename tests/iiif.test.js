import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIIIFImage } from '../src/adapters/iiif.js';

test('IIIF reports HTTP, metadata and unsupported source failures without guessing a manifest', async (t) => {
  const info = { '@context': 'http://iiif.io/api/image/3/context.json', id: 'https://images.test/score', width: 100, height: 200 };
  let response = { ok: false, status: 403, json: async () => info };
  t.mock.method(globalThis, 'fetch', async () => response);
  await assert.rejects(loadIIIFImage('https://images.test/score'), /HTTP 403/);
  for (const invalid of [{ type: 'Manifest' }, { ...info, width: 0 }, { ...info, id: null }, { ...info, id: 'javascript:alert(1)' }]) {
    response = { ok: true, json: async () => invalid };
    await assert.rejects(loadIIIFImage('https://images.test/score/info.json'));
  }
  await assert.rejects(loadIIIFImage('file:///score/info.json'), /HTTP/);
});

test('IIIF retains escaped identifiers and explicit queries, and forwards abort signals', async (t) => {
  const abort = new AbortController();
  let requested;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requested = url.href;
    assert.equal(options.signal, abort.signal);
    options.signal.throwIfAborted();
    return { ok: true, url: url.href, json: async () => ({
      '@context': ['http://iiif.io/api/image/2/context.json'],
      '@id': 'https://images.test/score%2Fpage?access=public', width: 600, height: 900
    }) };
  });
  const result = await loadIIIFImage('https://images.test/score%2Fpage?metadata=public', { signal: abort.signal });
  assert.equal(requested, 'https://images.test/score%2Fpage/info.json?metadata=public');
  assert.equal(result.url, 'https://images.test/score%2Fpage/full/full/0/default.jpg?access=public');
  abort.abort();
  await assert.rejects(loadIIIFImage('https://images.test/score', { signal: abort.signal }), { name: 'AbortError' });
});
