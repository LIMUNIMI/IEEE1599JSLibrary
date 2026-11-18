import { parseIEEE1599 } from '../src/xml/parse.js';
import { createTimeline } from '../src/core/timeline.js';
import { createBufferedAudioPlayer } from '../src/media/buffered-audio.js';
import { createScoreView } from '../src/ui/score-view.js';
import { createTransportControls } from '../src/ui/transport-controls.js';

const xml = `<ieee1599>
  <general><description><main_title>Two notes</main_title></description></general>
  <logic><spine><event id="first" timing="0"/><event id="second" timing="1"/></spine></logic>
  <notational><graphic_instance_group><graphic_instance position_in_group="1" file_name="score.svg">
    <graphic_event event_ref="first" upper_left_x="165" upper_left_y="25" lower_right_x="200" lower_right_y="80"/>
    <graphic_event event_ref="second" upper_left_x="385" upper_left_y="10" lower_right_x="420" lower_right_y="65"/>
  </graphic_instance></graphic_instance_group></notational>
  <audio><track file_name="synthetic.wav"><track_indexing timing_type="seconds">
    <track_event event_ref="first" start_time="0"/><track_event event_ref="second" start_time="0.5"/>
  </track_indexing></track></audio>
</ieee1599>`;

/** @param {string} selector */
function element(selector) {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`Missing example element: ${selector}`);
  return found;
}

function syntheticWav() {
  const sampleRate = 24000;
  const bytes = new ArrayBuffer(44 + sampleRate * 2);
  const data = new DataView(bytes);
  /** @param {number} offset @param {string} text */
  const write = (offset, text) => [...text].forEach((character, i) => data.setUint8(offset + i, character.charCodeAt(0)));
  write(0, 'RIFF'); data.setUint32(4, bytes.byteLength - 8, true); write(8, 'WAVE');
  write(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
  data.setUint16(22, 1, true); data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  write(36, 'data'); data.setUint32(40, sampleRate * 2, true);
  for (let i = 0; i < sampleRate; i++) {
    const frequency = i < sampleRate / 2 ? 440 : 660;
    data.setInt16(44 + i * 2, Math.sin(2 * Math.PI * frequency * i / sampleRate) * 4000, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

const button = element('#initialize');
button.addEventListener('click', async () => {
  button.setAttribute('disabled', '');
  const message = element('#message');
  /** @type {ReturnType<typeof createBufferedAudioPlayer> | undefined} */
  let player;
  const url = URL.createObjectURL(syntheticWav());
  try {
    const activePlayer = createBufferedAudioPlayer();
    player = activePlayer;
    const score = parseIEEE1599(xml, { baseURL: location.href });
    const timeline = createTimeline(score.spine.map((event) => event.id), score.audioTracks[0].events);
    const audio = await player.loadAudio(url);
    player.addAudio(audio, { id: 'recording' });
    const view = createScoreView({
      container: element('#score'), page: score.graphicInstances[0].pages[0],
      onSeek: (eventRef) => activePlayer.seek(timeline.resolve(eventRef).time)
    });
    createTransportControls({ container: element('#controls'), player });
    let frame = 0;
    const refresh = () => {
      if (frame) cancelAnimationFrame(frame);
      if (!player) return;
      view.highlight(timeline.eventsAt(player.currentTime));
      frame = player.state === 'playing' ? requestAnimationFrame(refresh) : 0;
    };
    player.addEventListener('statechange', () => {
      if (frame) cancelAnimationFrame(frame);
      refresh();
    });
    player.addEventListener('positionchange', refresh);
    refresh();
    button.remove();
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
    if (player) await player.dispose();
    button.removeAttribute('disabled');
  } finally {
    URL.revokeObjectURL(url);
  }
});
