import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { openMediabunnyInput } from '../src/adapters/mediabunny.js';

function fakeMediabunny({ tracks = [], failTracks = false } = {}) {
  const state = { options: undefined, disposed: 0, packetSinkTrack: undefined };
  class Input {
    constructor(options) { state.options = options; }
    async getMimeType() { return 'video/mp4; codecs="avc1.640028"'; }
    async getTracks() {
      if (failTracks) throw new Error('Invalid MP4');
      return tracks;
    }
    dispose() { state.disposed++; }
  }
  class UrlSource {
    constructor(url) { this.url = url; }
  }
  class BlobSource {
    constructor(blob) { this.blob = blob; }
  }
  class EncodedPacketSink {
    constructor(track) { state.packetSinkTrack = track; }
    async getPacket(timestamp) { return { timestamp }; }
    async getKeyPacket(timestamp) { return { timestamp, type: 'key' }; }
    async getNextPacket(packet) { return { timestamp: packet.timestamp + 1 }; }
    async *packets(startPacket, endPacket) {
      yield { startPacket, endPacket, timestamp: 0 };
    }
  }
  return {
    state,
    module: { Input, UrlSource, BlobSource, EncodedPacketSink, MP4: {}, QTFF: {} }
  };
}

function fakeTrack(type = 'video') {
  return {
    type,
    async getCodec() { return type === 'video' ? 'avc' : 'aac'; },
    async getDecoderConfig() { return { codec: type === 'video' ? 'avc1.640028' : 'mp4a.40.2' }; },
    async canDecode() { return true; },
    async getDurationFromMetadata() { return 12.5; }
  };
}

test('opens only MP4 and QuickTime, exposes native decoder support and read-only packets', async () => {
  const track = fakeTrack();
  const { module, state } = fakeMediabunny({ tracks: [track, { type: 'subtitle' }] });
  const opened = await openMediabunnyInput({ mediabunny: module, source: 'https://media.test/take.mov' });

  assert.equal(opened.mimeType, 'video/mp4; codecs="avc1.640028"');
  assert.equal(opened.tracks.length, 1);
  assert.equal(opened.tracks[0].codec, 'avc');
  assert.equal(opened.tracks[0].canDecode, true);
  assert.equal(opened.tracks[0].duration, 12.5);
  assert.equal(opened.tracks[0].sourceTrack, track);
  assert.equal(state.options.source.url, 'https://media.test/take.mov');
  assert.deepEqual(state.options.formats, [module.MP4, module.QTFF]);
  assert.equal(state.packetSinkTrack, track);
  assert.deepEqual(await opened.tracks[0].packets.getKeyPacket(4), { timestamp: 4, type: 'key' });
  const packets = opened.tracks[0].packets.packets();
  assert.deepEqual(await packets.next(), {
    done: false,
    value: { startPacket: undefined, endPacket: undefined, timestamp: 0 }
  });
  assert.equal(Object.isFrozen(opened.tracks), true);

  opened.dispose();
  opened.dispose();
  assert.equal(state.disposed, 1);
  await assert.rejects(opened.tracks[0].packets.getPacket(0), /disposed/);
});

test('preserves unsupported native codec results for the application to report', async () => {
  const track = fakeTrack();
  track.canDecode = async () => false;
  const { module } = fakeMediabunny({ tracks: [track] });
  const opened = await openMediabunnyInput({ mediabunny: module, source: 'https://media.test/unsupported.mp4' });
  assert.equal(opened.tracks[0].canDecode, false);
  opened.dispose();
});

test('accepts local Blob sources and disposes when its signal aborts', async () => {
  const { module, state } = fakeMediabunny({ tracks: [fakeTrack()] });
  const controller = new AbortController();
  const opened = await openMediabunnyInput({
    mediabunny: module,
    source: new Blob(['media']),
    signal: controller.signal
  });
  assert.equal(state.options.source.blob.size, 5);
  controller.abort();
  assert.equal(state.disposed, 1);
  await assert.rejects(opened.tracks[0].packets.getPacket(0), /disposed/);
});

test('disposes the input and preserves parse failures', async () => {
  const { module, state } = fakeMediabunny({ failTracks: true });
  await assert.rejects(
    openMediabunnyInput({ mediabunny: module, source: 'https://media.test/bad.mp4' }),
    /Invalid MP4/
  );
  assert.equal(state.disposed, 1);
});

test('rejects invalid module and source inputs', async () => {
  await assert.rejects(openMediabunnyInput({ mediabunny: {}, source: 'file.mp4' }), /compatible Mediabunny/);
  const { module } = fakeMediabunny();
  await assert.rejects(openMediabunnyInput({ mediabunny: module, source: 42 }), /URL or Blob/);
});

test('accepts the installed Mediabunny module and rejects non-MP4/QuickTime data', async () => {
  const mediabunny = await import('mediabunny');
  await assert.rejects(openMediabunnyInput({
    mediabunny,
    source: new Blob([new Uint8Array([0, 1, 2, 3])])
  }));
});

test('adapter code imports no package and accesses no conversion, playback or encoding APIs', async () => {
  const source = await readFile(new URL('../src/adapters/mediabunny.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s+.*from\s+['"]mediabunny['"]/m);
  assert.doesNotMatch(source, /mediabunny\.(?:Conversion|Output|AudioBufferSink|AudioSampleSink|VideoSampleSink|CanvasSink|AudioBufferSource|AudioSampleSource|VideoSampleSource|CanvasSource|registerEncoder|registerDecoder|canEncode\w*)\b/);
});
