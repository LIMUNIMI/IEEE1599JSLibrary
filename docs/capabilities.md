# Capability evidence

This is an early test record, not a supported-browser guarantee. Results apply
only to the stated environment and synthetic fixtures.

Pull requests and `main` run a browser smoke suite in Playwright Chromium,
Firefox and WebKit, plus the full browser integration suite in Chromium. Each
matrix run uploads a `browser-capabilities-<engine>` artifact
containing the user agent, synthetic WAV decode result, WebCodecs API presence,
and AVC/AAC configuration-query results where those APIs exist. Configuration
queries report decoder capability claims only; they do not prove that a
container demuxes or a particular real media file decodes. These browser
engines are not substitutes for Safari/iOS, Android or other real devices.

| Environment | Path | Evidence |
| --- | --- | --- |
| Windows 11 Education 10.0.26300, 64-bit; Microsoft Edge 157.0.4341.60 | XML | Native DOMParser parsed the synthetic subset fixture and the referenced DmITE XML; browser tests exercised malformed input, references and URL resolution. |
| Same | Buffered PCM WAV | Browser test decoded a synthetic 24 kHz mono 16-bit WAV with `decodeAudioData`, scheduled two instances, and observed completion. Audible output and drift were not measured. |
| Same | Score/controls | Browser interaction tests covered scaled hit testing, independent highlights, seeking and example playback. |
| Windows / Edge via Playwright | DmITE example | Browser tests used synthetic PCM for private folder loading, event-aligned recording switches, One Note and score following. The reference configuration and IEEE 1599 XML resolve to 1,032 indexed angle recordings across 43 instruments; real recordings were not exercised. |
| Same | La Catedral local derivatives | Browser tests decoded the supplied MP3 recordings through Web Audio and the converted H.264 MP4 through native WebCodecs, verified clock-relative frame presentation and tested canvas following and seek. This is not a measurement of speaker-to-display synchronization. |
| Same | Mediabunny adapter | Unit tests verify MP4/QuickTime-only input, URL and Blob sources, native decoder capability metadata, encoded packet access, abort/disposal, and parse-error cleanup. Actual browser codec and real-media support remain unverified. |
| Same; Playwright Chromium 159.0.8154.6 | Synthetic media probes | 0.1 s mono PCM WAV decoded (`AudioContext`, 48 kHz output); `VideoDecoder` and `AudioDecoder` are present; AVC baseline and AAC-LC configuration queries returned `supported: true`. No encoded video sample was decoded. |
| Same; Playwright Firefox 159.0 | Synthetic media probes | 0.1 s mono PCM WAV decoded (`AudioContext`, 48 kHz output); `VideoDecoder` and `AudioDecoder` are present; AVC baseline and AAC-LC configuration queries returned `supported: true`. No encoded video sample was decoded. |
| Same; Playwright WebKit 27.2 | Synthetic media probes | `AudioContext`, `VideoDecoder` and `AudioDecoder` were unavailable in this Windows Playwright build. This is not a claim about Safari on Apple devices. |
| All other browsers/devices | All paths | Unverified. Playwright Chromium/Edge does not establish Safari/iOS or Android support. |
| All browsers/devices | AAC, streaming audio, WebM video | Unverified or not implemented. No codec support claim. |

## Operational support

The [data model](data-model.md) represents and validates every element and
attribute of the IEEE 1599 DTD 1.0. That is **data coverage**. The table below
shows what the library actually **does** with each layer.

| Layer | Operational support | Not supported |
| --- | --- | --- |
| General | Read metadata; resolve `related_file` URLs. | Displaying related files or analog media. |
| Logic, Spine | Decode VTU/VPX positions and simultaneity; act as the backbone for all mappings. | Deriving media time from VTU (no tempo model). |
| Logic, LOS | Query symbols, staves, parts, voices and measures per event. | Engraving or rendering notation from the LOS; layout, agogics and symbol semantics beyond lookups. |
| Structural | Data access only. | Analysis, segmentation playback, Petri-net or MIR execution. |
| Notational | Raster or SVG score images with `graphic_event` rectangles: highlight, hit testing, page selection. | Notation instances (e.g. MusicXML/NIFF files) and `graphic_event` without rectangles. |
| Performance | Data access only; MIDI content kept as typed opaque `midi` subtrees (`doc.imports('midi')`), not validated. | MIDI, Csound or MPEG-4 synthesis and playback. |
| Audio | `track_event` times in seconds drive timelines; buffered Web Audio playback of decoded tracks. | Non-`seconds` `timing_type` values, `track_region` playback, streaming (see roadmap). |
| MP4/QuickTime containers | Optional Mediabunny adapter reports tracks, decoder config and native WebCodecs support, and yields encoded packets for the host's decoder. The synchronized-player wrapper can coordinate aligned video-view callbacks from the audio clock. | Library-owned container decoding/playback; video-only clocks; codecs not supported by the current browser; AVI, raw H.264 and non-MP4/MOV containers. |

`createSynchronizedMediaPlayer()` is an audio-clock-led integration layer for
an existing buffered audio group and aligned video-view callbacks. It
primes views for play and seek, delegates frame presentation to the host's
render loop, and pauses/rebuffers the whole audio group when a buffering-aware
view reports starvation. It is not a demuxer or WebCodecs decoder and does not
provide a video-only clock or automatic frame polling.

Validation was measured in Edge 157. `tests/fixtures/all-layers.xml` is valid.
The local La Catedral XML is valid, with one `doctype-system-id` warning. The
DmITE `da00d96` sample is invalid in strict mode because of literal
`<undefined>` elements (see [DmITE comparison](dmite-comparison.md)).

AudioWorklet streaming, media range handling, synthetic encoded-video decode,
video-only clocks and rebuffering against a real WebCodecs pipeline have not
been verified. No numeric performance, memory or synchronization budgets have
been established.
