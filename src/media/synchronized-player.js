/**
 * @typedef {object} AudioTransport
 * @property {number} currentTime
 * @property {number} duration
 * @property {import('./buffered-audio.js').PlayerState} state
 * @property {() => Promise<void>} play
 * @property {() => void} pause
 * @property {(seconds: number) => void | Promise<void>} seek
 * @property {() => Promise<void>} dispose
 * @property {EventTarget['addEventListener']} addEventListener
 * @property {EventTarget['removeEventListener']} removeEventListener
 */

/**
 * Audio-clock-led synchronization for an audio transport and video views.
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
 * @property {AudioTransport} audio Required buffered group or single streaming clock.
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
    throw new TypeError('A compatible audio transport is required');
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
  let viewWork = Promise.resolve();
  /** @type {Promise<void> | undefined} */
  let presenting;
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

  /**
   * Drain all running view callbacks before a newer batch can render over
   * them. A callback already in flight cannot be canceled by this contract.
   * @param {number} command
   * @param {'seek' | 'present'} method
   * @param {number} seconds
   */
  function updateViews(command, method, seconds) {
    const next = viewWork.then(async () => {
      if (disposed || command !== generation) return;
      const results = await Promise.allSettled(videos.map(async (video) => video[method](seconds)));
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected && !disposed && command === generation) throw rejected.reason;
    });
    viewWork = next.then(() => {}, () => {});
    return next;
  }

  /** @param {number} command */
  async function presentViews(command) {
    await updateViews(command, 'present', audio.currentTime);
    if (command !== generation || disposed || audio.state !== 'playing') return;
    /** @param {number} time */
    const stalledAt = (time) => videos.filter((video) => video.isBuffering?.(time));
    if (!stalledAt(audio.currentTime).length) return;

    buffering = true;
    audio.pause();
    publishState();
    try {
      const frozen = audio.currentTime;
      while (command === generation && !disposed) {
        const stalled = stalledAt(frozen);
        await Promise.all(stalled.map((video) => video.whenReady?.()));
        if (command !== generation || disposed) return;
        if (stalled.some((video) => video.isBuffering?.(frozen))) {
          throw new Error('A video view reported readiness while still buffering');
        }
        if (stalledAt(frozen).length) continue;
        await updateViews(command, 'present', frozen);
        if (command !== generation || disposed) return;
        if (stalledAt(frozen).length) continue;
        if (wantsPlay) await audio.play();
        return;
      }
    } catch (error) {
      if (command === generation && !disposed) {
        wantsPlay = false;
        throw error;
      }
    } finally {
      if (command === generation) {
        buffering = false;
        publishState();
      }
    }
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
      presenting = undefined;
      buffering = false;
      publishState();
      wantsPlay = true;
      try {
        if (audio.state === 'ended') await audio.seek(0);
        if (command !== generation || disposed) return;
        await updateViews(command, 'seek', audio.currentTime);
        if (command === generation && wantsPlay && !disposed) await audio.play();
      } catch (error) {
        if (command === generation) wantsPlay = false;
        throw error;
      }
    },

    pause() {
      assertUsable();
      ++generation;
      presenting = undefined;
      wantsPlay = false;
      buffering = false;
      audio.pause();
      publishState();
    },

    async seek(seconds) {
      assertUsable();
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seek position');
      const command = ++generation;
      presenting = undefined;
      buffering = false;
      publishState();
      const resume = wantsPlay || audio.state === 'playing';
      audio.pause();
      try {
        await audio.seek(seconds);
        if (command !== generation || disposed) return;
        await updateViews(command, 'seek', audio.currentTime);
        if (command !== generation || disposed) return;
        if (audio.state === 'ended' || audio.currentTime >= audio.duration) {
          wantsPlay = false;
        } else if (resume) {
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
      if (presenting) return;
      const request = presentViews(generation);
      presenting = request;
      try {
        await request;
      } finally {
        if (presenting === request) presenting = undefined;
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
