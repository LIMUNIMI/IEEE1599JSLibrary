# Migration guide (early implementation)

This library introduces a new API. It does not modify DmITE or provide legacy
compatibility. Streaming audio, video, mixed-media synchronization, track
crossfades and a complete browser/codec support matrix are not implemented.

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

The browser tests use the locally installed Microsoft Edge by default. Set
`BROWSER_EXECUTABLE_PATH` to an installed Chromium-compatible browser executable
to run them elsewhere. A successful automated browser test is not a claim of
Safari, iOS, Android or codec-profile support.
