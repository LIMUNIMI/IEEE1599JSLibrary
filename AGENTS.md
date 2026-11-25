# Agent entry point

Read [the modernization brief](docs/modernization.md), [architecture and
decision log](docs/architecture.md), and [roadmap](docs/roadmap.md) before
working on this library. Confirmed decisions are binding; proposed and open
choices are not. Ask the user before resolving material open architectural
choices. Do not modify the DmITE reference application.

Every IEEE 1599 DTD element and attribute must exist in the model: never
edit `src/schema/*` or `docs/schema-reference.md` by hand; run
`pnpm run schema:generate` and keep `pnpm test` (which includes
`schema:check`) passing. Keep JSDoc complete for exported contracts, keep
data coverage separate from operational support in docs, and update tests and
examples with each change. Start from the [data model guide](docs/data-model.md),
[schema provenance](schema/README.md) and [DmITE comparison](docs/dmite-comparison.md).
Record user-visible changes in [CHANGELOG.md](CHANGELOG.md). Check
`pnpm run docs:build` when changing Markdown or JSDoc. Never add private
example assets to the [Pages publication](docs/publishing.md).
Use pnpm for JavaScript dependencies and scripts, with the version pinned in
`package.json`. If Python dependencies are introduced, use uv rather than pip.
