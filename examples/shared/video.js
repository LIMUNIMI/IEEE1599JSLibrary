/**
 * Example-only canvas presentation of an MP4/QuickTime track using native
 * WebCodecs. Transport and synchronization remain owned by each example.
 * @module examples/shared/video
 */
import { openMediabunnyInput } from '../../src/adapters/mediabunny.js';

/**
 * @param {object} track
 * @returns {track is import('mediabunny').InputVideoTrack}
 */
function isVideoSourceTrack(track) {
  return 'type' in track && track.type === 'video' && 'getCodedWidth' in track
    && typeof track.getCodedWidth === 'function';
}

/**
 * Open one video track from a URL or private local Blob.
 * @param {string | Blob} source URL, File or Blob.
 * @param {HTMLCanvasElement} canvas Target canvas.
 * @param {AbortSignal} signal Cancels opening and disposes the demuxer.
 * @returns {Promise<{
 *   duration: number | null,
 *   frameAt: (position: number) => Promise<import('mediabunny').VideoSample | null>,
 *   samples: (position: number) => AsyncGenerator<import('mediabunny').VideoSample, void, unknown>,
 *   draw: (sample: import('mediabunny').VideoSample) => void,
 *   dispose: () => void
 * }>}
 * @throws {Error} If WebCodecs, the container or video codec is unsupported.
 */
export async function openVideo(source, canvas, signal) {
  if (typeof VideoDecoder === 'undefined') throw new Error('Video playback needs WebCodecs in a secure context');
  const mediabunny = await import('mediabunny');
  const input = await openMediabunnyInput({ mediabunny, source, signal });
  try {
    const track = input.tracks.find((candidate) => candidate.type === 'video');
    if (!track) throw new Error('The MP4/QuickTime file has no video track');
    if (!track.canDecode || !track.decoderConfig) {
      throw new Error(`This browser cannot decode video codec ${track.codec ?? '(unknown)'}`);
    }
    if (!isVideoSourceTrack(track.sourceTrack)) throw new Error('Mediabunny did not return a video track');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video canvas is unavailable');
    const sink = new mediabunny.VideoSampleSink(track.sourceTrack);
    let disposed = false;
    return {
      duration: track.duration,
      /** @param {number} position */
      frameAt(position) {
        if (disposed) throw new Error('Video input is disposed');
        return sink.getSample(position);
      },
      /** @param {number} position */
      samples(position) {
        if (disposed) throw new Error('Video input is disposed');
        return sink.samples(position);
      },
      /** @param {import('mediabunny').VideoSample} sample */
      draw(sample) {
        if (disposed) throw new Error('Video input is disposed');
        if (canvas.width !== sample.displayWidth) canvas.width = sample.displayWidth;
        if (canvas.height !== sample.displayHeight) canvas.height = sample.displayHeight;
        sample.draw(context, 0, 0, canvas.width, canvas.height);
        canvas.dataset.timestamp = String(sample.timestamp);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        input.dispose();
      }
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

/**
 * Present frames sequentially with one decoded sample queued at most.
 * @param {Awaited<ReturnType<typeof openVideo>>} picture
 * @returns {{
 *   seek: (position: number) => Promise<void>,
 *   present: (position: number) => Promise<void>,
 *   isBuffering: (position: number) => boolean,
 *   whenReady: () => Promise<void>,
 *   dispose: () => void
 * }}
 */
export function createVideoPresenter(picture) {
  /** @typedef {import('mediabunny').VideoSample} Sample */
  /** @typedef {{iterator: AsyncGenerator<Sample, void, unknown>, next?: Sample,
   *   pending?: Promise<void>, eof: boolean, until: number, position: number,
   *   error?: unknown}} FrameRun */
  /** @type {FrameRun | undefined} */
  let run;
  /** @type {Promise<void> | undefined} */
  let seeking;
  let generation = 0;
  let disposed = false;

  function clearRun() {
    const old = run;
    run = undefined;
    old?.next?.close();
    void old?.iterator.return().catch(() => {});
  }

  /** @param {FrameRun} active */
  function prefetch(active) {
    if (active.pending || active.eof || active.next || active.error !== undefined) return;
    active.pending = active.iterator.next().then((result) => {
      if (result.done) active.eof = true;
      else if (active === run) active.next = result.value;
      else result.value.close();
    }).catch((error) => { active.error = error; })
      .finally(() => { active.pending = undefined; });
  }

  /** @param {number} position */
  function seek(position) {
    if (disposed) return Promise.reject(new Error('Video presenter is disposed'));
    if (!Number.isFinite(position) || position < 0) return Promise.reject(new Error('Invalid video position'));
    const id = ++generation;
    clearRun();
    const operation = (async () => {
      const first = await picture.frameAt(position);
      if (!first) throw new Error('Video has no frame at the requested time');
      try {
        if (id !== generation || disposed) return;
        picture.draw(first);
        /** @type {FrameRun} */
        const active = {
          iterator: picture.samples(first.timestamp + first.duration / 2),
          until: first.timestamp + first.duration,
          eof: false,
          position
        };
        run = active;
        prefetch(active);
        await active.pending;
        while (run === active && active.next && active.next.timestamp < active.until - 0.00001) {
          active.next.close();
          active.next = undefined;
          prefetch(active);
          await active.pending;
        }
        if (active.error !== undefined) throw active.error;
      } finally {
        first.close();
      }
    })();
    const wrapped = operation.finally(() => {
      if (seeking === wrapped) seeking = undefined;
    });
    seeking = wrapped;
    return wrapped;
  }

  return {
    seek,
    /** @param {number} position */
    isBuffering(position) {
      return Boolean(run && !run.eof && !run.next && run.pending && position >= run.until - 0.00001);
    },
    async whenReady() {
      const active = run;
      if (!active) return;
      await active.pending;
      if (active.error !== undefined) throw active.error;
    },
    /** @param {number} position */
    async present(position) {
      if (disposed) return;
      if (!Number.isFinite(position) || position < 0) throw new Error('Invalid video position');
      if (seeking) return;
      if (!run) return seek(position);
      if (position < run.position - 0.05 || position - run.position > 0.5) return seek(position);
      run.position = position;
      if (run.error !== undefined) throw run.error;
      while (run.next && run.next.timestamp <= position + 0.00001) {
        const sample = run.next;
        run.next = undefined;
        try {
          picture.draw(sample);
          run.until = sample.timestamp + sample.duration;
        } finally {
          sample.close();
        }
        prefetch(run);
        if (run.pending) break;
      }
      prefetch(run);
      if (run.error !== undefined) throw run.error;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      clearRun();
      picture.dispose();
    }
  };
}
