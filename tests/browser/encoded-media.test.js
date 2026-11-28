import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { startBrowserHarness } from './harness.js';
import { parseRange } from '../../tools/serve.js';

test('demuxes cross-origin MP4 over HTTP ranges and decodes real video and AAC', { timeout: 20000 }, async (t) => {
  const bytes = await readFile(new URL('../fixtures/synthetic-av.mp4', import.meta.url));
  const harness = await startBrowserHarness();
  const origins = [];
  const ranges = [];
  const media = createServer((request, response) => {
    if (request.url !== '/synthetic.mp4') return response.writeHead(404).end();
    origins.push(request.headers.origin);
    const range = parseRange(request.headers.range, bytes.length);
    if (range === 'invalid') return response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end();
    const content = range ? bytes.subarray(range.start, range.end + 1) : bytes;
    if (range && request.method === 'GET') ranges.push(range);
    response.writeHead(range ? 206 : 200, {
      'Access-Control-Allow-Origin': new URL(harness.base).origin,
      'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range',
      'Accept-Ranges': 'bytes', 'Content-Length': content.length, 'Content-Type': 'video/mp4',
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}` } : {})
    }).end(request.method === 'HEAD' ? undefined : content);
  });
  try {
    media.listen(0, '127.0.0.1');
    await once(media, 'listening');
    const page = await harness.browser.newPage();
    await page.goto(harness.base);
    const result = await page.evaluate(async (url) => {
      const { openMediabunnyInput } = await import('/src/adapters/mediabunny.js');
      const mediabunny = await import('/node_modules/mediabunny/dist/bundles/mediabunny.mjs');
      const input = await openMediabunnyInput({ mediabunny, source: url });
      try {
        const video = input.tracks.find((track) => track.type === 'video');
        const audio = input.tracks.find((track) => track.type === 'audio');
        const evidence = { video: video.codec, audio: audio.codec, colors: [], peak: null };
        if (video.canDecode && video.decoderConfig) {
          const sink = new mediabunny.VideoSampleSink(video.sourceTrack);
          const canvas = document.createElement('canvas');
          canvas.width = video.decoderConfig.codedWidth;
          canvas.height = video.decoderConfig.codedHeight;
          const ctx = canvas.getContext('2d');
          for (const time of [0.1, 0.9]) {
            const sample = await sink.getSample(time);
            if (!sample) throw new Error(`Native decoder reported support but yielded no video sample at ${time}s`);
            try {
              sample.draw(ctx, 0, 0);
              evidence.colors.push([...ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data.slice(0, 3)]);
            } finally { sample.close(); }
          }
        }
        if (audio.canDecode && audio.decoderConfig) {
          evidence.peak = 0;
          let rejectDecoder;
          const failure = new Promise((_resolve, reject) => { rejectDecoder = reject; });
          failure.catch(() => {});
          const decoder = new AudioDecoder({
            output(data) {
              try {
                const plane = new Float32Array(data.numberOfFrames);
                data.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
                evidence.peak = Math.max(evidence.peak, ...plane.map(Math.abs));
              } finally { data.close(); }
            },
            error: rejectDecoder
          });
          try {
            decoder.configure(audio.decoderConfig);
            let count = 0;
            for await (const packet of audio.packets.packets()) {
              decoder.decode(new EncodedAudioChunk({
                type: packet.type, timestamp: Math.round(packet.timestamp * 1e6), data: packet.data
              }));
              if (++count >= 8) break;
            }
            await Promise.race([decoder.flush(), failure]);
          } finally { if (decoder.state !== 'closed') decoder.close(); }
        }
        return evidence;
      } finally { input.dispose(); }
    }, `http://127.0.0.1:${media.address().port}/synthetic.mp4`);
    assert.equal(result.video, 'avc');
    assert.equal(result.audio, 'aac');
    assert.ok(ranges.length, 'The actual URL reader should request a partial response');
    assert.ok(origins.includes(new URL(harness.base).origin));
    if (result.colors.length) {
      const [[red, , blue], [redAfter, , blueAfter]] = result.colors;
      assert.ok(red > 200 && blue < 40 && redAfter < 40 && blueAfter > 200);
      t.diagnostic('Native H.264 decode verified with red and blue canvas samples');
    } else t.diagnostic('Native H.264 decoder unavailable; demux and cross-origin range checks still ran');
    if (result.peak !== null) {
      assert.ok(result.peak > 0.01);
      t.diagnostic('Native AAC decode verified with nonzero PCM');
    }
    else t.diagnostic('Native AAC decoder unavailable; demux and cross-origin range checks still ran');
  } finally {
    await harness.close();
    if (media.listening) await new Promise((resolve) => media.close(resolve));
  }
});
