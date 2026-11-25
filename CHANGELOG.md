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
- Add a dependency-free DmITE listening example: private-folder or local HTTP
  assets, three instrument/angle panels, predecoded Web Audio, score following,
  page navigation, event-based switching, and Melody/One Note playback.
  Synchronized video is not included.
- Share the example canvas renderer with La Catedral.
