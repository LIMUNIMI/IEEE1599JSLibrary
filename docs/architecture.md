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
| Open | Public API, command/event names and state transitions; AudioContext ownership/sharing; sparse and unmapped score-event switching. |
| Open | Demuxer and distribution, codec profiles and actual browser support, per-application numeric budgets, streamed PCM resampling and transport, video-only clock and end-of-source behavior. |
| Open | Diagnostic defaults, retention limits and exact diagnostic API. |

Do not silently promote proposals to decisions. Seek user approval for
material open contracts and add the answer here before implementing them.
