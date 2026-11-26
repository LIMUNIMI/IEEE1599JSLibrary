/**
 * Synthetic native-rate streaming example. Real files require a read-only
 * packet reader; see the streaming guide for Mediabunny integration.
 * @module examples/streaming
 */
import { createStreamingAudioPlayer } from '../../src/media/streaming-audio.js';
import { createTransportControls } from '../../src/ui/transport-controls.js';

/** @type {Awaited<ReturnType<typeof createStreamingAudioPlayer>> | null} */
let player = null;
/** @type {{dispose(): void} | null} */
let controls = null;
let frame = 0;
const button = document.querySelector('#initialize');
const container = document.querySelector('#controls');
const status = document.querySelector('#status');
const errorOutput = document.querySelector('#error');
if (!(button instanceof HTMLButtonElement) || !(container instanceof HTMLElement) || !status || !errorOutput) {
  throw new Error('Missing streaming example elements');
}
/** Render metrics, never drive the audio clock. */
function refresh() {
  cancelAnimationFrame(frame);
  if (!player || !status) return;
  status.textContent = `${player.state}: ${player.currentTime.toFixed(2)} s; retained PCM ${player.bufferedFrames}/${player.capacity} frames per channel`;
  frame = player.state === 'playing' || player.state === 'buffering' ? requestAnimationFrame(refresh) : 0;
}
button.addEventListener('click', async () => {
  button.disabled = true;
  errorOutput.textContent = '';
  try {
    player = await createStreamingAudioPlayer({
      bufferSeconds: 1,
      track: {
        duration: 10,
        decoderConfig: { codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 1 },
        async *chunks(seconds, signal) {
          for (let packet = Math.floor(seconds * 20); packet < 200; packet++) {
            signal.throwIfAborted();
            const samples = Float32Array.from({ length: 2400 }, (_, i) =>
              Math.sin((packet * 2400 + i) * 2 * Math.PI * 220 / 48000) * 0.1);
            yield new EncodedAudioChunk({ type: 'key', timestamp: packet * 50000, duration: 50000, data: samples });
          }
        }
      }
    });
    controls = createTransportControls({ container, player });
    player.addEventListener('statechange', refresh);
    player.addEventListener('positionchange', refresh);
    refresh();
  } catch (error) {
    errorOutput.textContent = error instanceof Error ? error.message : String(error);
    button.disabled = false;
  }
});
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(frame);
  controls?.dispose();
  player?.dispose().catch((error) => { errorOutput.textContent = String(error); });
});
