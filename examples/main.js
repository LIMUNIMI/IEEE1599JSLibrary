import { parseIEEE1599Document } from '../src/model/document.js';
import { createPlayerProjection } from '../src/xml/parse.js';
import { createTimeline } from '../src/core/timeline.js';
import { createBufferedAudioPlayer } from '../src/media/buffered-audio.js';
import { createScoreView } from '../src/ui/score-view.js';
import { createTransportControls } from '../src/ui/transport-controls.js';

// A complete, DTD-valid IEEE 1599 document: two half notes on one staff.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ieee1599 SYSTEM "https://www.lim.di.unimi.it/IEEE/ieee1599.dtd">
<ieee1599 version="1.0" creator="IEEE1599JSLibrary example">
  <general><description><main_title>Two notes</main_title></description></general>
  <logic>
    <spine><event id="first" timing="0" hpos="0"/><event id="second" timing="512" hpos="220"/></spine>
    <los>
      <staff_list><staff id="staff"><clef shape="G" staff_step="2" event_ref="first"/></staff></staff_list>
      <part id="melody">
        <voice_list><voice_item id="voice" staff_ref="staff"/></voice_list>
        <measure number="1"><voice voice_item_ref="voice">
          <chord event_ref="first"><duration num="1" den="2"/><notehead><pitch step="A" octave="4"/></notehead></chord>
          <chord event_ref="second"><duration num="1" den="2"/><notehead><pitch step="E" octave="5"/></notehead></chord>
        </voice></measure>
      </part>
    </los>
  </logic>
  <notational><graphic_instance_group description="Synthetic score">
    <graphic_instance position_in_group="1" file_name="score.svg" file_format="application_octet-stream"
      encoding_format="application_octet-stream" measurement_unit="pixels">
      <graphic_event event_ref="first" upper_left_x="165" upper_left_y="25" lower_right_x="200" lower_right_y="80"/>
      <graphic_event event_ref="second" upper_left_x="385" upper_left_y="10" lower_right_x="420" lower_right_y="65"/>
    </graphic_instance>
  </graphic_instance_group></notational>
  <audio><track file_name="synthetic.wav" file_format="audio_wav" encoding_format="audio_wav">
    <track_indexing timing_type="seconds">
      <track_event event_ref="first" start_time="0"/><track_event event_ref="second" start_time="0.5"/>
    </track_indexing>
  </track></audio>
</ieee1599>`;

/**
 * Describe the LOS symbols attached to a Spine event, e.g. `chord A4`.
 * @param {import('../src/model/document.js').IEEE1599Document} doc
 * @param {string} id Spine event ID.
 */
function describeEvent(doc, id) {
  const event = doc.spine.get(id);
  const symbols = doc.los.forEvent(id).filter((symbol) => symbol.name === 'chord' || symbol.name === 'rest')
    .map((symbol) => {
      const pitches = symbol.descendants('pitch').map((pitch) => `${pitch.attributes.step}${pitch.attributes.octave}`);
      const measure = doc.los.measureOf(symbol)?.attributes.number;
      return `${symbol.name} ${pitches.join(' ')} (staff ${doc.los.staffOf(symbol)?.attributes.id}, measure ${measure})`.replace('  ', ' ');
    });
  return `${id}: VTU ${event?.vtu ?? 'unknown'}, ${symbols.join('; ') || 'no LOS symbol'}`;
}

/**
 * Show the validated document model: layers, Spine and LOS.
 * @param {import('../src/model/document.js').IEEE1599Document} doc
 */
function showModel(doc) {
  const layers = /** @type {const} */ (['general', 'logic', 'structural', 'notational', 'performance', 'audio']).filter((name) => doc.layer(name));
  element('#validation').textContent = `${doc.valid ? 'Valid' : 'Invalid'} against IEEE 1599 DTD 1.0 (${doc.issues.length} findings). Layers: ${layers.join(', ')}.`;
  element('#events').replaceChildren(...doc.spine.events.map((event) => {
    const item = document.createElement('li');
    item.textContent = describeEvent(doc, event.id);
    return item;
  }));
}

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
    const doc = parseIEEE1599Document(xml, { baseURL: location.href });
    showModel(doc);
    const score = createPlayerProjection(doc);
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
      const current = timeline.eventsAt(player.currentTime);
      view.highlight(current);
      element('#now').textContent = current.map((id) => describeEvent(doc, id)).join('; ');
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
