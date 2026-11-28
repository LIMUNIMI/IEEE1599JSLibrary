# Capability evidence

This is an early test record, not a supported-browser guarantee. Results apply
only to the stated environment and synthetic fixtures.

Pull requests and `main` run a browser smoke suite in Playwright Chromium,
Firefox and WebKit, plus the full browser integration suite in Chromium. Each
matrix run uploads a `browser-capabilities-<engine>` artifact
containing the user agent, synthetic WAV decode result, audio-clock progress
after a user gesture, WebCodecs API presence, and AVC/AAC configuration-query
results where those APIs exist. Configuration
queries report decoder capability claims only; they do not prove that a
container demuxes or that a particular file decodes. A separate browser test
reads a synthetic MP4 across two HTTP origins, checks partial responses, and
validates decoded H.264 pixels and AAC PCM when native codecs are available.
These browser engines are not substitutes for Safari/iOS or Android.

| Environment | Path | Evidence |
| --- | --- | --- |
| Windows 11 Education 10.0.26300, 64-bit; Microsoft Edge 157.0.4341.60 | XML | Native DOMParser parsed the synthetic subset fixture and the referenced DmITE XML; browser tests exercised malformed input, references and URL resolution. |
| Same | Buffered PCM WAV | Browser test decoded a synthetic 24 kHz mono 16-bit WAV with `decodeAudioData`, scheduled two instances, and observed completion. Audible output and drift were not measured. |
| Same | Score/controls | Browser interaction tests covered scaled hit testing, independent highlights, seeking and example playback. |
| Windows / Edge via Playwright | DmITE example | Browser tests used synthetic PCM for private folder loading, event-aligned recording switches, One Note and score following. The reference configuration and IEEE 1599 XML resolve to 1,032 indexed angle recordings across 43 instruments; real recordings were not exercised. |
| Same | La Catedral local derivatives | Browser tests decoded the supplied MP3 recordings through Web Audio and the converted H.264 MP4 through native WebCodecs, verified clock-relative frame presentation and tested canvas following and seek. This is not a measurement of speaker-to-display synchronization. |
| Windows / Edge 158, Playwright Chromium 159.0.8154.6 and Firefox 159.0 | Synthetic media probes | A 0.1 s mono WAV decoded at 48 kHz and the output clock advanced. The cross-origin MP4 test observed HTTP ranges, red and blue native H.264 frames, and nonzero native AAC PCM. This is not a claim about arbitrary MP4 files, devices or codecs. |
| Windows / Playwright WebKit 27.2 | Synthetic media probes | Cross-origin MP4 demuxing and partial responses worked; `AudioContext`, `VideoDecoder` and `AudioDecoder` were unavailable. This is not a claim about Safari on Apple devices. |
| Windows / Edge 158 and Playwright Firefox 159 | Native streaming PCM | Synthetic 48 kHz mono float PCM actually decoded through AudioDecoder and played through AudioWorklet; native analyser observed a nonzero signal. Tests verify queue backpressure, native-rate seek/preroll, starvation/recovery, pause during pending startup and context ownership. No compressed-audio/mobile claim. |
| Same | Score UI, IIIF and embedding | Synthetic Image API 2/3 services verify full-image coordinate mapping and click-to-seek with reduced responses. Tests cover pager, zoom, theme variables, event cursor, keyboard navigation, lazy audio loading, isolated custom elements and disposal/reconnect. No real institutional server or screen-reader certification. |
| All other browsers/devices | All paths | Unverified. Playwright Chromium/Edge does not establish Safari/iOS or Android support. |
| All browsers/devices | General compressed-file streaming, WebM video | Unverified. A standalone AAC decoder result does not establish streaming support. |

The streaming fixtures use `pcm-f32`. A local Firefox 159 raw `pcm-s16`
probe reported configuration support but returned misinterpreted/non-finite
samples; it is not considered verified streaming support. The transport
rejects non-finite decoder output. This does not change buffered WAV decoding
through `decodeAudioData()`, which is tested separately.

## Before deploying to physical devices

Repeat on desktop Safari, iPhone/iPad Safari and Android Chrome over HTTPS.
Record device, OS, browser build, source formats, sample rate and whether
audio activates on a tap. Use the [streaming example](../examples/streaming/index.html)
to test play, pause, seeking to the end, restart, and foreground recovery.
On your own player, throttle a permitted MP4 source, inspect CORS and `206`
responses, then seek across two known visual or musical landmarks. On your
IIIF host, check that `info.json` is readable from the player origin and
that the same rectangle selects the same event before and after zooming.
Record failures separately for fetch, decoder configuration, actual decoded
output and output-clock progression. Keep private materials local.

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
| Notational | Raster/SVG and IIIF Image API 2/3 full-image sources with `graphic_event` rectangles: highlight, hit testing, pager, zoom, event cursor and keyboard navigation. | IIIF Presentation/tiled deep zoom; notation instances (e.g. MusicXML/NIFF files); `graphic_event` without rectangles. |
| Performance | Data access only; MIDI content kept as typed opaque `midi` subtrees (`doc.imports('midi')`), not validated. | MIDI, Csound or MPEG-4 synthesis and playback. |
| Audio | `track_event` times in seconds drive timelines; buffered Web Audio groups; experimental single-track native-rate AudioDecoder/AudioWorklet streaming from host-supplied key audio packets. | Non-`seconds` `timing_type` values, `track_region` playback; streamed resampling/rate changes or aligned streaming audio groups. |
| MP4/QuickTime containers | Optional Mediabunny adapter reports tracks, decoder config and native WebCodecs support, and yields encoded packets for the host's decoder. The synchronized-player wrapper can coordinate aligned video-view callbacks from the audio clock. | Library-owned container decoding/playback; video-only clocks; codecs not supported by the current browser; AVI, raw H.264 and non-MP4/MOV containers. |

`createSynchronizedMediaPlayer()` is an audio-clock-led integration layer for
an existing buffered audio group or single streaming clock and aligned video-view callbacks. It
primes views for play and seek, delegates frame presentation to the host's
render loop, and pauses/rebuffers the whole audio group when a buffering-aware
view reports starvation. It is not a demuxer or WebCodecs decoder and does not
provide a video-only clock or automatic frame polling.

Validation was measured in Edge 157. `tests/fixtures/all-layers.xml` is valid.
The local La Catedral XML is valid, with one `doctype-system-id` warning. The
DmITE `da00d96` sample is invalid in strict mode because of literal
`<undefined>` elements (see [DmITE comparison](dmite-comparison.md)).

The synthetic range test does not establish behavior on every CDN or with
large files, and no speaker-to-display drift or real-device memory budgets
have been measured. Video-only clocks are out of scope. The Ubuntu Firefox
audio-device configuration must still be verified by the hosted CI run.
