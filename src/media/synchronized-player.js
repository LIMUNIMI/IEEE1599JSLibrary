/**
 * Audio-clock-led synchronization for a buffered audio group and video views.
 *
 * Audio is the required transport clock. Video views follow its position and
 * do not extend the audio group's duration. This first contract does not
 * provide a video-only clock or automatically poll video frames.
 * @module ieee1599/media/synchronized-player
 */

/**
 * A video view that follows the shared audio transport time.
 * @typedef {object} SynchronizedVideo
 * @property {(seconds: number) => Promise<void>} seek Prime the view at a media-local time.
 * @property {(seconds: number) => Promise<void>} present Present the frame for a media-local time.
 * @property {(seconds: number) => boolean} [isBuffering] Whether this view needs data to reach a time.
 * @property {() => Promise<void>} [whenReady] Resolve when a buffering view can continue.
 * @property {() => void | Promise<void>} [dispose] Release view resources.
 */

/**
 * Options for {@link createSynchronizedMediaPlayer}.
 * @typedef {object} SynchronizedMediaPlayerOptions
 * @property {import('./buffered-audio.js').BufferedAudioPlayer} audio Required audio group and clock.
 * @property {readonly SynchronizedVideo[]} [videos] Video views aligned to the same zero and rate.
 */

/** @typedef {{
 *   readonly currentTime: number,
 *   readonly duration: number,
 *   readonly state: import('./buffered-audio.js').PlayerState,
 *   readonly buffering: boolean,
 *   play: () => Promise<void>,
 *   pause: () => void,
 *   seek: (seconds: number) => Promise<void>,
 *   present: () => Promise<void>,
 *   dispose: () => Promise<void>,
 *   addEventListener: EventTarget['addEventListener'],
 *   removeEventListener: EventTarget['removeEventListener']
 * }} SynchronizedMediaPlayer
 */

/**
 * Coordinate aligned video views with the audio group's transport clock.
 *
 * Call `present()` from the application's rendering loop while playing. Video
 * views are primed before audio starts, and seeks wait for all views before
 * playback resumes. The player owns the supplied video views and disposes
 * them together with the audio player. It does not own an injected AudioContext.
 *
 * @param {SynchronizedMediaPlayerOptions} options
 * @returns {SynchronizedMediaPlayer}
 * @throws {TypeError} If the audio group or a video view does not implement its contract.
 */
export function createSynchronizedMediaPlayer({ audio, videos = [] }) {
  if (!audio || typeof audio.play !== 'function' || typeof audio.pause !== 'function'
    || typeof audio.seek !== 'function' || typeof audio.dispose !== 'function'
    || typeof audio.addEventListener !== 'function' || typeof audio.removeEventListener !== 'function'
    || !('currentTime' in audio) || !('duration' in audio) || !('state' in audio)) {
    throw new TypeError('A compatible buffered audio player is required');
  }
  if (!Array.isArray(videos) || videos.some((video) => !video
    || typeof video.seek !== 'function' || typeof video.present !== 'function'
    || (video.dispose !== undefined && typeof video.dispose !== 'function')
    || (video.isBuffering !== undefined && (typeof video.isBuffering !== 'function'
      || typeof video.whenReady !== 'function'))
    || (video.whenReady !== undefined && typeof video.whenReady !== 'function'))) {
    throw new TypeError('Every video view must implement seek() and present()');
  }

  let generation = 0;
  let disposed = false;
  let wantsPlay = false;
  let buffering = false;
  const events = new EventTarget();
  let publishedState = audio.state;
  /** @type {SynchronizedMediaPlayer} */
  let controller;

  function assertUsable() {
    if (disposed) throw new Error('Synchronized media player is disposed');
  }

  /** @param {string} type @param {unknown} detail */
  function dispatch(type, detail) {
    events.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function publishState() {
    const state = controller.state;
    if (state === publishedState) return;
    publishedState = state;
    dispatch('statechange', { state });
  }

  /** @param {Event} event */
  function relay(event) {
    if (disposed) return;
    if (event.type === 'statechange') publishState();
    else if (event.type === 'positionchange') dispatch(event.type, { currentTime: audio.currentTime });
    else dispatch(event.type, event instanceof CustomEvent ? event.detail : undefined);
  }

  const eventTypes = ['statechange', 'positionchange', 'error'];
  for (const type of eventTypes) audio.addEventListener(type, relay);

  /** @param {number} seconds */
  async function seekViews(seconds) {
    await Promise.all(videos.map((video) => video.seek(seconds)));
  }

  controller = {
    get currentTime() { return audio.currentTime; },
    get duration() { return audio.duration; },
    get state() { return disposed ? 'disposed' : buffering ? 'buffering' : audio.state; },
    get buffering() { return buffering; },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),

    async play() {
      assertUsable();
      if (wantsPlay && audio.state === 'playing') return;
      const command = ++generation;
      buffering = false;
      publishState();
      wantsPlay = true;
      if (audio.state === 'ended') audio.seek(0);
      try {
        await seekViews(audio.currentTime);
        if (command === generation && wantsPlay && !disposed) await audio.play();
      } catch (error) {
        if (command === generation) wantsPlay = false;
        throw error;
      }
    },

    pause() {
      assertUsable();
      ++generation;
      wantsPlay = false;
      buffering = false;
      audio.pause();
      publishState();
    },

    async seek(seconds) {
      assertUsable();
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seek position');
      const command = ++generation;
      buffering = false;
      publishState();
      const resume = wantsPlay || audio.state === 'playing';
      audio.pause();
      audio.seek(seconds);
      try {
        await seekViews(audio.currentTime);
        if (command === generation && resume && !disposed) {
          wantsPlay = true;
          await audio.play();
        }
      } catch (error) {
        if (command === generation) wantsPlay = false;
        throw error;
      }
    },

    async present() {
      assertUsable();
      if (audio.state !== 'playing') return;
      const position = audio.currentTime;
      const command = generation;
      await Promise.all(videos.map((video) => video.present(position)));
      if (command !== generation || disposed) {
        if (!disposed) await seekViews(audio.currentTime);
        return;
      }
      const stalled = videos.filter((video) => video.isBuffering?.(audio.currentTime));
      if (stalled.length === 0) return;

      buffering = true;
      audio.pause();
      publishState();
      try {
        while (stalled.some((video) => video.isBuffering?.(audio.currentTime))) {
          const waiting = videos.filter((video) => video.isBuffering?.(audio.currentTime));
          await Promise.all(waiting.map((video) => video.whenReady?.()));
          if (command !== generation || disposed) return;
        }
        await Promise.all(videos.map((video) => video.present(audio.currentTime)));
        if (command === generation && wantsPlay && !disposed) await audio.play();
      } catch (error) {
        if (command === generation) wantsPlay = false;
        throw error;
      } finally {
        if (command === generation) {
          buffering = false;
          publishState();
        }
      }
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      wantsPlay = false;
      buffering = false;
      const results = await Promise.allSettled([
        ...videos.map((video) => Promise.resolve().then(() => video.dispose?.())),
        Promise.resolve().then(() => audio.dispose())
      ]);
      for (const type of eventTypes) audio.removeEventListener(type, relay);
      publishState();
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
    }
  };
  return controller;
}
