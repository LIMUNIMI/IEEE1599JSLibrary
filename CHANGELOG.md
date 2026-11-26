# Changelog

## Unreleased

- Fix synchronized seek and refill races, including a seek to the end that
  previously restarted playback. Clear decoded buffers on disposal and
  bound streaming PCM transfers after preroll trimming. Streaming no longer
  waits for reader EOF at the declared duration.
- Honor legacy XML encodings, preserve comment and instruction order around
  DOCTYPE, and ignore declaration-like text in comments and CDATA. Normalize
  references and optional offsets and warn when skipping unsupported score
  units or track time bases.
- Protect the current DmITE video feed from stale requests, let users pause
  embedding startup, and preserve usable keyboard focus at score boundaries
  without rewriting unchanged highlights.
- Include the public inspector sample in the generated site. Gate Pages and
  tagged releases on browser and artifact checks; add synthetic cross-origin
  MP4 range, H.264 and AAC decode evidence.

- Add experimental bounded single-track native AudioDecoder/AudioWorklet
  streaming, with transferable PCM, backpressure, seek/preroll, starvation
  recovery and explicit unsupported-rate/codec errors. No streaming resampler,
  rate changes, audio groups or HTML playback fallback are introduced.
- Add `createScorePager()` with page controls, zoom/scroll, event cursor,
  theme variables and roving keyboard focus. Preserve `createScoreView()`
  with additional readiness and image-error reporting.
- Support IIIF Image API 2/3 `info.json` sources in notational
  `graphic_instance/@file_name`, preserving original image-pixel event
  coordinates. No DTD extension, Presentation API or other notation adapter.
- Add explicit `defineIEEE1599Player()` registration for an isolated
  `<ieee1599-player>` component with lazy buffered audio, score navigation,
  load/transport events and cleanup on disconnect, plus embedding and
  synthetic-streaming examples and guides.
- Add `createSynchronizedMediaPlayer()` to coordinate aligned video-view
  callbacks with a required buffered-audio transport clock. The host primes
  views before play/seek and calls `present()` from its render loop; views can
  signal starvation to pause/rebuffer the audio group. It forwards transport
  events and can bind to the framework-free transport controls. Video-only
  clocks and general WebCodecs playback remain out of scope.
- Run browser tests in Playwright Chromium, Firefox and WebKit, and upload
  per-engine evidence from synthetic WAV decode and WebCodecs codec-configuration
  probes. These tests do not establish mobile-device or real-file codec support.
- Generate TypeScript declaration files and compile a consumer type fixture;
  create a curated GitHub Release archive from matching `v<version>` tags.
  npm publication remains disabled.
- Add the [Build your own player](docs/build-your-player.md) guide for
  musicologists and other non-developers, with a commented starter player
  (`examples/starter/`) that follows the score, turns pages, seeks from score
  clicks and switches recordings at the same score event. Its
  `materials/` folder is ignored by Git.
- Add `pnpm run serve` (`tools/serve.js`), a dependency-free localhost-only
  static server with byte-range support, and use it instead of Python in the
  documentation.
- Recommend Node.js 26 LTS and use it in the documentation workflow;
  verify the toolchain with Node.js 26.13.1.
- Migrate JavaScript dependency management, scripts and CI from npm to pnpm,
  with a pinned package-manager version and frozen lockfile installs. Use uv
  for any future Python dependency tooling; no pip usage currently exists.
- Build the JSDoc API with TypeDoc alongside the guides and asset-free
  examples. GitHub Actions uploads a preview artifact on `main` by default;
  GitHub Pages deployment is opt-in.
- Add a framework-free DmITE listening example: private-folder or local HTTP
  assets, three instrument/angle panels, predecoded Web Audio, score following,
  page navigation, event-based switching, Melody/One Note playback, and optional
  synchronized MP4/QuickTime canvas feeds through native WebCodecs.
- Share the example canvas renderer with La Catedral.
- Record confirmed media decisions: no HTML media fallback, and read-only
  media access without transcoding, remuxing or encoding.
- Select Mediabunny as the optional read-only MP4/MOV demuxer, and accept
  that formats without native browser decoding are reported as unsupported.
- Add an optional Mediabunny adapter subpath that accepts host-provided modules,
  exposes MP4/QuickTime track metadata and encoded packets, and never writes or
  transforms media. Keep Mediabunny optional and out of the package root import.
