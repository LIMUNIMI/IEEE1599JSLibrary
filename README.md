# IEEE1599JSLibrary

A modernized, reusable JavaScript library for web players using IEEE 1599.
It includes a complete, DTD-validated IEEE 1599 document model covering all
six layers with first-class Spine and LOS, plus a player projection, timeline lookups,
predecoded Web Audio, experimental bounded native streaming,
an audio-clock-led synchronized video-view controller,
an optional read-only MP4/QuickTime demux adapter, and
optional score/transport UI, a score pager and an embeddable player.

**Have IEEE 1599 material and want a web player?** Start with
[Build your own player](docs/build-your-player.md): a step-by-step guide with
a ready-to-copy [starter player](examples/starter/index.html) that needs only
Node.js and a browser.

**Developing with or on the library?** Start with
[Getting started](docs/getting-started.md) and the
[score and playback guide](docs/playback.md).

- [Modernization brief and confirmed decisions](docs/modernization.md)
- [Data model guide](docs/data-model.md), [schema reference](docs/schema-reference.md) and [schema provenance](schema/README.md)
- [DmITE comparison](docs/dmite-comparison.md)
- [Score UI, embedding and IIIF score images](docs/score-ui.md)
- [Bounded native streaming audio](docs/streaming.md)
- [Architecture and decision log](docs/architecture.md)
- [Roadmap and test strategy](docs/roadmap.md)
- [Early migration guide](docs/migration.md)
- [Capability evidence and limitations](docs/capabilities.md)
- [Test against a local IEEE 1599 corpus](docs/corpus-testing.md)
- [Build and publish the documentation](docs/publishing.md)
- [Changelog](CHANGELOG.md)
- [Agent entry point](AGENTS.md)

Use [Node.js 26 LTS](https://nodejs.org/en/about/previous-releases) and the
pnpm version pinned in `package.json`.
Run `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test` and
`pnpm run types:check`, and `pnpm run test:browser`. Browser CI covers
Playwright Chromium, Firefox and WebKit; it does not claim support for physical
mobile devices. `pnpm run docs:build` generates the API reference,
guides and asset-free examples in `_site/`. `pnpm run serve` (or
`node tools/serve.js`) serves the checkout on `http://127.0.0.1:8000/`.

Examples: [minimal player](examples/index.html),
[starter player for your own material](examples/starter/index.html),
[embeddable player](examples/embed/index.html),
[synthetic streaming probe](examples/streaming/index.html),
[document inspector](examples/inspector/index.html),
[DmITE private-asset listening player](examples/dmite/README.md), and
[La Catedral WebCodecs demonstration](examples/la-catedral/README.md).
