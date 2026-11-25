# Copilot instructions

## Project overview and structure

IEEE1599JSLibrary is a modern JavaScript ES-module library for IEEE 1599 web
players. Read `AGENTS.md` and the documentation it links before changing the
library. Source is organized under `src/`, with tests in `tests/`, applications
in `examples/`, and maintained guides in `docs/`.

## Coding conventions

- Write JavaScript consistent with the library's role as a core library for web players.
- Follow the style and patterns of nearby code when implementation files are added.
- Keep changes focused and avoid adding dependencies or tooling without a project need.
- Preserve compatibility with the web players that consume the library.

No more specific coding conventions are currently documented.

## Tests

Use `pnpm test` for the Node tests and generated-schema check, and
`pnpm run test:browser` for browser tests. Add focused tests for new behavior.

## Build and run

Use Node.js 26 LTS and the pnpm version pinned in `package.json`.
Install with `pnpm install --frozen-lockfile`, and run `pnpm run lint`,
`pnpm run typecheck`, and `pnpm run docs:build`. Maintain `pnpm-lock.yaml`,
JSDoc, guides and `CHANGELOG.md` with related changes.
Use uv instead of pip if Python dependencies are introduced; the local
Python HTTP server currently needs only the standard library.
