# Build your own player

This guide is for musicologists, archivists and teachers who have music
encoded in IEEE 1599 and want a web page where people can listen to a
recording while the score follows along. You need to be comfortable editing a
text file; you do not need to be a programmer. Each step says what to do,
what you should see, and what to try if you do not see it.

By the end you will have a page that:

- shows the title and authors of your piece;
- displays the score pages and highlights what is sounding;
- lets listeners click a note in the score to jump there in the recording;
- turns pages automatically during playback;
- switches between recordings of the same piece while staying at the same
  place in the score.

The page uses only the web browser: no plugins, frameworks or build step.

## What you are looking at

The project home page links to many documents. You only need a few of them:

| If you want to… | Open |
| --- | --- |
| Build a player for your material (this guide) | You are here. |
| See a tiny player working without any files of your own | [Minimal player](../examples/index.html) |
| Check whether your XML is valid and what it contains | [Document inspector](../examples/inspector/index.html) |
| See a complete, real-world player (several instruments, angles, video) | [DmITE example](../examples/dmite/README.md) |
| Look up a function used in the code | [API reference](../api/index.html) |
| Know which file formats work in which browsers | [Capabilities](capabilities.md) |

The other documents (architecture, roadmap, modernization, schema reference)
are for people developing the library itself. You can ignore them for now.

## 1. How IEEE 1599 drives a player

An IEEE 1599 document describes one piece in several *layers*. A player
needs three of them, all tied together by the **Spine**, the list of every
musical event in the piece, each with an `id`:

```text
 Notational layer                 Logic layer: Spine          Audio layer
 score page + one rectangle  ───▶  event id="e1"        ◀───  recording + the second
 per event (event_ref)             event id="e2"              at which each event
                                   …                          starts (event_ref)
```

In XML, the same event `e12` appears three times:

```xml
<spine> … <event id="e12" timing="512" hpos="220"/> … </spine>

<graphic_instance file_name="scores/page1.png" position_in_group="1" …>
  <graphic_event event_ref="e12" upper_left_x="380" upper_left_y="90"
                 lower_right_x="410" lower_right_y="150"/>
</graphic_instance>

<track file_name="audio/take1.wav" file_format="audio_wav">
  <track_indexing timing_type="seconds">
    <track_event event_ref="e12" start_time="4.75"/>
  </track_indexing>
</track>
```

So "the note in this rectangle sounds 4.75 seconds into *take1*". That link
is all the player uses: while the recording plays, it looks up which events
have started and highlights their rectangles; when you click a rectangle, it
looks up the time of that event and jumps there. A second `<track>` with its
own `start_time` values is another performance of the same score.

Your document must therefore have:

- a `<spine>` in the logic layer;
- at least one `<graphic_instance>` (a score page) with `<graphic_event>`
  rectangles, measured in image pixels;
- at least one `<track>` whose `<track_indexing>` uses
  `timing_type="seconds"`.

Everything else in your document (structural analysis, performance
encodings, other layers) is kept by the library and available to your code,
but the starter player does not display it. See the
[data model guide](data-model.md) when you want to use it.

## 2. Install the tools

You need these once per computer:

1. [Node.js 26 LTS](https://nodejs.org/). It runs the small local web server.
2. A current desktop browser: Chrome, Edge, Firefox or Safari.
3. Optionally, [Visual Studio Code](https://code.visualstudio.com/) to edit
   files and open a terminal (*Terminal → New Terminal*) in the project.

Get the project, either by cloning
`https://github.com/LIMUNIMI/IEEE1599JSLibrary` with Git or with
*Code → Download ZIP* on GitHub and unzipping it. Nothing else needs to be
installed to build a player. ([pnpm](https://pnpm.io/installation) is only
needed to run the project's checks or rebuild this documentation; with it,
`pnpm run serve` is a shortcut for the server command below.)

## 3. Check your document

Before building anything, find out whether the browser can read your file.

1. Open a terminal in the project folder and start the local server:

   ```sh
   node tools/serve.js
   ```

   It prints `Serving on http://127.0.0.1:8000/`. Leave it running; stop it
   later with Ctrl+C. Use `node tools/serve.js --port 8080` if port 8000 is
   busy.
2. Open <http://127.0.0.1:8000/examples/inspector/> and choose your XML file.
3. Read the summary. *valid against IEEE 1599 DTD 1.0* is ideal. Findings
   are listed with the element they concern. Click a Spine event to see
   which layers mention it: for a player you want to see both `notational`
   and `audio`.

Why a server? Browsers refuse to let a page opened directly from disk
(`file://…`) read other files. The server only answers your own computer
(`127.0.0.1`); nothing is published or uploaded.

## 4. Put your material in place

The starter player lives in `examples/starter/`. Create a folder named
`materials` inside it and copy your document and its files there, keeping the
paths written in the XML. If the XML says `file_name="scores/page1.png"` and
`file_name="audio/take1.wav"`, the folder must look like this:

```text
examples/starter/
├── index.html          the page
├── main.js             the player logic
└── materials/          your files (ignored by Git, never published)
    ├── piece.xml
    ├── scores/
    │   ├── page1.png
    │   └── page2.png
    └── audio/
        ├── take1.wav
        └── take2.mp3
```

Paths in the XML are relative to the XML file and are case-sensitive on most
web servers: `Page1.PNG` and `page1.png` are different files.

The `materials` folder is listed in `.gitignore`, so your files are not
committed by accident. Only publish material you have the rights to share.

## 5. Open your player

With the server running, open
<http://127.0.0.1:8000/examples/starter/>. The *IEEE 1599 document* field
says `materials/piece.xml`; change it if your file has another name, then
press **Open**. You can also link straight to a document:
`http://127.0.0.1:8000/examples/starter/?document=materials/my-piece.xml`.

You should see the title, the authors, a **Recording** list, a **Play**
button with a position slider, and the first score page. Then:

- press **Play**: rectangles light up as the music reaches them and pages
  turn on their own;
- click a highlighted area of the score: the recording jumps there;
- choose another recording: it continues from the same place in the score,
  which makes comparing performances easy;
- use **Previous page** / **Next page** to browse while paused.

The red message line explains anything that went wrong; see
[troubleshooting](#troubleshooting).

## 6. Make it your own

Everything the page does is in two short, commented files.

**Appearance** — `examples/starter/index.html` holds the page text and a
`<style>` block. Change the heading, add an introduction or a logo, or change
fonts and colours there.

**Behaviour** — `examples/starter/main.js` is organized in small functions,
each with a description above it:

| Function | What it does | Typical change |
| --- | --- | --- |
| `open()` | Loads the XML, shows title/authors, lists recordings. | Show more metadata, such as `piece.metadata.workTitle`. |
| `playableRecordings()` | Chooses which `<track>` elements appear in the list. | Hide some recordings, or name them differently. |
| `useRecording()` | Loads one recording and resumes at the same score event. | Start every recording from the beginning instead. |
| `showPage()` | Displays one score page and connects clicks to the recording. | Show two pages side by side. |
| `refresh()` | Highlights current events and turns pages while playing. | Show the bar number or the notes being played. |

The page uses four library functions. Their full descriptions are in the
[API reference](../api/index.html):

1. `loadIEEE1599Document(url)` reads and validates the XML into a document
   model with all six layers.
2. `createPlayerProjection(doc)` extracts what a player needs: metadata,
   Spine, score pages with rectangles, and recordings with event times.
3. `createTimeline(spineIds, recording.events)` answers "which events are
   sounding at 12.3 s?" (`eventsAt`) and "when does event `e12` start?"
   (`resolve`).
4. `createBufferedAudioPlayer()` plays recordings with precise timing.
   `createScoreView()` and `createTransportControls()` provide the score and
   Play button.

To display what is happening musically, use the document model. For example,
to show the pitches of the current event:

```js
const pitches = doc.los.forEvent('e12')
  .flatMap((symbol) => symbol.descendants('pitch'))
  .map((pitch) => `${pitch.attributes.step}${pitch.attributes.octave}`);
```

The [minimal player](../examples/index.html) source (`examples/main.js`) does
this with bar numbers and staves. The [data model guide](data-model.md)
explains all the available lookups.

## 7. Going further

- **Several recordings together** (one per microphone or instrument, played
  in sync): see [groups and alternate performances](playback.md#groups-and-alternate-performances)
  and the [DmITE example](../examples/dmite/README.md).
- **Video** of the performance, kept in sync with the audio: the DmITE example
  shows MP4 and QuickTime video drawn on the page. Read
  [optional MP4 and QuickTime demuxing](playback.md#optional-mp4-and-quicktime-demuxing)
  for what it needs.
- **File formats**: WAV and MP3 are widely supported; AIFF, TIFF, AVI and some
  video codecs depend on the browser. The project never converts your files.
  See [capabilities](capabilities.md) for the current evidence.
- **Several pieces**: keep one folder per piece in `materials` and link to
  each with `?document=materials/<piece>/piece.xml`.

## 8. Publish your player

The player is a set of static files, so any web host that serves files over
HTTPS works: a university web space, GitHub Pages, or similar. You do not need
to run Node.js on the host.

1. Create a folder for your site and copy into it:

   ```text
   my-player/
   ├── index.html     from examples/starter/
   ├── main.js        from examples/starter/
   ├── lib/           a copy of the project's src/ folder
   └── materials/     your document, scores and recordings
   ```

2. In `main.js`, change the three `../../src/` imports to `./lib/`, for
   example `from './lib/index.js'`.
3. Test the folder locally with
   `node tools/serve.js --root path/to/my-player`, then upload the whole folder
   to your host.

Before publishing, confirm that you have the right to distribute every score
image and recording. Large recordings are downloaded completely before
playback starts, so consider the size of your files for listeners on mobile
connections.

## Troubleshooting

| Message or symptom | Likely cause and fix |
| --- | --- |
| The page is blank or the console mentions CORS / modules | The page was opened from disk. Run `node tools/serve.js` and use an `http://127.0.0.1` address. |
| `HTTP 404` while opening the document | The *IEEE 1599 document* path is wrong. It is relative to the starter page, for example `materials/piece.xml`. |
| `Cannot play …: Audio fetch failed: HTTP 404` | The recording path in `<track file_name>` does not match a file. Check folders and capitalization. The other recordings in the list still work. |
| `Cannot play …` followed by a decoding error | The browser cannot decode that file format; see [capabilities](capabilities.md). |
| `The document has no score pages` | The notational layer has no `<graphic_instance>`. |
| `The document has no indexed audio recording` | No `<track>` has `<track_event>` times in seconds, or all tracks are video. |
| `Opened with N validation finding(s)` | The player works, but the XML does not fully follow the DTD. Review the findings in the [inspector](../examples/inspector/index.html). |
| The score shows but nothing is highlighted | The `graphic_event` and `track_event` elements do not share `event_ref` values, or the rectangles are outside the image. Check a Spine event in the inspector. |
| Pressing Play does nothing on a phone | Check that the phone is not in silent mode; browsers also require a tap before sound can start. |
