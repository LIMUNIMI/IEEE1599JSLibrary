# IEEE1599JSLibrary

A modernized, reusable JavaScript library for web players using IEEE 1599.
The early implementation includes subset XML parsing, timeline lookups,
predecoded Web Audio and optional score/transport UI. Streaming audio,
WebCodecs video and mixed-media synchronization are not yet implemented.

- [Modernization brief and confirmed decisions](docs/modernization.md)
- [Architecture and decision log](docs/architecture.md)
- [Roadmap and test strategy](docs/roadmap.md)
- [Early migration guide](docs/migration.md)
- [Capability evidence and limitations](docs/capabilities.md)
- [Agent entry point](AGENTS.md)

Run `npm install`, `npm run lint`, `npm run typecheck`, `npm test` and
`npm run test:browser`. See the migration guide for browser setup and the
synthetic example.
