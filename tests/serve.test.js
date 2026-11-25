import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRange, startStaticServer } from '../tools/serve.js';

test('parseRange handles whole files, open and suffix ranges, and rejects unsatisfiable ones', () => {
  assert.equal(parseRange(undefined, 10), null);
  assert.deepEqual(parseRange('bytes=2-4', 10), { start: 2, end: 4 });
  assert.deepEqual(parseRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=5-99', 10), { start: 5, end: 9 });
  assert.equal(parseRange('bytes=10-', 10), 'invalid');
  assert.equal(parseRange('bytes=-', 10), 'invalid');
  assert.equal(parseRange('items=0-1', 10), 'invalid');
});

test('static server serves index pages, typed media and byte ranges inside its root only', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'serve-test-'));
  const root = join(parent, 'site');
  await mkdir(join(root, 'piece'), { recursive: true });
  await writeFile(join(root, 'piece', 'index.html'), '<h1>Piece</h1>');
  await writeFile(join(root, 'piece', 'take.wav'), 'RIFF0123456789');
  await writeFile(join(parent, 'secret.txt'), 'outside');
  const server = await startStaticServer({ root, port: 0 });
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const redirect = await fetch(`${server.url}piece`, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    const page = await fetch(`${server.url}piece/`);
    assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await page.text(), '<h1>Piece</h1>');
    const part = await fetch(`${server.url}piece/take.wav`, { headers: { Range: 'bytes=4-7' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-type'), 'audio/wav');
    assert.equal(part.headers.get('content-range'), 'bytes 4-7/14');
    assert.equal(await part.text(), '0123');
    assert.equal((await fetch(`${server.url}piece/take.wav`, { headers: { Range: 'bytes=99-' } })).status, 416);
    assert.equal((await fetch(`${server.url}missing.xml`)).status, 404);
    assert.equal((await fetch(`${server.url}..%2fsecret.txt`)).status, 403);
  } finally {
    await server.close();
    await rm(parent, { recursive: true, force: true });
  }
});
