/**
 * Opt-in, framework-free IEEE 1599 player custom element.
 * Importing this module alone does not touch the DOM or register an element.
 * @module ieee1599/ui/player-element
 */
import { loadIEEE1599Document } from '../model/document.js';
import { createPlayerProjection } from '../xml/parse.js';
import { createTimeline } from '../core/timeline.js';
import { createBufferedAudioPlayer } from '../media/buffered-audio.js';
import { createScorePager } from './score-pager.js';
import { createTransportControls } from './transport-controls.js';

/**
 * @typedef {HTMLElement & {
 *   src: string, readonly state: import('../media/buffered-audio.js').PlayerState,
 *   readonly currentTime: number, readonly duration: number,
 *   load: (url?: string) => Promise<void>, play: () => Promise<void>,
 *   pause: () => void, seek: (seconds: number) => void, dispose: () => Promise<void>
 * }} IEEE1599PlayerElement
 */

/**
 * Register an embeddable score/audio player. Its `src` is an IEEE 1599 URL;
 * `strict` opts into strict DTD loading. Audio is loaded only on `play()`
 * (normally a button gesture). The component owns its context and releases
 * resources on disconnect; reconnect reloads `src`. It does not import a
 * demuxer, autoplay, render video or synthesize the Performance layer.
 *
 * Events: `load` with `{document, projection}`, transport events
 * `statechange`/`positionchange`/`error` with the usual detail, all bubbling
 * and composed. Errors also appear in a visible alert.
 *
 * @param {{name?: string, registry?: CustomElementRegistry}} [options]
 * @returns {new () => IEEE1599PlayerElement} Registered constructor; call once per registry/name.
 * @throws {Error} When DOM/custom elements are unavailable or the name is already registered.
 */
export function defineIEEE1599Player({ name = 'ieee1599-player', registry = globalThis.customElements } = {}) {
  if (!registry || typeof HTMLElement === 'undefined') throw new Error('Custom elements require a browser DOM');
  if (registry.get(name)) throw new Error(`Custom element already registered: ${name}`);

  class IEEE1599Player extends HTMLElement {
    static observedAttributes = ['src', 'strict'];

    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.root.innerHTML = `<style>
        :host { display: block; color: var(--ieee1599-text-color, inherit);
          background: var(--ieee1599-background, transparent); }
        button, select, input { font: inherit; }
        button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid currentColor; }
        [part=controls] { margin-block: .5rem; }
      </style><h2 part="title"></h2><p part="authors"></p>
      <label>Recording <select aria-label="Recording"></select></label>
      <div part="controls"></div><p part="status" role="status"></p>
      <p part="error" role="alert"></p><div part="score"></div>`;
      /** @type {ReturnType<typeof createBufferedAudioPlayer> | null} */
      this.audio = null;
      /** @type {ReturnType<typeof createScorePager> | null} */
      this.score = null;
      /** @type {ReturnType<typeof createTransportControls> | null} */
      this.controls = null;
      /** @type {ReturnType<typeof createTimeline> | null} */
      this.timeline = null;
      /** @type {import('../xml/parse.js').PlayerDocument | null} */
      this.piece = null;
      /** @type {AbortController | null} */
      this.loading = null;
      /** @type {AbortController | null} */
      this.audioLoading = null;
      /** @type {Promise<void> | null} */
      this.preparing = null;
      this.generation = 0;
      this.playGeneration = 0;
      this.frame = 0;
      this.resumeRef = '';
      this.select = /** @type {HTMLSelectElement} */ (this.root.querySelector('select'));
      this.select.addEventListener('change', () => {
        this.resumeRef = this.timeline?.eventsAt(this.currentTime)[0] ?? '';
        this.releaseAudio().catch((error) => this.report(error));
      });
    }

    get src() { return this.getAttribute('src') ?? ''; }
    /** @param {string} value */
    set src(value) { this.setAttribute('src', value); }
    get state() { return this.audio?.state ?? 'paused'; }
    get currentTime() { return this.audio?.currentTime ?? 0; }
    get duration() { return this.audio?.duration ?? 0; }

    connectedCallback() {
      if (this.src) this.load().catch((error) => this.report(error));
    }
    disconnectedCallback() { this.dispose().catch((error) => this.report(error)); }
    attributeChangedCallback() {
      if (this.isConnected) this.load().catch((error) => this.report(error));
    }
    /** @param {string} part @returns {HTMLElement} */
    findPart(part) {
      return /** @type {HTMLElement} */ (this.root.querySelector(`[part="${part}"]`));
    }
    /** @param {string} type @param {unknown} detail */
    emit(type, detail) {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
    /** @param {unknown} error */
    report(error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      this.findPart('status').textContent = '';
      this.findPart('error').textContent = error instanceof Error ? error.message : String(error);
      this.emit('error', { error });
    }

    /** Open `src` (or a new URL) without starting or preloading audio. @param {string} [url] @returns {Promise<void>} */
    async load(url = this.src) {
      const generation = ++this.generation;
      this.loading?.abort();
      const loading = new AbortController();
      this.loading = loading;
      await this.releaseAudio();
      if (generation !== this.generation) return;
      this.controls?.dispose();
      this.controls = null;
      this.score?.dispose();
      this.score = null;
      this.piece = null;
      this.resumeRef = '';
      this.select.replaceChildren();
      this.findPart('title').textContent = '';
      this.findPart('authors').textContent = '';
      this.findPart('error').textContent = '';
      this.findPart('status').textContent = url ? 'Loading document' : '';
      if (!url) return;
      const doc = await loadIEEE1599Document(new URL(url, this.baseURI).href, {
        strict: this.hasAttribute('strict'), signal: loading.signal
      });
      if (generation !== this.generation) return;
      const piece = createPlayerProjection(doc);
      const pages = piece.graphicInstances[0]?.pages ?? [];
      if (!pages.length) throw new Error('The document has no score pages');
      this.piece = piece;
      this.findPart('title').textContent = piece.metadata.mainTitle ?? piece.metadata.workTitle ?? 'Untitled';
      this.findPart('authors').textContent = piece.metadata.authors.map((author) => author.name).join(', ');
      const tracks = this.recordings();
      for (let i = 0; i < tracks.length; i++) {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `Recording ${i + 1}`;
        this.select.append(option);
      }
      this.select.disabled = tracks.length === 0;
      this.score = createScorePager({
        container: this.findPart('score'), pages,
        onSeek: (ref) => {
          this.resumeRef = ref;
          if (this.timeline) this.seek(this.timeline.resolve(ref).time);
        }
      });
      if (tracks.length) this.controls = createTransportControls({ container: this.findPart('controls'), player: this });
      this.findPart('status').textContent = !tracks.length ? 'Score only: no indexed audio recording'
        : doc.valid ? '' : `Opened with ${doc.issues.length} validation finding(s)`;
      this.emit('load', { document: doc, projection: piece });
    }

    recordings() {
      return this.piece?.audioTracks.filter((track) => track.events.length
        && !/^video/i.test(track.format ?? '') && !/\.(mp4|mov|m4v|avi)(?:[?#]|$)/i.test(track.url)) ?? [];
    }

    async prepareAudio() {
      if (this.audio && !this.preparing) return;
      if (this.preparing) return this.preparing;
      const track = this.recordings()[Number(this.select.value)];
      const piece = this.piece;
      if (!track || !piece) throw new Error('No indexed audio recording is selected');
      const loading = new AbortController();
      this.audioLoading = loading;
      const audio = createBufferedAudioPlayer();
      this.audio = audio;
      // Start activation in the user's gesture, before network/decode awaits.
      const activation = audio.context.resume();
      this.preparing = (async () => {
        try {
          await activation;
          audio.addAudio(await audio.loadAudio(track.url, { signal: loading.signal }), { id: 'recording' });
          loading.signal.throwIfAborted();
          this.timeline = createTimeline(piece.spine.map((event) => event.id), track.events);
          if (this.resumeRef) audio.seek(this.timeline.resolve(this.resumeRef).time);
          for (const type of ['statechange', 'positionchange', 'error']) {
            audio.addEventListener(type, (event) => {
              if (this.audio !== audio) return;
              this.emit(type, /** @type {CustomEvent} */ (event).detail);
              this.refresh();
            });
          }
          this.emit('positionchange', { currentTime: this.currentTime });
          this.refresh();
        } catch (error) {
          await audio.dispose();
          if (this.audio === audio) this.audio = null;
          throw error;
        } finally {
          if (this.audioLoading === loading) this.preparing = null;
        }
      })();
      return this.preparing;
    }

    /** Load on demand and start after a user gesture. @returns {Promise<void>} */
    async play() {
      const command = ++this.playGeneration;
      this.findPart('error').textContent = '';
      await this.prepareAudio();
      if (command === this.playGeneration) await this.audio?.play();
    }
    /** Pause the current recording. @returns {void} */
    pause() { ++this.playGeneration; this.audio?.pause(); }
    /** Seek the loaded recording in seconds. @param {number} seconds @returns {void} */
    seek(seconds) {
      if (!this.audio || this.preparing) throw new Error('Load a recording with play() before seeking');
      this.audio.seek(seconds);
    }

    refresh() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (!this.timeline || !this.score || !this.audio) return;
      this.score.highlight(this.timeline.eventsAt(this.currentTime), { follow: this.state === 'playing' });
      if (this.state === 'playing') this.frame = requestAnimationFrame(() => this.refresh());
    }
    async releaseAudio() {
      ++this.playGeneration;
      this.audioLoading?.abort();
      this.audioLoading = null;
      this.preparing = null;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      const audio = this.audio;
      this.audio = null;
      this.timeline = null;
      await audio?.dispose();
      this.emit('statechange', { state: 'paused' });
      this.emit('positionchange', { currentTime: 0 });
    }
    /** Abort loading and release owned audio and view resources. @returns {Promise<void>} */
    async dispose() {
      ++this.generation;
      this.loading?.abort();
      this.controls?.dispose();
      this.controls = null;
      this.score?.dispose();
      this.score = null;
      this.piece = null;
      await this.releaseAudio();
    }
  }
  registry.define(name, IEEE1599Player);
  return IEEE1599Player;
}
