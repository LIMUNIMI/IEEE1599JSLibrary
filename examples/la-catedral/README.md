# La Catedral: score-following example

The demo displays a selectable score edition on a canvas and follows one of
three performances: Barrios (MP3), Mavrudis (MP3), or Vidovic (video with its
original soundtrack). Click a mapped rectangle or use the keyboard-accessible
score-event selector to seek. Switching performances uses the current score
event, not the current recording timestamp. Stop rewinds to the beginning of
the selected recording. The video starts about 84 seconds before the first
mapped note; choose the first score event to skip the lead-in.

The XML is loaded with `loadIEEE1599Document()` in the default strict mode,
so a DTD-invalid file stops the demo. Its warnings (the IEEE 2008 DOCTYPE
system identifier) are written to the console, and the page shows the measure
and pitches of the highlighted events from the LOS.

## Run locally

The supplied XML, score images, recordings and derivatives are **not included**
in this repository. Use your own authorized copy of the `LaCatedral` source
folder. From the repository root, with Node.js, PowerShell and FFmpeg
(`libx264` enabled):

```powershell
pnpm install --frozen-lockfile
.\examples\la-catedral\prepare.ps1 -Source 'C:\path\to\LaCatedral'
python -m http.server 8000 --bind 127.0.0.1
```

Open [the local demo](http://127.0.0.1:8000/examples/la-catedral/). Use a browser
that supports WebCodecs and H.264 on localhost or HTTPS. The script works only on
local files. It copies XML, MP3 and JPEG files, converts the TIFF to PNG without
resizing, transcodes the AVI's legacy video to H.264, and copies its MP3
soundtrack out without re-encoding. The source folder is not modified, and
the output directory (`examples/la-catedral/local`) is Git-ignored. Serve the
demo only to people permitted to access these assets.

The MP4 is downloaded as one file in this example. Mediabunny (MPL-2.0) is an
example-only dependency that reads the MP4 and decodes with browser WebCodecs;
the example retains a canvas image and one look-ahead frame outside the
adapter's own decoder queue. The soundtrack is fully predecoded in Web
Audio and supplies the clock. Video starvation detected during presentation
pauses the soundtrack while waiting for the next frame. There is no HTML
media fallback. This does not implement a general streaming transport, an
audio-device-to-display latency guarantee, or a video-only clock.

## Single recording and synchronized groups

One selection is normally one audio file. The video selection is one
performance with an aligned soundtrack and video picture. For independently
recorded performances, look up each target time in its own score mapping.
For multiple *already aligned* audio files, the example's `openPerformance`
accepts all their URLs in one `audio` array. Use the same `AudioContext` clock
and optionally set the start offset of each member in seconds:

```js
const group = await openPerformance({
  context,
  canvas,
  signal: controller.signal,
  audio: [{ url: 'voice.mp3' }, { url: 'instrument.mp3', offset: 0.25 }]
});
await group.play();
```

The real-fixture browser tests run with `pnpm run test:browser` when the assets
have been prepared locally; otherwise the fixture-specific tests are skipped.
See the [capability evidence](../../docs/capabilities.md) for what was verified.
