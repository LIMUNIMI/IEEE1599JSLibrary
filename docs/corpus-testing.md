# Test against a local IEEE 1599 corpus

`pnpm run test:corpus` checks every IEEE 1599 document in a local folder
in a real browser. It loads each file with the library and reports whether it
validates, round-trips, and projects for a player. It also checks whether the
media it references can be found and decoded. Use it to validate an archive
before building a player, or to find regressions against real material.

Corpora usually contain copyrighted recordings and scores, so the tool never
uploads anything:

- Put the corpus in `examples/assets/`, which is git-ignored and excluded
  from the [Pages publication](publishing.md), or pass another folder with
  `--root`. Never commit or publish its contents.
- The files are served read-only from `127.0.0.1` with HTTP range support.
- The report names private files, so it goes to the git-ignored
  `corpus-report/` folder (or `--out`).

```text
pnpm run test:corpus
pnpm run test:corpus -- --filter 1098/ --concurrency 2
pnpm run test:corpus -- --root D:\archive --no-video
```

| Option | Default | Purpose |
| --- | --- | --- |
| `--root <folder>` | `examples/assets` | Corpus to scan recursively. |
| `--out <folder>` | `corpus-report` | Where `report.json` and `report.md` are written. |
| `--filter <text>` | none | Only documents whose corpus-relative path contains the text. |
| `--concurrency <n>` | `3` | Documents checked in parallel, each in its own page. |
| `--timeout <seconds>` | `600` | Per-document limit. |
| `--no-audio`, `--no-video` | off | Skip decoding; still check that the files exist. |

Edge is used by default. Set `BROWSER=chromium`, `firefox` or `webkit` to use
a Playwright browser installed with `pnpm exec playwright-core install`.

## What is checked

An XML file is treated as a document only if its root element is
`ieee1599`. Other XML files, such as editor metadata and macOS `._*` files,
are skipped. **Only files named in `file_name` attributes are fetched.**
Other files in the folder are ignored, for example image scales or
`_lo`/`_mid`/`_high` audio variants that no document references. For a
missing reference, the report suggests same-named files from the document's
top-level folder to help curators; the checker never uses those files.

For each document the checker:

1. Loads it with `loadIEEE1599Document(url, { strict: false })`, then records
   DTD validity and the most frequent validation messages.
2. Serializes and reparses it, and compares element counts (`round-trip`).
3. Builds the [player projection](data-model.md) and a timeline for each
   track that has events.
4. Resolves every `file_name`. Absolute local paths such as `C:\…` and
   `file:` URLs are reported as `local-path`, because browsers cannot load
   them. Backslashes produce a warning: browsers convert them to `/` over
   HTTP, but they are not portable URLs. Remote URLs are listed but not
   fetched.
5. Decodes score images with `createImageBitmap` and checks that graphic
   event rectangles lie within each image. TIFF is reported as
   `unsupported-image`, because Chromium and Firefox cannot display it.
6. For audio-layer tracks, decodes audio with the buffered player and checks
   that the last `track_event` falls within the media duration. It opens
   MP4/MOV with the optional [Mediabunny adapter](streaming.md) and decodes the
   first video frame. Containers outside the
   [supported formats](capabilities.md), such as AVI, WMV and MIDI, are
   reported as `unsupported-container`; nothing is converted.
7. Reports references that only work on case-insensitive filesystems as
   `case-mismatch`, because they fail on most web servers.

## Reading the report

`report.md` contains totals, findings by category, a per-document table and
grouped details. Errors mean that the document or one of its referenced files
cannot be used as authored. Warnings mean that it works with limitations.

**Possible library issues** lists findings that may come from the library
rather than from the data: runner failures, round-trip mismatches, projection
or timeline exceptions, and decode or demux failures of supported formats.
Investigate those first. Decode failures include hints when the cause is
known: an image whose bytes are another format than its extension names (for
example TIFF in a `.jpg`), or audio over 100 MB, which may be too large to
decode whole in a browser even though streamed playback can still work.
If one is a library defect, reproduce it with a small
synthetic fixture under `tests/` and never copy corpus material into the
repository. Most other findings are authoring problems, such as missing files,
local paths or wrong case, and are fixed in the documents.

The report generator in `tools/corpus/summary.js` is unit-tested; the
browser checker is in `tools/corpus/check.js`, and the server and runner are
in `tools/corpus/run.js`.
