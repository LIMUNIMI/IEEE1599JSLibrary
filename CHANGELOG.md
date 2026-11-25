# Changelog

## Unreleased

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
