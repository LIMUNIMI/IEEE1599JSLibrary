# IEEE 1599 schema source

`ieee1599.dtd` is the schema that every element and attribute in this library
is generated from and checked against.

| Property | Value |
| --- | --- |
| Source URL | <https://www.lim.di.unimi.it/IEEE/ieee1599.dtd> |
| Declared version | 1.0 (header: created 25/02/2007, last update 08/04/2007) |
| Size and hash | 29,423 bytes, SHA-256 `6d252f51e1dada2284ab4a21c884c7d4574b09a5a7455758e9b5a07e8d17d04b` |
| Copy policy | Byte-for-byte copy. `.gitattributes` marks it `-text` so line endings and the hash do not change. |
| Declarations | 200 IEEE 1599 elements and 424 attributes, with parameter entities expanded. |

The user approved vendoring this LIM-published DTD verbatim. The file has no
license statement, and none is implied by this repository's GPL-3.0 license.
Keep the file unmodified with its original header. LIM documentation pages are
linked from the generated reference, and their text is not copied.
`lim-documentation-pages.json` maps element names to the LIM page filenames.

## Version notes

Documents may declare other system identifiers. For example, the La Catedral
file uses `http://standards.ieee.org/downloads/1599/1599-2008/ieee1599.dtd`.
The validator never fetches a DTD. It accepts the LIM URLs (`http` and `https`)
and the bare `ieee1599.dtd`. Any other identifier produces only a
`doctype-system-id` **warning**, and the document is still validated against this
copy. This copy has not been compared with the text published by IEEE.

## Imported vocabularies

The DTD imports two external DTDs with parameter entities. They are recorded,
but they are **not** vendored or expanded:

| Entity | Public identifier | Used by |
| --- | --- | --- |
| `%svg;` | `-//W3C//DTD SVG 1.1//EN` | `svg` in `custom_articulation`, `slur`, `custom_hsymbol`, `layout_shapes`; `font` in `text_font`, `music_font` |
| `%mididtd;` | `-//MIDI Manufacturers Association//DTD MIDIEvents 1.0//EN` | `%MIDIChannelMessage;` in `midi_event`; `SysEx` in `sys_ex` |

As the user decided, imported subtrees are kept in full as opaque generic nodes
with the `svg` or `midi` vocabulary. They are not typed or validated.

## Quirks preserved from the DTD

The generator records these quirks as declared and does not correct them:

- `measure` is `(voice+ | multiple_rest | measure_repeat?)`, so an empty
  `measure` is valid.
- `multiple_endings` and `mpeg4_spine_event` are declared but not reachable
  from the `ieee1599` root.
- `id` is declared as `CDATA` on some elements, such as `rest` and `page`.
  Values there are kept as attributes, but they are not checked as XML IDs and
  are not returned by `doc.byId()`.
- `layout_staff/@staff_ref` is `CDATA`, not `IDREF`.
- `event/@timing` and `event/@hpos` have the declared default `"null"`.

## Regeneration

```powershell
npm run schema:generate   # rewrite src/schema/*.js and docs/schema-reference.md
npm run schema:check      # fail when generated outputs drift (part of npm test)
```

`tools/schema/dtd.js` is a small, dependency-free reader for the DTD subset used
here. It rejects unexpected constructs instead of guessing. `npm test` also
cross-checks its counts against an independent regular-expression inventory.
