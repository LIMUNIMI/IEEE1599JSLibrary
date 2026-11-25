# IEEE1599JSLibrary

A modernized, reusable JavaScript library for web players using IEEE 1599.
It includes a complete, DTD-validated IEEE 1599 document model covering all
six layers with first-class Spine and LOS, plus a player projection, timeline lookups,
predecoded Web Audio and optional score/transport UI. The
[La Catedral example](examples/la-catedral/README.md) demonstrates WebCodecs
video with a synchronized Web Audio soundtrack; general-purpose mixed-media
transport and streaming audio are not yet implemented.

- [Modernization brief and confirmed decisions](docs/modernization.md)
- [Data model guide](docs/data-model.md), [schema reference](docs/schema-reference.md) and [schema provenance](schema/README.md)
- [DmITE comparison](docs/dmite-comparison.md)
- [Architecture and decision log](docs/architecture.md)
- [Roadmap and test strategy](docs/roadmap.md)
- [Early migration guide](docs/migration.md)
- [Capability evidence and limitations](docs/capabilities.md)
- [Agent entry point](AGENTS.md)

Run `npm install`, `npm run lint`, `npm run typecheck`, `npm test` and
`npm run test:browser`. See the migration guide for browser setup and the
synthetic example. Examples: [player](examples/index.html), [document inspector](examples/inspector/index.html), [La Catedral](examples/la-catedral/README.md).
