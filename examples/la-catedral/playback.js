import { createBufferedAudioPlayer } from '../../src/media/buffered-audio.js';
import { createSynchronizedMediaPlayer } from '../../src/media/synchronized-player.js';
import { createVideoPresenter, openVideo } from './video.js';

/**
 * @typedef {object} PerformanceTransport
 * @property {import('../../src/media/buffered-audio.js').BufferedAudioPlayer} player Audio group clock.
 * @property {boolean} playing Whether playback is active or intended to resume.
 * @property {boolean} buffering Whether audio or a video view is waiting for media.
 * @property {() => Promise<void>} play Start the aligned media group.
 * @property {() => void} pause Pause the aligned media group.
 * @property {(seconds: number) => Promise<void>} seek Seek all aligned media.
 * @property {() => Promise<void>} present Present video at the current audio time.
 * @property {() => Promise<void>} dispose Release the group and its resources.
 */

/**
 * Create one transport for assets already aligned to the same clock. A single
 * audio file and an aligned audio group use the same path.
 * @param {{context: AudioContext, audio: {url: string, offset?: number}[],
 *   video?: string, canvas: HTMLCanvasElement, signal: AbortSignal}} options
 * @returns {Promise<PerformanceTransport>}
 */
export async function openPerformance({ context, audio, video, canvas, signal }) {
  const player = createBufferedAudioPlayer({ context });
  /** @type {Awaited<ReturnType<typeof openVideo>> | undefined} */
  let picture;
  try {
    const buffers = await Promise.all(audio.map(({ url }) => player.loadAudio(url, { signal })));
    signal.throwIfAborted();
    buffers.forEach((buffer, i) => player.addAudio(buffer, { id: String(i), offset: audio[i].offset }));
    if (video) picture = await openVideo(video, canvas, signal);
    signal.throwIfAborted();

    const view = picture ? createVideoPresenter(picture) : undefined;
    const transport = createSynchronizedMediaPlayer({
      audio: player,
      videos: view ? [view] : []
    });
    let wantsPlay = false;
    return {
      player,
      get playing() { return wantsPlay && player.state !== 'ended'; },
      get buffering() { return transport.buffering || player.state === 'buffering'; },
      async play() {
        if (wantsPlay && player.state !== 'ended') return;
        wantsPlay = true;
        try {
          await transport.play();
        } catch (error) {
          wantsPlay = false;
          throw error;
        }
      },
      pause() {
        wantsPlay = false;
        transport.pause();
      },
      /** @param {number} seconds */
      seek(seconds) {
        return transport.seek(seconds);
      },
      async present() {
        if (!wantsPlay || player.state !== 'playing') return;
        await transport.present();
      },
      async dispose() {
        wantsPlay = false;
        await transport.dispose();
      }
    };
  } catch (error) {
    picture?.dispose();
    await player.dispose();
    throw error;
  }
}
