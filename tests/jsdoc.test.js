import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function sources(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? sources(join(dir, entry.name)) : [join(dir, entry.name)]));
  return nested.flat().filter((file) => file.endsWith('.js'));
}

test('every exported function and class in src has JSDoc; functions document @returns', async () => {
  const missing = [];
  for (const file of await sources('src')) {
    const text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
    if (!/^\/\*\*[\s\S]*?@module /m.test(text.slice(0, 2000)) && !text.startsWith('// Generated')) missing.push(`${file}: no @module overview`);
    for (const match of text.matchAll(/^export (?:async )?(function|class) (\w+)/gm)) {
      const before = text.slice(0, match.index).trimEnd();
      const doc = before.endsWith('*/') ? before.slice(before.lastIndexOf('/**')) : '';
      if (!doc) missing.push(`${file}: ${match[2]} has no JSDoc`);
      else if (match[1] === 'function' && !/@returns /.test(doc)) missing.push(`${file}: ${match[2]} lacks @returns`);
    }
  }
  assert.deepEqual(missing, []);
});
