# Score and playback integration

Load the document once, project the player data, and build one timeline per
recording. A Spine ID bridges the recording and the score; the Spine's VTU
positions are not media seconds.

```js
import { createBufferedAudioPlayer, createPlayerProjection, createTimeline,
  loadIEEE1599Document } from '../src/index.js';
import { createScoreView } from '../src/ui/score-view.js';

const doc = await loadIEEE1599Document('./piece.xml');
const { spine, graphicInstances, audioTracks } = createPlayerProjection(doc);
const track = audioTracks[0]; // Choose an indexed, audio-only recording.
const timeline = createTimeline(spine.map(({ id }) => id), track.events);
const player = createBufferedAudioPlayer();
const buffer = await player.loadAudio(track.url);
player.addAudio(buffer, { id: 'performance' });
const score = createScoreView({
  container: document.querySelector('#score'),
  page: graphicInstances[0].pages[0],
  onSeek: (id) => player.seek(timeline.resolve(id).time)
});
```

Wire `play()` to a user gesture and handle its rejection. `pause()` preserves
position; `seek(0)` after pausing rewinds, including any lead-in. Playback
restarts from zero after it ends. Use `player.currentTime` with
`timeline.eventsAt()` to drive `score.highlight()`; render on animation frames
but never use them as the playback clock. Listen for `statechange`,
`positionchange`, and `error` for command and lifecycle updates; position events
are not a continuous media clock. Dispose the view and `await player.dispose()`
when leaving the player. Abort outstanding loads with an `AbortSignal`.

For long recordings, the experimental [streaming API](streaming.md) offers a
bounded single-track native-rate backend. For paging, zoom, keyboard access,
IIIF image sources or an embeddable player, see the [score UI guide](score-ui.md).

The projection only uses track indexes in seconds and score rectangles in
pixels. Other indexes and pages remain in the full document model; the
projection skips them and records `warnings`. Legacy pages with no unit are
interpreted as pixels by the lenient projection, but strict DTD validation
requires that attribute. Missing offsets and explicit `null` values are both
treated as absent; tokenized Spine references are normalized as in the model.

## Groups and alternate performances

| Scenario | Approach |
| --- | --- |
| One recording | Add one decoded buffer before playing. |
| Several recordings with already aligned time | Add them to the same player. Supply `offset` for delayed starts. All required sources share one clock; the last required source determines the end. |
| Alternate performances of one score | Keep separate timelines. Find the current event in the old recording and resolve it on the new one; sparse mappings use the nearest earlier mapped event in Spine order, then the first later one. |

### Aligned video views

The library can coordinate presentation callbacks for video views that already
share the audio timeline's zero and playback rate. It does not open a container
or decode frames here; use a read-only adapter such as the optional
Mediabunny adapter and provide a view with `seek(seconds)` and
`present(seconds)`:

```js
import { createSynchronizedMediaPlayer } from '../src/index.js';

const synchronized = createSynchronizedMediaPlayer({
  audio: player,
  videos: [{ seek: (time) => videoView.seek(time), present: (time) => videoView.present(time) }]
});
await synchronized.play();       // primes the video view before audio starts
await synchronized.seek(12.5);   // remains playing if it was playing
await synchronized.present();    // call from the host's animation/render loop
```

The audio player remains the required clock and determines duration/end.
Views are disposed with the synchronized player. A view may also provide
`isBuffering(seconds)` and `whenReady()`; while that view is starved, the
player pauses the entire audio group, waits for recovery, and rechecks every
view after presenting the frozen frame before it resumes. `whenReady()` must
wait until its view is no longer buffering or reject. Seek and presentation batches
are ordered; a running callback must settle before a newer batch can update
the views. Superseded queued work is skipped. Seeking to the duration does
not restart audio; an explicit Play at the end starts it again. The host owns
the render loop. The synchronized player forwards `statechange`,
`positionchange`, and `error` events, and its `state` reports video rebuffering,
so `createTransportControls({ container, player: synchronized })` can bind to
it directly. Video-only playback and per-video offsets/rates are not part of
this initial contract.

Use `setGain(id, gain)` (linear, `0` mutes), `setPan(id, pan)` (`-1` to `1`
for mono or stereo), and `setRate(rate)` (speed and pitch change together).
An injected AudioContext is host-owned. Disposal clears the player's decoded
buffers and closes only an internally created context. Buffers are fully decoded in memory, so load only what
the application can retain. Check `player.diagnostics.snapshot()` for bounded
structured diagnostics; use `diagnostics: { verbose: true }` for more detail.

See the [capability record](capabilities.md) for verification and limitations,
and the [migration guide](migration.md) for replacements for legacy player APIs.

## Optional MP4 and QuickTime demuxing

The package root does not load Mediabunny. Applications that need MP4/MOV
packet access can use the optional adapter subpath and pass the module in:

```js
import { openMediabunnyInput } from 'ieee1599jslibrary/adapters/mediabunny';

const media = await openMediabunnyInput({
  mediabunny: await import('mediabunny'),
  source: './performance.mov',
  signal: new AbortController().signal
});
const video = media.tracks.find((track) => track.type === 'video');
if (!video?.canDecode || !video.decoderConfig) {
  media.dispose();
  throw new Error('This browser cannot decode the video track');
}
const decoder = new VideoDecoder({ output: presentFrame, error: reportDecoderError });
decoder.configure(video.decoderConfig);
// Feed video.packets.packets(startPacket, endPacket) to VideoDecoder.
// The application owns the WebCodecs decoder and shared transport clock.
```

For a bundled application, install Mediabunny explicitly with
`pnpm add mediabunny`; the adapter declares it as an optional `^1.66.1` peer
dependency. A plain browser page can serve the Mediabunny ESM bundle locally
and map the specifier with an import map:

```html
<script type="importmap">
  { "imports": { "mediabunny": "./vendor/mediabunny.mjs" } }
</script>
```

In either setup, pass the loaded module to `openMediabunnyInput`; the library
does not bundle Mediabunny or load it from a CDN itself. Alternatively, apps
can pass a module they already imported or assembled. This keeps the core
importable without Mediabunny and leaves version choice and security updates
with the application.

The adapter reads only MP4 and QuickTime containers and exposes decoder
configuration, browser decode support and encoded packet access. It does not
convert, encode or write media. Dispose the returned input when finished;
aborting the supplied signal disposes it and cancels outstanding reads.
Containers or codecs unsupported by Mediabunny or the browser fail explicitly.
