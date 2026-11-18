# Modernization brief

## Original instruction

> We would like to develop a modernized version of the IEEE1599JSLibrary that is used in multiple web players. You can take as the most common example the repo https://github.com/Murivan/DmITE/tree/murivan-solid-adventure . This library powers web players that hanlde IEEE1599 xml files (see documentation at: https://ieee1599.lim.di.unimi.it/). This library was built 15 years ago and many architectural choices are not current. In particular it should be written using modern styles and functionalities for js, and using strictly Web Audio API (https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) and WebCodecs API (https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) for audio and video. It should clearly distinguish the boundaries between core functionalities and interface/presentation (UI elements). As of now the current version relies on jqwidgets and are intertwined with the code. We should build something with no external dependencies if possible. In the creation process consider building test suites for all the key functionalities, and planning debug information available in the browser console for testing. If there are architectural choices ask back to the user, do not assume. Also store an organized copy of this instruction in the project, so it will be possible for more agents to be brought up to date. Consider adding documents as necessary to plan the execution of the task.

## Scope

Build a new reusable library for multiple players consuming IEEE 1599 XML.
DmITE is a reference, not the specification for every application. Cover
metadata, spine and logical events, graphical score mappings, score following,
navigation, audio/video playback, track switching, and synchronization.
Support multiple concurrent audio, video, and image instances. Application
instrument configuration, page layout, and workflows remain outside the core.
This repository initially contained only a README and GPL-3.0 license; this is
a new implementation, not an in-place legacy refactor. Do not modify DmITE.

## Confirmed decisions

| ID | Topic | User-confirmed direction |
| --- | --- | --- |
| D01 | Public API | New API with migration guidance; no backward compatibility requirement. |
| D02 | Dependencies | Zero core runtime dependencies; an optional vetted demuxer is permitted, not a playback framework or decoder fallback. |
| D03 | Language | Modern JavaScript ES modules, JSDoc and static type checking; no TypeScript source. |
| D04 | UI | Optional framework-free score and transport UI, separate from a headless core; no jqWidgets. |
| D05 | Scope | Reusable legacy features and multiple concurrent audio, video and image instances, with timed-media synchronization. |
| D06 | Timelines | Shared-clock playback for aligned media; score-event-based seeking and switching between performances, without continuous time-stretching. |
| D07 | Browsers | Desktop and mobile with a tested capability matrix and explicit unsupported-media errors; codec support is conditional. |
| D08 | Loading | Each application chooses fully predecoded audio or bounded streaming. |
| D09 | Audio | Buffered audio may use Web Audio `decodeAudioData()`; streaming uses WebCodecs into Web Audio. |
| D10 | Formats | Investigate WAV/MP3/AAC audio and MP4/WebM video; these are targets, not verified support claims. |
| D11 | Rate | Initially native speed-and-pitch changes; pitch-preserving tempo is deferred. |
| D12 | Tooling | Small development-only tools, including JS checking and browser automation, are allowed. |
| D13 | Underrun | Pause/rebuffer the entire synchronized group and resume together when a required source underruns. |
| D14 | Video preload | Audio can be fully predecoded; video files can be cached but decoded video frames remain bounded. |

Important user clarifications:

> A variant of A. The legacy features, but having in mind that multiple instances of audios, videos, and images can be loaded at the same time. Synchronization between all timed media is important.

> This should be something that we might want to determine per application. There are certain applications where full decoding before hand is critical (e.g. DmITE), for others bounded streaming is actually preferred.

No HTML audio/video playback fallback is permitted. Image elements and canvas
rendering are not excluded. Keep assets, playback instances and views distinct;
preserve source timestamps and explicitly map score, media and transport time.
Surface readiness, cancellation, failures and unsupported codecs. Avoid raw XML
or media dumps in diagnostics, global player state, synchronous XHR, UI
frameworks and prototype mutation.

## Open decisions and evidence gates

These were open at roadmap approval. Some have since been resolved; consult
the current [decision log](architecture.md) before implementing affected
contracts and ask about any remaining open choices.

1. Demuxer and packaging after format, seeking, streaming, license and worker probes.
2. Exact codec profiles, browser/device minimums and required vs conditional support.
3. Final public commands/events and states, including AudioContext ownership.
4. Sparse timeline switching and unmapped-event behavior.
5. Per-application drift, startup/seek, queue and memory budgets.
6. Streaming PCM resampling, rate changes and cross-thread transport.
7. Video-only clock, group readiness and end-of-source rules.
8. Diagnostic defaults, bounded retention and exact API.

## Discovery and references

The target started from main commit `63c37ca4057ad6466e685e5aab6b5cfb4576ca32`.
The reference was inspected at DmITE commit
`da00d96b94496a3cf18a34b18f3a7db495a2aa3e`. Its legacy XML parser uses
synchronous loading and global helpers; its player mixes controls and layout
with media, while its Web Audio prototype provides a useful behavioral
reference. Its video path uses HTML video and therefore cannot be reused as the
strict WebCodecs backend. Its sample XML contains WAV event timestamps; MP4
filenames come from application-specific configuration. Recordings and jqWidgets
are not checked in, so actual codec and device workload claims need independent
evidence. The reference has a CC0 dedication; preserve this repository's
GPL-3.0 license and verify external dependency and fixture provenance.

The target is a player-relevant subset, not a full IEEE 1599 DTD validator.
Structural/performance-layer interpretation, MIDI synthesis and generating
engraving from logical notation have not been requested.

- [Reference application snapshot](https://github.com/Murivan/DmITE/tree/da00d96b94496a3cf18a34b18f3a7db495a2aa3e)
- [IEEE 1599 documentation](https://ieee1599.lim.di.unimi.it/) and [DTD](https://www.lim.di.unimi.it/IEEE/ieee1599.dtd)
- [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [WebCodecs queues and lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API), [audio output timestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp)
