import { createBufferedAudioPlayer } from '../../src/media/buffered-audio.js';
import { openVideo } from './video.js';

/**
 * Create one transport for assets already aligned to the same clock. A single
 * audio file and an aligned audio group use the same path.
 * @param {{context: AudioContext, audio: {url: string, offset?: number}[],
 *   video?: string, canvas: HTMLCanvasElement, signal: AbortSignal}} options
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
  } catch (error) {
    picture?.dispose();
    await player.dispose();
    throw error;
  }

  /** @typedef {import('mediabunny').VideoSample} Sample */
  /** @typedef {{ iterator: AsyncGenerator<Sample, void, unknown>, next?: Sample,
   *   pending?: Promise<void>, eof: boolean, until: number }} FrameRun */
  /** @type {FrameRun | undefined} */
  let run;
  let command = 0;
  let wantsPlay = false;
  let seeking = false;
  let recovering = false;

  function clearRun() {
    const old = run;
    run = undefined;
    old?.next?.close();
    void old?.iterator.return().catch(() => { /* An aborted iterator has already been invalidated. */ });
  }

  /** @param {FrameRun} active */
  function prefetch(active) {
    if (active.pending || active.eof || active.next) return;
    active.pending = active.iterator.next().then((result) => {
      if (result.done) active.eof = true;
      else if (active === run) active.next = result.value;
      else result.value.close();
    }).finally(() => { active.pending = undefined; });
  }

  /** @param {number} position @param {number} id */
  async function prime(position, id) {
    clearRun();
    if (!picture) return;
    const first = await picture.frameAt(position);
    if (!first) throw new Error('Video has no frame at the requested time');
    /** @type {FrameRun} */
    let active;
    try {
      if (command !== id || signal.aborted) return;
      picture.draw(first);
      active = {
        iterator: picture.samples(first.timestamp + first.duration / 2),
        until: first.timestamp + first.duration,
        eof: false
      };
      run = active;
    } finally {
      first.close();
    }
    prefetch(active);
    await active.pending;
    // Some containers return the frame that overlaps the requested start.
    while (run === active && active.next && active.next.timestamp < active.until - 0.00001) {
      active.next.close();
      active.next = undefined;
      prefetch(active);
      await active.pending;
    }
  }
  return {
    player,
    get playing() { return wantsPlay && player.state !== 'ended'; },
    get buffering() { return seeking || recovering || player.state === 'buffering'; },
    async play() {
      if (wantsPlay && player.state !== 'ended') return;
      const id = ++command;
      const needsPrime = seeking || !run || player.state === 'ended';
      wantsPlay = true;
      if (player.state === 'ended') {
        player.seek(0);
      }
      try {
        if (picture && needsPrime) {
          seeking = true;
          await prime(player.currentTime, id);
        }
        if (id === command && wantsPlay) await player.play();
      } catch (error) {
        if (id !== command) return;
        wantsPlay = false;
        throw error;
      } finally {
        if (id === command) seeking = false;
      }
    },
    pause() {
      wantsPlay = false;
      const pendingSeek = seeking;
      seeking = false;
      recovering = false;
      ++command;
      if (pendingSeek) clearRun();
      player.pause();
    },
    /** @param {number} seconds */
    async seek(seconds) {
      const id = ++command;
      seeking = true;
      recovering = false;
      try {
        player.pause();
        player.seek(seconds);
        if (picture && player.state !== 'ended') await prime(player.currentTime, id);
        if (id === command && wantsPlay && player.state !== 'ended') await player.play();
      } catch (error) {
        if (id !== command) return;
        wantsPlay = false;
        throw error;
      } finally {
        if (id === command) seeking = false;
      }
    },
    async present() {
      const active = run;
      if (!picture || !active || signal.aborted || !wantsPlay || seeking || recovering || player.state !== 'playing') return;
      const id = command;
      const position = player.currentTime;
      if (active.next && active.next.timestamp <= position) {
        const sample = active.next;
        active.next = undefined;
        try {
          picture.draw(sample);
          active.until = sample.timestamp + sample.duration;
        } finally {
          sample.close();
        }
      }
      prefetch(active);
      const wait = active.pending;
      if (!wait) return;
      const starved = !active.next && position >= active.until;
      if (starved) {
        recovering = true;
        player.pause();
      }
      try {
        await wait;
        if (starved && id === command && wantsPlay) await player.play();
      } catch (error) {
        if (id !== command) return;
        wantsPlay = false;
        player.pause();
        throw error;
      } finally {
        if (starved && id === command) recovering = false;
      }
    },
    async dispose() {
      ++command;
      wantsPlay = false;
      clearRun();
      picture?.dispose();
      await player.dispose();
    }
  };
}
