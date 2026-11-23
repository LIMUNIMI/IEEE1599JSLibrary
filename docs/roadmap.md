# Modernization roadmap

This is the approved execution sequence. Confirmed decisions and unresolved
questions are in the [brief](modernization.md) and [decision log](architecture.md).
Milestones may proceed only where their contracts are already confirmed.

The requirements milestone is complete. The complete IEEE 1599 DTD data model
(all six layers, Spine, LOS, validation, serialization) is implemented under
milestone 4; see the [data model guide](data-model.md). Operational support
for Structural/Performance semantics and DmITE features such as page
navigation and one-note playback remain open (see the
[DmITE comparison](dmite-comparison.md)). An initial subset of milestones 3-5
and 8 is implemented; media feasibility, remaining contracts, streaming,
WebCodecs video, mixed-media synchronization and the release gate remain open.

1. **Preserve requirements:** establish the agent entry point, brief,
   architecture/decision log and roadmap.
2. **Media/browser feasibility:** build small native buffered audio,
   WebCodecs video, streaming audio/AudioWorklet and common-clock probes with
   synthetic or licensed fixtures. Vet optional demuxers for formats, seeks,
   ranges, bounded memory, worker support, maintenance and licensing.
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
not by `DOMParser`; a generated inventory gates coverage in `npm test`.
5. **Predecoded Web Audio:** implement complete preload/readiness, independent
   instances, shared scheduling, seek, native varispeed, gain and lifecycle.
   Test actual browser decoding, scheduling, activation and command races.
6. **Bounded media backends:** implement optional demux integration,
   backpressure, seek/generation handling, streaming audio and WebCodecs
   video. Test real decoding, timestamp conversion and resource cleanup.
7. **Synchronized media:** coordinate concurrent audio/video and score
   following, event-based switching and strict group rebuffering. Measure
   timing against agreed application budgets.
8. **Optional presentation and migration:** framework-free score and
   accessible controls, canvas video views, small example and migration guide;
   preserve independent player and view lifecycles.
9. **Release gate:** run cross-browser tests and agreed workload benchmarks;
   publish measured capability matrix, prerequisites and limitations.

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
