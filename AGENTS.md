# Agent entry point

Read [the modernization brief](docs/modernization.md), [architecture and
decision log](docs/architecture.md), and [roadmap](docs/roadmap.md) before
working on this library. Confirmed decisions are binding; proposed and open
choices are not. Ask the user before resolving material open architectural
choices. Do not modify the DmITE reference application.

Every IEEE 1599 DTD element and attribute must exist in the model: never
edit `src/schema/*` or `docs/schema-reference.md` by hand; run
`npm run schema:generate` and keep `npm test` (which includes
`schema:check`) passing. Keep JSDoc complete for exported contracts, keep
data coverage separate from operational support in docs, and update tests and
examples with each change. Start from the [data model guide](docs/data-model.md),
[schema provenance](schema/README.md) and [DmITE comparison](docs/dmite-comparison.md).
