# Modernization roadmap

This is the approved execution sequence. Confirmed decisions and unresolved
questions are in the [brief](modernization.md) and [decision log](architecture.md).
Milestones may proceed only where their contracts are already confirmed.

The requirements milestone is complete. The complete IEEE 1599 DTD data model
(all six layers, Spine, LOS, validation, serialization) is implemented under
milestone 4; see the [data model guide](data-model.md). Structural/Performance
semantics remain open. Page navigation and One Note playback are implemented
in the [DmITE example](../examples/dmite/README.md), not the packaged
library (see the [DmITE comparison](dmite-comparison.md)). The first
audio-clock-led transport API and cross-browser CI probes are implemented.
Release artifacts and TypeScript declarations are generated, but no npm
publication is enabled. Experimental single-track native-rate streaming,
score pager/zoom/cursor, optional embedding and IIIF Image API sources are
implemented; see [streaming](streaming.md) and [score UI](score-ui.md).
Streaming groups/resampling, a library-owned video backend, strict
recovery across every media backend, mobile device evidence and a complete
release gate remain open.

1. **Preserve requirements:** establish the agent entry point, brief,
   architecture/decision log and roadmap.
2. **Media/browser feasibility:** build small native buffered audio,
   WebCodecs video, streaming audio/AudioWorklet and common-clock probes with
   synthetic or licensed fixtures. The initial CI probe covers generated WAV
   decode and WebCodecs configuration queries in Chromium, Firefox and WebKit;
   it does not yet decode synthetic video or establish Safari/iOS support.
   Verify the selected Mediabunny adapter for
   formats, seeks, ranges, bounded memory, worker support, maintenance and
   licensing.
   Record exact browser, device and codec evidence; Playwright WebKit is not
   proof of Safari/iOS support.
3. **Resolve contracts and budgets:** ask the user about demuxing, API and
   context ownership, timelines, readiness/end rules, streaming, diagnostics
   and per-application numeric expectations. Record the decisions and make
   agreed budgets executable.
4. **Document and headless logic:** introduce JavaScript modules and JSDoc
   checking, normalized model, spine/logical/graphic/audio indexes, timeline
   mappings, explicit errors and async browser XML parsing. Test optional
   layers, malformed input, sparse mappings, simultaneous/zero timestamps and
   base URLs. DTD validity is checked against the vendored DTD by the model,
not by `DOMParser`; a generated inventory gates coverage in `pnpm test`.
5. **Predecoded Web Audio:** implement complete preload/readiness, independent
   instances, shared scheduling, seek, native varispeed, gain and lifecycle.
   Test actual browser decoding, scheduling, activation and command races.
6. **Bounded media backends:** implement optional demux integration,
   backpressure, seek/generation handling, streaming audio and WebCodecs
   video. The experimental single-track audio backend now tests native PCM
   decoding, bounded queues, seek/cancellation, starvation/recovery and cleanup.
   Compressed-file streaming, resampling, variable rates, aligned streaming
   groups and real-device budgets remain open.
7. **Synchronized media:** the initial API coordinates an audio group with
   aligned video views and can pause/rebuffer the group when a view reports
   starvation. Extend it to cover a library-owned WebCodecs backend, score
   following, event-based switching and measurable timing budgets after their
   remaining contracts are resolved.
8. **Optional presentation and migration:** framework-free score and
   accessible controls, canvas video views, small example and migration guide;
   preserve independent player and view lifecycles. The score pager, zoom,
   event cursor, theme variables and opt-in player custom element are now
   available. IIIF Image API 2/3 images are supported as notational sources;
   other interoperability adapters are outside the approved scope.
9. **Release gate:** CI now runs browser tests in Chromium, Firefox and WebKit
   and stores per-engine capability evidence. Add real device checks and
   agreed workload benchmarks before publishing a support matrix or making
   mobile/codec guarantees.

## Test and diagnostic strategy

Use the Node test runner for pure model, timeline and state; browser tests for
native XML and actual media; OfflineAudioContext or deterministic clocks for
audio; synthetic markers for synchronization; interaction tests for UI; and
real devices for mobile claims. Add tests alongside each slice. Native API
presence alone is not proof of codec support.

The proposed per-player diagnostics include severity, subsystem, instance
identifiers, operation/generation and transport/media timestamps, with
bounded snapshots and an optional console sink. Avoid raw XML, media data and
sensitive URL query values, and aggregate rather than log in real-time audio
loops. Default verbosity and retention remain open.

Browser suspension, concurrent decoder limitations, range/CORS behavior and
fully decoded audio memory are real deployment constraints. Missing DmITE
recordings do not prevent synthetic tests, but do prevent claims about those
recordings or its migration.
