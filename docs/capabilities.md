# Capability evidence

This is an early test record, not a supported-browser guarantee. Results apply
only to the stated environment and synthetic fixtures.

| Environment | Path | Evidence |
| --- | --- | --- |
| Windows 11 Education 10.0.26300, 64-bit; Microsoft Edge 157.0.4341.60 | XML | Native DOMParser parsed the synthetic subset fixture and the referenced DmITE XML; browser tests exercised malformed input, references and URL resolution. |
| Same | Buffered PCM WAV | Browser test decoded a synthetic 24 kHz mono 16-bit WAV with `decodeAudioData`, scheduled two instances, and observed completion. Audible output and drift were not measured. |
| Same | Score/controls | Browser interaction tests covered scaled hit testing, independent highlights, seeking and example playback. |
| Same | La Catedral local derivatives | Browser tests decoded the supplied MP3 recordings through Web Audio and the converted H.264 MP4 through native WebCodecs, verified clock-relative frame presentation and tested canvas following and seek. This is not a measurement of speaker-to-display synchronization. |
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

Validation was measured in Edge 157. `tests/fixtures/all-layers.xml` is valid.
The local La Catedral XML is valid, with one `doctype-system-id` warning. The
DmITE `da00d96` sample is invalid in strict mode because of literal
`<undefined>` elements (see [DmITE comparison](dmite-comparison.md)).

AudioWorklet streaming, media range handling, video-only clocks and
general-purpose mixed-media synchronization have not been verified. No numeric
performance, memory or synchronization budgets have been established.
