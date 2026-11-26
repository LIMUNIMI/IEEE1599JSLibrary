import assert from 'node:assert/strict';
import test from 'node:test';
import { summarize } from '../tools/corpus/summary.js';

test('summarizes corpus findings, flags possible library issues and groups references', () => {
  const markdown = summarize({
    generated: '2026-01-01T00:00:00.000Z', browser: 'test 1', elapsedSeconds: 3,
    documents: [
      {
        document: 'a/one.xml', strictValid: true, projected: true,
        media: [{ status: 'ok' }, { status: 'missing' }],
        findings: [
          { severity: 'error', code: 'missing-file', message: 'Referenced file not found', reference: 'x|y.mp3', candidates: ['audio/x|y.mp3'] },
          { severity: 'info', code: 'projection-warning', message: 'hidden' }
        ]
      },
      {
        document: 'b/two.xml', strictValid: false, projected: false, media: [],
        findings: [{ severity: 'error', code: 'projection-failed', message: 'Error: boom' }]
      }
    ]
  });
  assert.match(markdown, /\| Documents \| 2 \|/);
  assert.match(markdown, /\| DTD-valid documents \| 1 \|/);
  assert.match(markdown, /\| Referenced files: missing \| 1 \|/);
  assert.match(markdown, /- `b\/two.xml` — `projection-failed`: Error: boom/);
  assert.doesNotMatch(markdown, /- `a\/one.xml` — `missing-file`/);
  assert.match(markdown, /`x\\\|y.mp3` → found `audio\/x\\\|y.mp3`/);
  assert.doesNotMatch(markdown, /hidden/);
});

test('sniffs image signatures so mislabelled scans are reported by their real format', async () => {
  const { sniffImage } = await import('../tools/corpus/check.js');
  assert.equal(sniffImage(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a])), 'TIFF');
  assert.equal(sniffImage(new Uint8Array([0x49, 0x49, 0x2a, 0x00])), 'TIFF');
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'JPEG');
  assert.equal(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'WebP');
  assert.equal(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null);
});
