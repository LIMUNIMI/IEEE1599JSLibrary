import assert from 'node:assert/strict';
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
