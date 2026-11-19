# Architecture and decision log

## Confirmed constraints

The [brief](modernization.md) records the user's confirmed decisions. Core
logic is headless and has no runtime dependencies; browser media adapters use
Web Audio and WebCodecs without HTML media playback fallback. Optional UI is
framework-free. Media instances and views are independent of asset identity.
Different performance timelines switch by score event, not continuous
time-stretching; aligned timed media share a clock and rebuffer as a group.

## Proposed component boundaries

These boundaries were approved as the roadmap's decomposition, not as final
public API contracts.

| Area | Responsibility |
| --- | --- |
| `src/core/` | Normalized document, indexes, explicit timelines, transport state and identity; no DOM or decoding. |
| `src/xml/` | Async fetch, native DOMParser extraction, semantic validation and base-URL resolution; no synchronous requests or DTD downloads. |
| `src/media/` | Capability checks, loading, audio/video backends and shared transport integration; no page-specific controls or fallback media elements. |
| `src/adapters/` | Optional isolated demux integrations. |
| `src/ui/` | Optional score views, video sinks and controls; no XML semantics or independent media clocks. |
| `src/diagnostics/` | Per-player structured records, optional console sink and bounded snapshots; no global singleton or raw media dumps. |
| `tests/`, `examples/`, `docs/` | Behavior verification, synthetic fixtures, integration examples and contributor guidance. |

The core must import without browser globals, creating an AudioContext, workers,
or importing a demuxer. Separate media-local time, score positions and
transport time. Never use polling or animation frames as transport authority.
Group pause must not suspend an AudioContext shared by unrelated players.

## Decision log

| Status | Decision |
| --- | --- |
| Confirmed | D01-D14 in the [brief](modernization.md). |
| Proposed | One synchronized group per player; readiness barrier and common scheduled start; decoded-video queues bounded; streaming audio via AudioDecoder and AudioWorklet. |
| Confirmed | Buffered-audio players create an AudioContext by default; hosts may inject one to share. Pausing one group must not suspend a shared context. |
| Confirmed | Initial transport commands are `play()`, `pause()`, `seek(seconds)`, `setRate(rate)`, and `dispose()`; events are `statechange`, `positionchange`, and `error`; states include `paused`, `playing`, `buffering`, `ended`, `error`, and `disposed`. Further media-specific contracts remain open. |
| Confirmed | Initial document API exposes `parseIEEE1599(xml, { baseURL })` and `loadIEEE1599(url, { signal })`; normalized data includes metadata, ordered spine events, graphic instances and audio tracks. Malformed or inconsistent supported data is rejected; it is not a full DTD validator. |
| Confirmed | Ignore unsupported XML elements, but report their presence in parser warnings. |
| Confirmed | At a missing target-performance timestamp, switch to the nearest earlier mapped score event; if none exists, use the first later mapped event. |
| Confirmed | A synchronized group with unequal audio durations ends when its last required instance ends; earlier instances become silent. |
| Confirmed | `createBufferedAudioPlayer({ context })` returns an EventTarget with the agreed transport methods and `currentTime`/`state` getters. An omitted context is owned and closed on disposal; an injected context is not. |
| Confirmed | `loadAudio(url, { signal })` fetches and fully decodes; `addAudio(buffer, { id, offset, gain, required })` adds an independent instance before playback. Offset is the instance start on the shared transport. At least one required instance is needed to play; optional instances do not extend the group end. |
| Confirmed | `setGain(instanceId, gain)` uses nonnegative linear gain, including zero for mute. Seeking beyond the group end clamps to the end and enters `ended`; `play()` after ending restarts from the beginning. |
| Confirmed | Retain the latest 200 warnings/errors by default and enable their console output; verbose diagnostics are opt-in and retention is configurable per player. |
| Confirmed | Buffered players expose `diagnostics` with `log`, `snapshot` and `clear`, and accept `diagnostics: { capacity, verbose, console }` options. |
| Confirmed | Optional UI exposes `createScoreView({ container, page, onSeek })` with `highlight(eventRefs)` and `dispose()`, and `createTransportControls({ container, player })` with `dispose()`. Score clicks report event IDs; applications map them to performance time. |
| Confirmed (La Catedral example only) | Use local TIFF-to-PNG and AVI-to-H.264 MP4 derivatives with a separate copy of the AVI's original MP3 soundtrack. The example uses Mediabunny to read MP4 through native WebCodecs; this does not select a general-purpose demuxer. Publish code and instructions only, not the supplied files or derivatives. |
| Confirmed (La Catedral example only) | Stop pauses and rewinds to the selected recording's time zero, including any lead-in before the first score event. |
| Open | Demuxer and distribution, codec profiles and actual browser support, per-application numeric budgets, streamed PCM resampling and transport, video-only clock and other group readiness/end rules. |
| Open | Additional public media, model and event contracts. |

Do not silently promote proposals to decisions. Seek user approval for
material open contracts and add the answer here before implementing them.
