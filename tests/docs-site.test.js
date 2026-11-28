import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { renderGuide, siteLink } from '../tools/docs/site.js';

test('guide links resolve at the repository subpath without rewriting external references', () => {
  assert.equal(siteLink('../docs/schema-reference.md#track_event'), '../docs/schema-reference.html#track_event');
  assert.equal(siteLink('https://example.invalid/README.md#anchor'), 'https://example.invalid/README.md#anchor');
  assert.equal(siteLink('#document.md'), '#document.md');
  const html = renderGuide([
    '# Guide',
    '[Sibling](related.md#track_event)',
    '## `track_event`',
    '## `track_event`',
    '## Track_event-1'
  ].join('\n\n'), '../../');
  assert.match(html, /href="\.\.\/\.\.\/api\/index\.html"/);
  assert.match(html, /href="\.\.\/\.\.\/examples\/starter\/index\.html">Try your folder<\/a>/);
  assert.match(html, /href="related\.html#track_event"/);
  assert.deepEqual([...html.matchAll(/<h2 id="([^"]+)"/g)].map((match) => match[1]),
    ['track_event', 'track_event-1', 'track_event-1-1']);
});

test('site and API themes are local and use the IEEE 1599 palette', async () => {
  const config = JSON.parse(await readFile(new URL('../typedoc.json', import.meta.url), 'utf8'));
  const api = await readFile(new URL(`../${config.customCss}`, import.meta.url), 'utf8');
  const site = await readFile(new URL('../tools/docs/style.css', import.meta.url), 'utf8');
  for (const css of [api, site]) {
    assert.match(css, /#f89407/i);
    assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/i, 'themes must not fetch third-party resources');
  }
});
