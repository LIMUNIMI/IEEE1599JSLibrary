# IEEE1599JSLibrary

A modernized, reusable JavaScript library for web players using IEEE 1599.
It includes a complete, DTD-validated IEEE 1599 document model covering all
six layers with first-class Spine and LOS, plus a player projection, timeline lookups,
predecoded Web Audio and optional score/transport UI. Start with
[Getting started](docs/getting-started.md) and the
[score and playback guide](docs/playback.md).

- [Modernization brief and confirmed decisions](docs/modernization.md)
- [Data model guide](docs/data-model.md), [schema reference](docs/schema-reference.md) and [schema provenance](schema/README.md)
- [DmITE comparison](docs/dmite-comparison.md)
- [Architecture and decision log](docs/architecture.md)
- [Roadmap and test strategy](docs/roadmap.md)
- [Early migration guide](docs/migration.md)
- [Capability evidence and limitations](docs/capabilities.md)
- [Build and publish the documentation](docs/publishing.md)
- [Changelog](CHANGELOG.md)
- [Agent entry point](AGENTS.md)

Use [Node.js 26 LTS](https://nodejs.org/en/about/previous-releases) and the
pnpm version pinned in `package.json`.
Run `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test` and
`pnpm run test:browser`. `pnpm run docs:build` generates the API reference,
guides and asset-free examples in `_site/`.

Examples: [minimal player](examples/index.html),
[document inspector](examples/inspector/index.html),
[DmITE private-asset listening player](examples/dmite/README.md), and
[La Catedral WebCodecs demonstration](examples/la-catedral/README.md).
