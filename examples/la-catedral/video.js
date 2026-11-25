// The optional example dependency is not imported by the library.
import { BlobSource, Input, MP4, VideoSampleSink } from 'mediabunny';

/**
 * @param {string} url
 * @param {HTMLCanvasElement} canvas
 * @param {AbortSignal} signal
 */
export async function openVideo(url, canvas, signal) {
  if (typeof VideoDecoder === 'undefined') throw new Error('Video playback needs WebCodecs in a secure context');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Video request failed: HTTP ${response.status}`);
  const blob = await response.blob();
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error('Browser cannot decode this H.264 video with WebCodecs');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video canvas is unavailable');
    signal.throwIfAborted();
    const sink = new VideoSampleSink(track);
    return {
      /** @param {number} position */
      frameAt(position) { return sink.getSample(position); },
      /** @param {number} position */
      samples(position) { return sink.samples(position); },
      /** @param {import('mediabunny').VideoSample} sample */
      draw(sample) {
        if (canvas.width !== sample.displayWidth) canvas.width = sample.displayWidth;
        if (canvas.height !== sample.displayHeight) canvas.height = sample.displayHeight;
        sample.draw(context, 0, 0, canvas.width, canvas.height);
        canvas.dataset.timestamp = String(sample.timestamp);
      },
      dispose() { input.dispose(); }
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
