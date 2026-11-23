# IEEE 1599 data model guide

The document model covers every element and attribute that the vendored
[IEEE 1599 DTD 1.0](../schema/README.md) declares. It keeps the source without
loss, validates it against the DTD, and gives the Spine and the LOS
first-class indexes. The [schema reference](schema-reference.md) lists every
element and attribute, and `npm test` checks it against the DTD.

**Data coverage is not operational support.** The model represents and
validates, for example, MIDI, Csound, MPEG-4, Petri nets and chord grids, but
the library does not play, render or synthesize them. See
[capabilities](capabilities.md#operational-support).

## Loading

```js
import { loadIEEE1599Document, parseIEEE1599Document } from 'ieee1599jslibrary';

const doc = await loadIEEE1599Document('score.xml');             // strict (default)
const lax = parseIEEE1599Document(xmlText, { strict: false, baseURL: location.href });
for (const issue of lax.issues) console.warn(issue.severity, issue.code, issue.path, issue.message);
```

| Function | Result | Errors |
| --- | --- | --- |
| `parseIEEE1599Document(xml, { strict = true, baseURL })` | `IEEE1599Document` | `DOMParser is not available`; `XML entity declarations are not supported`; `Malformed IEEE 1599 XML or invalid root element`; strict mode only: `IEEE1599ValidationError` with every finding in `error.issues`. |
| `loadIEEE1599Document(url, { strict, baseURL, signal })` | `Promise<IEEE1599Document>`; `baseURL` defaults to the final response URL | `IEEE 1599 fetch failed: HTTP <status>`, abort errors, and every error of `parseIEEE1599Document`. |
| `serializeIEEE1599Document(doc)` | XML text | None. |
| `createPlayerProjection(doc)` | The `PlayerDocument` subset used by the timeline and score view | The player subset errors documented in `src/xml/parse.js`. |

`parseIEEE1599(xml)` and `loadIEEE1599(url)` are unchanged from the earlier API.
They are equivalent to a lenient parse followed by `createPlayerProjection()`.

## Validation scope

`DOMParser` checks only well-formedness. The library itself checks DTD validity:

- Content models, including sequences, choices, occurrences, `EMPTY`, `ANY`
  and mixed content. The checker is a linear-time automaton.
- Undeclared elements and attributes, required attributes, enumerations,
  `#FIXED` values, and `ID`, `IDREF(S)` and `NMTOKEN(S)` syntax.
- Duplicate IDs and unresolved references.
- The DOCTYPE root name and the internal subset.

Warnings, which never throw, cover these cases:

- A missing DOCTYPE or an unknown system identifier.
- A reference whose target element type differs from the documented target.
- Spine `timing` or `hpos` values that are not integers.

External DTDs are never fetched. Entity declarations are rejected and never
expanded. SVG and MIDI subtrees are kept but not validated. Issue codes and
their severities are documented in `src/model/validate.js`.

## Nodes

Every element is an `IEEE1599Element`:

| Member | Meaning |
| --- | --- |
| `name`, `namespaceURI`, `vocabulary` | XML name; `ieee1599`, or `svg`/`midi` for imported subtrees, or `unknown`. |
| `attributes` | Effective values, with DTD defaults applied and tokenized types normalized. |
| `rawAttributes` | Source `[name, value]` pairs in source order, used by the serializer. |
| `isSpecified(name)`, `attribute(name)` | Distinguishes written values from defaults; returns the value or `null`. |
| `children` | Ordered elements, text, CDATA, comments and processing instructions. Mixed content keeps its order. |
| `element(name)`, `elements(name)`, `descendants(filter?)`, `ancestors()`, `closest(name)` | Traversal. |
| `text`, `path`, `declaration`, `layer` | Concatenated text, location such as `/ieee1599[1]/logic[1]/spine[1]/event[2]`, DTD declaration, owning layer. |

Generated JSDoc types in `src/schema/ieee1599-types.js`, such as
`IEEE1599ChordElement`, narrow `name` and `attributes` for every element. For
example, enumerated attributes become string unions.

## Document and layers

`IEEE1599Document` exposes these members:

- `root` and `doctype`, which holds the name, public and system identifiers,
  internal subset and source.
- `xmlDeclaration`, plus `prolog` and `epilog`, which hold the comments and
  processing instructions outside the root.
- `issues`, `valid`, `schema` and `baseURL`.
- The layer getters `general`, `logic`, `structural`, `notational`,
  `performance` and `audio`, and `layer(name)`. Optional layers return `null`
  when they are absent.
- `ids` and `byId(id)`, covering ID-typed attributes only.
- `referencesTo(id)`, which returns every IDREF or IDREFS use as
  `{ element, attribute }`.
- `eventLinks(eventId)`, which groups the referring elements by layer.
- `resolveURL(path)`, which resolves `file_name` values against `baseURL`.

| Layer | Contents (see the [reference](schema-reference.md#elements-by-layer)) |
| --- | --- |
| General | Titles, authors, numbers, dates, genres, related files, analog media and notes. |
| Logic | The **Spine**, the **LOS** (staves, parts, measures, voices, chords, rests, symbols and lyrics) and layout. |
| Structural | Chord grids, analyses and segmentation, feature objects, relationships, Petri nets and MIR models. |
| Notational | Graphic instances with `graphic_event` rectangles, and notation instances. |
| Performance | MIDI, Csound and MPEG-4 instances that map events to synthesized performances. |
| Audio | Tracks with general and recording metadata, and indexing with `track_event` times and regions. |

## Spine

The Spine is the ordered list of every music event. Every other layer refers
to its IDs. `doc.spine` decodes it as follows:

- `events`, one per event, with these fields:
  - `id` and `index`.
  - `timing` and `hpos`, the relative integers in VTU and VPX. They are `null`
    when the value is `"null"`, the DTD default, or not an integer.
  - `timingSource` and `hposSource`, the strings as written. They are `null`
    when the attribute is absent.
  - `vtu` and `vpx`, the cumulative positions from 0. They become `null` from
    the first unknown value onwards.
  - `group`.
- `groups`, the simultaneity groups. An event with `timing="0"` joins the
  previous event's group.
- `get(id)`, `has(id)`, `indexOf(id)`, `simultaneous(id)`, `length`, and
  iteration in Spine order.

Spine values are **score time**, not media seconds. Each `track` maps events
to seconds in its own `track_indexing`. Different performances therefore have
different mappings, and the player switches between them by score event.

## LOS

`doc.los` indexes the Logically Organized Symbols:

| Member | Result |
| --- | --- |
| `staves`, `parts`, `voiceItems` | Staff, part and `voice_item` elements in source order. |
| `symbols` | Every IEEE element in the LOS with an `event_ref`, such as chords, rests, clefs and key signatures. |
| `forEvent(eventId)` | The LOS symbols attached to a Spine event. |
| `staff(id)`, `voiceItem(id)` | Lookup by ID. |
| `staffOf(element)` | The element's own `staff_ref`, otherwise the staff of its voice through `voice_item`. |
| `partOf(element)`, `measureOf(element)` | The enclosing `part` and `measure`. |

```js
for (const symbol of doc.los.forEvent('e1')) {
  const pitches = symbol.descendants('pitch').map((p) => p.attributes.step + p.attributes.octave);
  console.log(symbol.name, pitches, doc.los.measureOf(symbol)?.attributes.number, doc.los.staffOf(symbol)?.attributes.id);
}
```

## Round trip

`serializeIEEE1599Document(doc)` writes this content:

- The XML declaration, which defaults to UTF-8.
- The DOCTYPE exactly as written.
- The prolog and epilog.
- Every element with its source attributes in their original order. Defaults
  are never added.
- Text, CDATA, comments and processing instructions.

Parsing the output gives an equivalent tree. Whitespace outside the root,
character-reference spelling and attribute quote style are not preserved.

## Examples

- [`examples/index.html`](../examples/index.html) parses a DTD-valid inline
  document strictly. It lists the Spine with LOS details and shows the current
  event while playing.
- [`examples/inspector/`](../examples/inspector/index.html) opens any local
  IEEE 1599 file leniently. It shows the findings, layer element counts and
  Spine positions, and lists the event links for each layer.
- [`examples/la-catedral/`](../examples/la-catedral/README.md) loads a real
  document strictly and shows the measure and pitches of the highlighted
  events.
