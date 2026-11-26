# Getting started

The library is native JavaScript ES modules, with no runtime npm dependencies.
Serve it over HTTP on localhost or HTTPS. Import `src/index.js` by a relative
URL when serving a checkout; `ieee1599jslibrary` is the package entry point
when a host resolves package names. The package is currently private and is
not published to npm. Optional UI lives in separate modules. If you want a
player for your own IEEE 1599 material rather than an API tour, follow
[Build your own player](build-your-player.md).

## Choose the data API

| Need | Starting point |
| --- | --- |
| Full IEEE 1599 model, validation, Spine, LOS, references or serialization | `loadIEEE1599Document(url)` and the [data model guide](data-model.md). |
| Metadata, score images and timed tracks for a player | `loadIEEE1599(url)`, or `createPlayerProjection(doc)` when you already have the full model. |
| Look up events at a recording time or switch performances by score location | `createTimeline(spineIds, track.events)`. |
| Build an audio player | `createBufferedAudioPlayer()` and the [playback guide](playback.md). |
| Stream a long recording with native decoding and bounded PCM | Experimental `createStreamingAudioPlayer()` and the [streaming guide](streaming.md). |
| Show score rectangles or transport controls | `createScoreView()` and `createTransportControls()` from `src/ui/`. |
| Page/zoom/follow scores, use IIIF images, or embed a player | `createScorePager()`, `defineIEEE1599Player()` and the [score UI guide](score-ui.md). |

The model covers all six DTD layers. That does not imply playback, synthesis
or rendering of every layer; see [operational support](capabilities.md#operational-support).
The full model defaults to strict validation. In `strict: false` mode inspect
`doc.issues` before deciding whether to proceed. The projection independently
rejects invalid data it needs for playback.

## Run the examples

From the checkout root, start the dependency-free local server with
`node tools/serve.js` (or `pnpm run serve`); it listens on
`http://127.0.0.1:8000/` only. Open the following from that
server, not from `file://`:

- [Minimal player](../examples/index.html): synthetic sound, a score and the
  optional UI. No external assets needed.
- [Starter player](../examples/starter/index.html): a commented template for
  your own document, score pages and recordings; see
  [Build your own player](build-your-player.md).
- [Document inspector](../examples/inspector/index.html): inspect a local XML
  document, findings and event links, without loading recordings.
- [Embeddable player](../examples/embed/index.html): optional custom element
  for your own IEEE 1599 document, normal/IIIF score images and buffered audio.
- [Streaming probe](../examples/streaming/index.html): bounded native
  AudioDecoder/AudioWorklet playback with generated PCM packets.
- [DmITE](../examples/dmite/README.md): choose a private folder with XML, WAV
  recordings and score images; no upload needed.
- [La Catedral](../examples/la-catedral/README.md): audio and example-only
  WebCodecs video, with local media preparation and an optional demuxer.

For project tooling and deployment, see [building the docs](publishing.md).
