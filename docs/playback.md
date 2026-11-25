# Score and playback integration

Load the document once, project the player data, and build one timeline per
recording. A Spine ID bridges the recording and the score; the Spine's VTU
positions are not media seconds.

```js
import { createBufferedAudioPlayer, createPlayerProjection, createTimeline,
  loadIEEE1599Document } from '../src/index.js';
import { createScoreView } from '../src/ui/score-view.js';

const doc = await loadIEEE1599Document('./piece.xml');
const { spine, graphicInstances, audioTracks } = createPlayerProjection(doc);
const track = audioTracks[0]; // Choose an indexed, audio-only recording.
const timeline = createTimeline(spine.map(({ id }) => id), track.events);
const player = createBufferedAudioPlayer();
const buffer = await player.loadAudio(track.url);
player.addAudio(buffer, { id: 'performance' });
const score = createScoreView({
  container: document.querySelector('#score'),
  page: graphicInstances[0].pages[0],
  onSeek: (id) => player.seek(timeline.resolve(id).time)
});
```

Wire `play()` to a user gesture and handle its rejection. `pause()` preserves
position; `seek(0)` after pausing rewinds, including any lead-in. Playback
restarts from zero after it ends. Use `player.currentTime` with
`timeline.eventsAt()` to drive `score.highlight()`; render on animation frames
but never use them as the playback clock. Listen for `statechange`,
`positionchange`, and `error` for command and lifecycle updates; position events
are not a continuous media clock. Dispose the view and `await player.dispose()`
when leaving the player. Abort outstanding loads with an `AbortSignal`.

## Groups and alternate performances

| Scenario | Approach |
| --- | --- |
| One recording | Add one decoded buffer before playing. |
| Several recordings with already aligned time | Add them to the same player. Supply `offset` for delayed starts. All required sources share one clock; the last required source determines the end. |
| Alternate performances of one score | Keep separate timelines. Find the current event in the old recording and resolve it on the new one; sparse mappings use the nearest earlier mapped event in Spine order, then the first later one. |

Use `setGain(id, gain)` (linear, `0` mutes), `setPan(id, pan)` (`-1` to `1`
for mono or stereo), and `setRate(rate)` (speed and pitch change together).
An injected AudioContext is host-owned. An internally created context is
closed on disposal. Buffers are fully decoded in memory, so load only what
the application can retain. Check `player.diagnostics.snapshot()` for bounded
structured diagnostics; use `diagnostics: { verbose: true }` for more detail.

See the [capability record](capabilities.md) for verification and limitations,
and the [migration guide](migration.md) for replacements for legacy player APIs.
