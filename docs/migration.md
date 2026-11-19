# Migration guide (early implementation)

This library introduces a new API. It does not modify DmITE or provide legacy
compatibility. Streaming audio, general-purpose video and mixed-media
transport, track crossfades and a complete browser/codec support matrix are
not implemented. The [La Catedral example](../examples/la-catedral/README.md)
shows one application-specific WebCodecs video adapter synchronized with a
predecoded soundtrack and an IEEE 1599 score.

| Legacy responsibility | Current replacement |
| --- | --- |
| `IEEE1599Document` synchronous XML and global helpers | `loadIEEE1599()` or `parseIEEE1599()` from `src/xml/parse.js`; explicit normalized data and warnings. |
| `MXPlayer` transport and audio scheduling | `createBufferedAudioPlayer()` from `src/media/buffered-audio.js`; applications load and add decoded instances, then use its transport. |
| `MXMedia` track timing lookups | `createTimeline()` from `src/core/timeline.js`; mappings use seconds and spine order. |
| `MXGraphics` score interaction | Optional `createScoreView()` from `src/ui/score-view.js`; applications resolve its event ID to a target performance time. |
| Page-specific controls | Optional `createTransportControls()` from `src/ui/transport-controls.js`, or host-owned controls. |

Use native ES modules and serve the repository over HTTP or HTTPS. Open
`examples/index.html` via that server. Audio activation may require a user
gesture. An injected AudioContext is never closed or suspended by the player;
an internally created one is closed on disposal. A media URL must be resolved
against an explicit base URL when parsing XML directly. The parser does not
validate the IEEE 1599 DTD and reports unsupported element names.

For one recording, decode it with `player.loadAudio(url)` and add it with
`player.addAudio(buffer, { id })`. For a synchronized group, decode each
already-aligned recording, add all of them to the **same** player before
calling `play()`, and supply an `offset` where a member starts later on that
group clock. Do not group alternate performances on the assumption that
their timestamps align. Use the score-event timeline to switch between them.

Set panning per mono or stereo instance with `addAudio(buffer, { id, pan })`,
or change it during playback with `player.setPan(id, pan)`.
The native Web Audio range is `-1` (left) to `1` (right). The default `0`
centers mono and preserves the left and right channels of stereo. Pan is
independent of gain and persists through seeks and pause/resume. Sources with
more than two channels retain their existing routing and reject nonzero pan.

The browser tests use the locally installed Microsoft Edge by default. Set
`BROWSER_EXECUTABLE_PATH` to an installed Chromium-compatible browser executable
to run them elsewhere. A successful automated browser test is not a claim of
Safari, iOS, Android or codec-profile support.
