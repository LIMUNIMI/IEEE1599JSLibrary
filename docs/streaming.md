# Bounded native streaming audio

`createStreamingAudioPlayer()` is an **experimental, single-track** alternative
to fully decoding a long recording with `createBufferedAudioPlayer()`. It uses
native `AudioDecoder` output and an `AudioWorklet`, not `<audio>`, media-element
fallback, or a software decoder. The core remains dependency-free.

Try the [synthetic streaming example](../examples/streaming/index.html) with
`pnpm run serve`. It generates PCM packets on demand; no private assets or
encoder are involved. A supported `AudioDecoder`, AudioWorklet and a secure
context (HTTPS or localhost) are required. The transport controls report
unsupported capabilities instead of selecting another playback architecture.

## Initial scope

This is a deliberately constrained implementation, **not a resolution of the
open streaming architecture decisions**. It supports one mono/stereo track
per player, at native speed and the track's sample rate. An owned AudioContext
requests that rate; an injected context with another rate is rejected.
Resampling, variable-rate streaming, pitch preservation and multiple aligned
streaming audio instances remain deferred. Buffered playback retains its
existing groups, gain, pan and rate controls.

The transport provides `play()`, `pause()`, asynchronous `seek(seconds)`,
`dispose()`, `state`, `currentTime`, `duration`, diagnostics, and
`statechange`/`positionchange`/`error` events. Time is derived from audio
rendering and the AudioContext, never from animation frames or wall timers.
Native starvation freezes media time, outputs silence, and resumes only when
PCM is ready. Context interruption similarly freezes playback. Injected
contexts are neither suspended nor closed.

Use the streaming player as the `audio` clock of
`createSynchronizedMediaPlayer()` to align video views. This does **not** make
several independent streaming audio players a synchronized group.

## Supplying packets

The host provides an abortable, fresh async iterator of `EncodedAudioChunk`s
for every seek/restart. It must start at or before the requested media time
with enough decoder preroll, in decode order. PCM before the seek target is
trimmed. This first backend flushes each packet to bound decoder output and
requires key audio packets; delta-dependent audio packet sequences are
rejected. Track duration must be finite and accurate.

For MP4/MOV audio, the existing **optional read-only Mediabunny adapter** can
provide packets. It never writes, encodes, converts or remuxes a file:

```js
import { createStreamingAudioPlayer } from 'ieee1599jslibrary';
import { openMediabunnyInput } from 'ieee1599jslibrary/adapters/mediabunny';

const input = await openMediabunnyInput({
  mediabunny: await import('mediabunny'),
  source: './performance.m4a'
});
const track = input.tracks.find((item) => item.type === 'audio');
if (!track?.canDecode || !track.decoderConfig || !track.duration) {
  input.dispose();
  throw new Error('No supported native audio track');
}
const player = await createStreamingAudioPlayer({
  bufferSeconds: 2,
  track: {
    decoderConfig: track.decoderConfig,
    duration: track.duration,
    async *chunks(seconds, signal) {
      // Preroll requirements are codec-specific. Choose them for your source.
      let packet = await track.packets.getPacket(Math.max(0, seconds - 0.1));
      while (packet) {
        signal.throwIfAborted();
        yield new EncodedAudioChunk({
          type: packet.type,
          timestamp: Math.round(packet.timestamp * 1_000_000),
          duration: Math.round(packet.duration * 1_000_000),
          data: packet.data
        });
        packet = await track.packets.getNextPacket(packet);
      }
    }
  }
});
// In a user-gesture handler:
await player.play();
// On leaving the application:
await player.dispose();
input.dispose(); // Container input is owned by the host, not the player.
```

The packet reader remains host-owned. Its fetches, range support, cancellation,
and network cache budget must be managed separately; a reader ignoring the
abort signal can keep an outstanding request alive after a transport seek.
The adapter example checks the signal between reads, not inside an in-flight
Mediabunny read. Dispose the input to cancel its outstanding I/O when leaving.
HTTP servers must provide the CORS and range behavior the reader needs.

## Memory limits and evidence

`bufferSeconds` (default 2; 0.5-30) bounds queued/in-flight transferable PCM
sample frames per channel. `bufferedFrames` reports outstanding frames and
`capacity` the configured ceiling. Each decoded packet must fit within half
the capacity; otherwise playback reports an error. `maxPacketBytes` (default
1 MiB) limits each encoded input chunk. Only one packet is submitted to the
native decoder at a time; backpressure stops packet iteration when the PCM
queue exceeds half capacity.

These are **queue limits**, not total-process-memory guarantees. A native
decoder temporarily owns its output; copying a packet to transferable planes,
codec internals, the source iterator, demuxer caches and the browser graph
consume additional memory. An oversized decoded packet is rejected once its
size is known and immediately closed.

Synthetic browser tests actually decode PCM with `AudioDecoder`, observe its
signal in the native graph, verify backpressure, seek, starvation/recovery and
cleanup. They do not prove AAC/MP3 streaming, real-device memory usage,
speaker/display synchronization or Safari/iOS support. No general codec or
mobile support claim is made.
