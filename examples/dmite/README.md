# DmITE listening example

This is a new, framework-free example built with the IEEE 1599 library,
modeled on the [DmITE reference player](../../docs/dmite-comparison.md).
The reference application was not modified. No recordings, score images,
configuration XML or third-party UI libraries are distributed here.

## Load your private assets

Open the [example](index.html) on the documentation site or serve the
repository [locally over HTTP](../../docs/getting-started.md#run-the-examples).
Choose the single `assets` folder in the page picker. It reads files in the
browser without uploading them. If the browser does not support a directory
picker, put the same folder at `examples/dmite/assets/`, serve the checkout
on localhost, and use **Served assets**. Do not do this on a public server.

```text
assets/
  variationsserieuses.xml
  params.xml
  score_files/
    <score images named in the IEEE 1599 XML>
  audio_files/
    <instrument name>/
      <track_prefix>_<track_suffix>.wav
      <track_prefix><video_suffix>
```

Keep case and paths exactly as in both XML files. The example offers the
instrument/angle pairs that match an indexed WAV in the IEEE 1599 document
and fully decodes the selected recording before playing. An instrument's
`video_suffix` in `params.xml` is matched to its indexed video track in the
IEEE 1599 XML; each listening panel displays that instrument's video when
available. Video follows the selected recording by anchoring to the latest
shared Spine event and advancing on the same transport clock. It does not
preload the entire collection. The synchronized transport primes all available
video panels before starting or resuming audio after a seek or recording
change. If video decoding falls behind, audio pauses while the panels catch
up, then resumes automatically; **Buffering video** indicates this wait.
Instrument and angle changes keep the current score event instead of briefly
rewinding other panels. Pausing during buffering cancels automatic resume.
The reference score XML is read in lenient mode
because of known DTD findings; malformed XML and invalid projection data
still fail. Use the [document inspector](../inspector/index.html) for details.

## Layout

The page approximates the original player's look: a red header, the score
band, three listening panels side by side and a grey transport bar. It uses
the system's Open Sans when installed and downloads no fonts. Each panel's
video keeps its aspect ratio while filling the panel, and the panels resize
with the window. Narrow portrait screens stack the panels and scroll.

The angle is chosen with a native rotary knob overlaid on the video in place
of the original jqWidgets knob. Drag or click the translucent red pointer
around the ring; it snaps to the recorded angles. The knob is also a slider,
so arrow keys change the angle when it has focus. When no video is shown, the
ring and its Front/Right/Back/Left labels are drawn as a compass. The **?**
button shows help.

## Listen

Choose instruments and angles independently on the three panels. The speaker
radio button selects which panel is audible; switching preserves the current
score event using the target recording's timeline. The score follows playback
across pages. Click a mapped rectangle or use **Event → Go to event** with a
keyboard. **Rewind** pauses and returns to the start. The ‹ and › buttons
change speed in five percent steps between 50% and 100%, which also changes
pitch; the metronome button resets it.

The **Melody / One note** switch selects One Note mode, which plays to the
next distinct mapped timestamp (or the recording end). It uses the Web Audio
clock and stops on the next display update; it is not a sample-accurate
editing tool and pauses when the page is hidden.

## Video limits

The example reads MP4 and QuickTime containers through the optional
Mediabunny module and decodes with browser-native WebCodecs into canvases.
The pinned module bundle is loaded from jsDelivr, so video needs an internet
connection; the private media files are still read locally and are never
uploaded. No `<video>` element, transcoding, remuxing, encoding or derivative
generation is used. Audio remains available if a video's container or codec
is unsupported; the affected panel reports the reason and shows the knob as a compass.

AVI is not a supported container. H.264 and other codecs work only where that
browser exposes a compatible WebCodecs decoder. Desktop and mobile support
varies by browser, operating system, hardware and codec profile; use the status
shown in each panel as the capability result for the current file and device.
