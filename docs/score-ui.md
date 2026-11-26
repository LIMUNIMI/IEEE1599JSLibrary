# Score presentation, IIIF and embedding

The optional UI modules are framework-free and do not enter the core import.
They render already encoded score images; they do not engrave the LOS,
synthesize music or introduce HTML media playback.

## Pager, zoom and following

```js
import { createScorePager } from 'ieee1599jslibrary/ui/score-pager.js';

const score = createScorePager({
  container: document.querySelector('#score'),
  pages: projection.graphicInstances[0].pages,
  onSeek: (ref) => player.seek(timeline.resolve(ref).time)
});
await score.ready; // Current page only; no eager download of every score image.
score.setZoom(1.5); // 0.5-4 times the viewport width.
score.showPage(0); // Zero-based index.
// In your render loop: read the transport clock; never advance it here.
score.highlight(timeline.eventsAt(player.currentTime), {
  follow: player.state === 'playing',
  scroll: false // Opt into scrolling the highlighted event into view.
});
// Later:
score.dispose();
```

The pager provides previous/next buttons, a page status and a labelled zoom
slider. The focusable score viewport supports Page Up/Page Down. Score
rectangles use roving focus: Tab enters the event list, arrow keys move between
events in document order, Home/End reach its ends, and Enter/Space seeks.
Highlighting never transfers keyboard focus. Automatic page following is
temporarily held while a score event has keyboard focus, so the focused
target is not removed; manual navigation is independent from playback.

`createScoreView()` remains available for a single page. It now also exposes
`ready`, `setZoom()` and `scrollToCurrent()`. Its cursor marks the left edge of
the first current event and moves at event boundaries; it is **not** a
continuous engraved-note playhead. Simultaneous events are all highlighted.
Image/network failures appear in an alert and reject `ready`.

CSS custom properties inherit from your host, including across the embedded
player's shadow DOM:

| Property | Default |
| --- | --- |
| `--ieee1599-highlight-color` | `rgba(255, 180, 0, 0.4)` |
| `--ieee1599-cursor-color` | `#b45309` |
| `--ieee1599-cursor-width` | `2` |
| `--ieee1599-focus-color` | `#2563eb` |
| `--ieee1599-score-height` | `70vh` |
| `--ieee1599-text-color` | inherited |
| `--ieee1599-background` | `transparent` |

Interaction tests cover keyboard access, focus, zoom, labels and alerts. This
is not a complete WCAG conformance or screen-reader certification.

## IEEE 1599 images from an IIIF server

No schema extension is required. Put the **IIIF Image API 2 or 3 `info.json`
URL** in the existing notational `graphic_instance/@file_name`:

```xml
<graphic_instance_group description="Digitized score">
  <graphic_instance position_in_group="1"
      file_name="https://images.example.org/iiif/score-page-1/info.json">
    <graphic_event event_ref="e1"
        upper_left_x="100" upper_left_y="200"
        lower_right_x="180" lower_right_y="300"/>
  </graphic_instance>
</graphic_instance_group>
```

`createPlayerProjection()` already resolves that URL relative to the XML.
`createScoreView()`, the pager and the embedded player detect `info.json`,
fetch its metadata and request the full image:
`full/full/0/default.jpg` for Image API 2, or `full/max/0/default.jpg` for 3.
The image is displayed natively. Rectangles must be expressed in **the full
underlying image's original pixel coordinates** (`width`/`height` in
`info.json`), even if the server returns a smaller full image. The overlay's
coordinate system uses those original dimensions, not the returned JPEG's
natural size, so zooming and clicking remain aligned.

A direct IIIF image-request URL can be used like any other image URL. Without
`info.json`, its rectangles must use the returned image's pixel dimensions.
For a service base URL rather than `info.json`, explicitly resolve it:

```js
import { loadIIIFImage } from 'ieee1599jslibrary/adapters/iiif';
const image = await loadIIIFImage('https://images.example.org/iiif/score-page-1');
// image: { url, width, height, version }; use width/height for source coordinates.
```

No IIIF Presentation manifests, annotation lists, tiled deep-zoom viewer,
MEI/MusicXML adapter or authentication flow is included. The service must
allow metadata fetches with CORS and provide the default JPEG representation;
unsupported versions, failed requests and malformed metadata are surfaced.
The client does not crop, rotate, resize, convert, encode or store derivatives.
IIIF servers can generate representations internally: confirm that your
institution permits the requested representation and access. An IIIF service
does not grant new media rights. Authentication queries on `info.json` are not
silently forwarded to another advertised image service.

See the [Image API 2.1](https://iiif.io/api/image/2.1/) and
[Image API 3.0](https://iiif.io/api/image/3.0/) specifications.

## An embeddable player

For a plain page, use the source modules (served over HTTP), without a bundler:

```html
<ieee1599-player src="./materials/piece.xml"></ieee1599-player>
<script type="module">
  import { defineIEEE1599Player } from './src/ui/player-element.js';
  defineIEEE1599Player();
</script>
```

For a package consumer, import
`ieee1599jslibrary/ui/player-element.js` and call `defineIEEE1599Player()`.
Registration is explicit and must happen once per custom-element name and
registry; simply importing a module registers nothing and creates no context.
The function returns a typed constructor for programmatic use.

Try the [embedding example](../examples/embed/index.html). It loads the first
graphic instance group, including IIIF pages, and offers indexed audio
recordings. The score is usable without audio. XML is loaded leniently by
default with visible validation findings; add the boolean `strict` attribute
to require DTD-valid documents. No source XML or metadata is inserted as HTML.

Audio uses the buffered player and is loaded only when the user presses Play
or calls `play()`; long recordings requiring streaming use the explicit
[streaming API](streaming.md), not an implicit backend switch. Video playback
is not part of this first embedding component.

The element exposes `src`, `load(url?)`, `play()`, `pause()`, `seek(seconds)`,
`dispose()`, `state`, `currentTime` and `duration`. `seek()` requires a loaded
recording and otherwise throws explicitly. Before audio has loaded,
score clicks remember a score event for the initial play. Recording changes
keep that score event but do not autoplay. `load` events contain
`{document, projection}`; transport events retain their usual detail.
All bubble and cross shadow boundaries. Failures are also shown inside the
component. Disconnecting aborts loading, disposes views and closes the owned
audio context; reconnecting reloads `src`. Concurrent components are isolated.

Style through inherited CSS variables or shadow parts `title`, `authors`,
`controls`, `status`, `error` and `score`. The controls use native buttons,
selects and ranges. There are no external scripts, fonts or runtime packages.
