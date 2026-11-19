import { createLogger } from '../diagnostics/logger.js';

/**
 * @typedef {'paused' | 'playing' | 'buffering' | 'ended' | 'error' | 'disposed'} PlayerState
 * @typedef {{id: string, buffer: AudioBuffer, offset: number, gain: number, pan: number, required: boolean}} AudioInstance
 * @typedef {{id: string, source: AudioBufferSourceNode, gain: GainNode, panner?: StereoPannerNode}} ActiveSource
 */

/** @param {AudioBuffer} buffer @param {number} pan */
function validatePan(buffer, pan) {
  if (!Number.isFinite(pan) || pan < -1 || pan > 1) throw new RangeError('Pan must be between -1 and 1');
  if (pan !== 0 && buffer.numberOfChannels > 2) throw new RangeError('Stereo panning requires mono or stereo audio');
}

export class BufferedAudioPlayer extends EventTarget {
  /** @param {{context?: AudioContext, diagnostics?: {capacity?: number, verbose?: boolean, console?: boolean}}} [options] */
  constructor(options = {}) {
    super();
    this.context = options.context ?? new AudioContext();
    this.ownsContext = !options.context;
    this.diagnostics = createLogger(options.diagnostics);
    /** @type {PlayerState} */
    this._state = 'paused';
    /** @type {AudioInstance[]} */
    this.instances = [];
    /** @type {ActiveSource[]} */
    this.active = [];
    this.position = 0;
    this.anchor = 0;
    this.rate = 1;
    this.generation = 0;
    this.recovering = false;
    this.contextListener = () => this.onContextChange();
    this.context.addEventListener('statechange', this.contextListener);
  }

  get state() { return this._state; }
  get currentTime() {
    return this._state === 'playing'
      ? Math.min(this.duration, this.position + (this.context.currentTime - this.anchor) * this.rate)
      : this.position;
  }
  get duration() {
    return Math.max(0, ...this.instances.filter((instance) => instance.required)
      .map((instance) => instance.offset + instance.buffer.duration));
  }

  /** @param {PlayerState} state */
  changeState(state) {
    if (this._state !== state) {
      this._state = state;
      this.diagnostics.log('debug', 'audio', `Player state: ${state}`);
      this.dispatchEvent(new CustomEvent('statechange', { detail: { state } }));
    }
  }
  positionChanged() {
    this.dispatchEvent(new CustomEvent('positionchange', { detail: { currentTime: this.currentTime } }));
  }
  assertUsable() {
    if (this._state === 'disposed') throw new Error('Player is disposed');
  }
  /** @param {unknown} error */
  reportError(error) {
    this.dispatchEvent(new CustomEvent('error', { detail: { error } }));
  }

  /** @param {string} url @param {{signal?: AbortSignal}} [options] */
  async loadAudio(url, options = {}) {
    this.assertUsable();
    try {
      const response = await fetch(url, { signal: options.signal });
      if (!response.ok) throw new Error(`Audio fetch failed: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(bytes);
      options.signal?.throwIfAborted();
      this.assertUsable();
      return buffer;
    } catch (error) {
      this.diagnostics.log('error', 'audio', 'Audio loading or decoding failed');
      this.reportError(error);
      throw error;
    }
  }

  /**
   * @param {AudioBuffer} buffer
   * @param {{id: string, offset?: number, gain?: number, pan?: number, required?: boolean}} options
   */
  addAudio(buffer, options) {
    this.assertUsable();
    if (this._state !== 'paused') throw new Error('Add audio while paused');
    const { id, offset = 0, gain = 1, pan = 0, required = true } = options;
    if (!id || this.instances.some((instance) => instance.id === id)) throw new Error('Invalid or duplicate instance id');
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid audio buffer');
    if (!Number.isFinite(offset) || offset < 0) throw new Error('Invalid audio offset');
    if (!Number.isFinite(gain) || gain < 0) throw new Error('Invalid audio gain');
    validatePan(buffer, pan);
    this.instances.push({ id, buffer, offset, gain, pan, required });
  }

  /** @param {string} id @param {number} gain */
  setGain(id, gain) {
    this.assertUsable();
    if (!Number.isFinite(gain) || gain < 0) throw new Error('Invalid audio gain');
    const instance = this.instances.find((item) => item.id === id);
    if (!instance) throw new Error(`Unknown audio instance: ${id}`);
    instance.gain = gain;
    for (const active of this.active) {
      if (active.id === id) active.gain.gain.value = gain;
    }
  }

  /** @param {string} id @param {number} pan */
  setPan(id, pan) {
    this.assertUsable();
    const instance = this.instances.find((item) => item.id === id);
    if (!instance) throw new Error(`Unknown audio instance: ${id}`);
    validatePan(instance.buffer, pan);
    instance.pan = pan;
    for (const active of this.active) {
      if (active.id === id && active.panner) active.panner.pan.value = pan;
    }
  }

  stopSources() {
    this.generation++;
    for (const { source, gain, panner } of this.active) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    }
    this.active = [];
  }

  startSources() {
    if (this.position >= this.duration) {
      this.position = this.duration;
      this.changeState('ended');
      this.positionChanged();
      return;
    }
    const now = this.context.currentTime;
    this.anchor = now;
    const generation = ++this.generation;
    let remaining = this.instances.filter((instance) => instance.required &&
      instance.offset + instance.buffer.duration > this.position).length;
    for (const instance of this.instances) {
      if (instance.offset + instance.buffer.duration <= this.position) continue;
      /** @type {AudioBufferSourceNode | undefined} */
      let source;
      /** @type {GainNode | undefined} */
      let gain;
      /** @type {StereoPannerNode | undefined} */
      let panner;
      try {
        source = this.context.createBufferSource();
        gain = this.context.createGain();
        source.buffer = instance.buffer;
        source.playbackRate.value = this.rate;
        gain.gain.value = instance.gain;
        source.connect(gain);
        if (instance.buffer.numberOfChannels <= 2) {
          panner = this.context.createStereoPanner();
          panner.pan.value = instance.pan;
          gain.connect(panner);
          panner.connect(this.context.destination);
        } else {
          gain.connect(this.context.destination);
        }
        source.onended = () => {
          if (generation !== this.generation) return;
          if (instance.required && --remaining === 0) {
            this.position = this.duration;
            this.stopSources();
            this.changeState('ended');
            this.positionChanged();
          }
        };
        source.start(now + Math.max(0, instance.offset - this.position) / this.rate,
          Math.max(0, this.position - instance.offset));
        this.active.push({ id: instance.id, source, gain, panner });
      } catch (error) {
        source?.disconnect();
        gain?.disconnect();
        panner?.disconnect();
        this.stopSources();
        this.changeState('error');
        this.diagnostics.log('error', 'audio', 'Could not schedule audio group');
        this.reportError(error);
        throw error;
      }
    }
    this.changeState('playing');
    this.positionChanged();
  }

  async play() {
    this.assertUsable();
    if (this._state === 'playing') return;
    if (!this.instances.some((instance) => instance.required)) throw new Error('At least one required audio instance is needed');
    if (this.position >= this.duration) this.position = 0;
    const generation = ++this.generation;
    this.recovering = false;
    this.changeState('buffering');
    try {
      if (this.context.state !== 'running') await this.context.resume();
      if (generation !== this.generation) return;
      if (this.context.state !== 'running') throw new Error('AudioContext did not start');
      this.startSources();
    } catch (error) {
      if (generation === this.generation) {
        this.changeState('error');
        this.diagnostics.log('error', 'audio', 'AudioContext could not start');
        this.reportError(error);
      }
      throw error;
    }
  }

  pause() {
    this.assertUsable();
    if (this._state === 'playing') this.position = this.currentTime;
    this.recovering = false;
    this.stopSources();
    this.changeState('paused');
    this.positionChanged();
  }

  /** @param {number} seconds */
  seek(seconds) {
    this.assertUsable();
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seek position');
    const wasPlaying = this._state === 'playing';
    const wasRecovering = this._state === 'buffering' && this.recovering;
    this.stopSources();
    this.position = Math.min(seconds, this.duration);
    if (this.position === this.duration && this.duration > 0) {
      this.recovering = false;
      this.changeState('ended');
    } else if (wasPlaying) {
      this.startSources();
      return;
    } else if (!wasRecovering) {
      this.changeState('paused');
    }
    this.positionChanged();
  }

  /** @param {number} rate */
  setRate(rate) {
    this.assertUsable();
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid playback rate');
    const playing = this._state === 'playing';
    if (playing) {
      this.position = this.currentTime;
      this.stopSources();
    }
    this.rate = rate;
    if (playing) this.startSources();
    else this.positionChanged();
  }

  onContextChange() {
    if (this._state !== 'disposed' && this.context.state === 'closed') {
      if (this._state === 'playing') this.position = this.currentTime;
      this.stopSources();
      this.recovering = false;
      this.changeState('error');
      this.diagnostics.log('error', 'audio', 'AudioContext was closed');
      this.reportError(new Error('AudioContext was closed'));
      return;
    }
    if (this._state === 'playing' && this.context.state !== 'running') {
      this.position = this.currentTime;
      this.stopSources();
      this.recovering = true;
      this.changeState('buffering');
      this.diagnostics.log('warn', 'audio', 'AudioContext interrupted; group paused');
      this.positionChanged();
    } else if (this._state === 'buffering' && this.recovering && this.context.state === 'running') {
      this.recovering = false;
      this.startSources();
    }
  }

  async dispose() {
    if (this._state === 'disposed') return;
    this.recovering = false;
    this.stopSources();
    this.context.removeEventListener('statechange', this.contextListener);
    this.changeState('disposed');
    if (this.ownsContext) await this.context.close();
  }
}

/** @param {{context?: AudioContext, diagnostics?: {capacity?: number, verbose?: boolean, console?: boolean}}} [options] */
export function createBufferedAudioPlayer(options = {}) {
  return new BufferedAudioPlayer(options);
}
