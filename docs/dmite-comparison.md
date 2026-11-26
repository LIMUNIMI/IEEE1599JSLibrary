# DmITE comparison

This compares the library with the DmITE reference application. The baseline
is DmITE branch `murivan-solid-adventure` at commit
[`da00d96`](https://github.com/Murivan/DmITE/tree/da00d96b94496a3cf18a34b18f3a7db495a2aa3e).
DmITE is unchanged. The [DmITE listening example](../examples/dmite/README.md)
reimplements the player layout and audio workflow, not the reference site.

## IEEE 1599 data coverage

DmITE's `IEEE1599.js` reads the XML synchronously and builds global-style
objects for a fixed subset. The table counts the element and attribute names
that its parser reads by name.

| Layer | DmITE `da00d96` reads | This library |
| --- | --- | --- |
| General | `main_title`, `work_title`, `work_number`, `author` and its `type`, `related_file` (`file_name`, `description`) | All 16 elements and their attributes. |
| Logic, Spine | Event IDs and order only. `timing` and `hpos` are ignored. | `Spine` with relative and cumulative VTU/VPX, source values, simultaneity groups and lookups. |
| Logic, LOS | `chord` and `rest` by voice (`voice_item_ref`): duration, `tuplet_ratio`, `augmentation_dots`, notehead `pitch` (`step`, `octave`, `actual_accidental`), `printed_accidentals`, `tie` | All 118 Logic elements, plus `LOS` indexes for staves, parts, voice items, symbols by event, and staff, part and measure lookups. Layout is included. |
| Structural | Not read | All 24 elements. |
| Notational | `graphic_instance_group`, `graphic_instance` (`file_name`, `position_in_group`, `description`), and the `graphic_event` rectangle with `highlight_color` and `description` | All 8 elements, including notation instances. |
| Performance | Not read | All 20 elements. MIDI content stays a typed opaque `midi` subtree with boundary records (`doc.imports('midi')`). |
| Audio | `track` (`file_name`, `file_format`, `notes`) and `track_event` (`event_ref`, `start_time`) | All 16 elements, including `track_general`, recordings, performers and `track_region`. |
| Validation | None | DTD validity, strict by default. |
| Round trip | Not supported | `serializeIEEE1599Document()`. |

**Findings on the DmITE sample.** DmITE's sample `variationsserieuses.xml` has
literal `<undefined>` elements inside `printed_accidentals`, which appear to be
an exporter bug. Strict parsing therefore rejects it with 3
`element-undeclared` and 3 `content-invalid` errors. Lenient parsing accepts it
and reports those findings; it took about 430 ms in Edge 157. DmITE reads
`related_file/@spine_start_ref` and `@spine_end_ref`, which the DTD does not
declare; the DTD names them `start_event_ref` and `end_event_ref`. The library
keeps such undeclared attributes in `rawAttributes` and reports them as
`attribute-undeclared`.

## Player features

| DmITE feature | Library status |
| --- | --- |
| `MXPlayer` page wiring, jqWidgets controls | Replaced by the headless core and the optional framework-free `createTransportControls()`. jqWidgets is not used. |
| `MXContent` and `MXMedia`, HTML `<audio>` and `<video>` | Not reused, because playback must use Web Audio and WebCodecs only. Buffered audio uses `createBufferedAudioPlayer()`. Video exists only in the La Catedral example adapter. |
| `MXContentWebAudio` and `WebAudioManager` | Superseded by the buffered player: shared transport, gain, pan, rate, multiple instances, group ending and diagnostics. |
| `SyncManager` and `VideoSyncManager`, which correct drift with HTML media seeks | `createSynchronizedMediaPlayer()` coordinates aligned video-view callbacks from a buffered Web Audio clock. A general WebCodecs backend, independent offsets/rates and strict mixed-media rebuffering remain on the [roadmap](roadmap.md). |
| `MXGraphics` canvas score: highlight, click, page navigation, one-note mode | `createScoreView()` covers highlight and click-to-seek. DmITE and La Catedral share an example canvas renderer; the DmITE example adds page navigation and One Note. Those controls are not packaged library features. |
| `MXLOS` current-note text for a selected voice | Data is available through `doc.los`; the examples show measure and pitches. There is no packaged widget. |
| `MXSeekbar` | Both the optional transport controls and the DmITE example include a seek slider. |
| `Track.searchByTime`, `trackEventsByRef` | `createTimeline()` with `eventsAt(time)` and `resolve(eventRef)`. |
| `findGraphicEvents(x, y)` | Hit testing in `createScoreView()`. |
| Console `debugLog` | Per-player structured diagnostics with bounded retention. |

The example uses native selects, radios, checkboxes and buttons across three
listening panels. The selected WAV is fully decoded before playback; angle or
instrument changes switch by score event. Synchronized MP4 panels are not
implemented in the dependency-free example, and the package does not provide
voice filtering or general mixed-media transport. See the [roadmap](roadmap.md).
