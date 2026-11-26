/**
 * Experimental single-track bounded AudioDecoder/AudioWorklet transport.
 * @module ieee1599/media/streaming-audio
 */
import { createLogger } from '../diagnostics/logger.js';

/**
 * Read-only audio packet source. Packet iteration must begin at or before the
 * requested time, in decode order; the player trims preroll in sample frames.
 * Reader memory/network caching is host-owned. Each packet must be a key
 * audio chunk because the first implementation flushes between packets.
 * @typedef {object} StreamingAudioTrack
 * @property {AudioDecoderConfig} decoderConfig Native audio decoder configuration.
 * @property {number} duration Finite media duration in seconds.
 * @property {(seconds: number, signal: AbortSignal) => AsyncIterable<EncodedAudioChunk>} chunks
 *   Fresh, abortable iterator for each play/seek; no full-file array is required.
 */

/**
 * Create a single streaming audio transport, without media elements or a
 * demuxer dependency. Uses transferable planar PCM, not SharedArrayBuffer.
 * Only native-rate playback is supported: an owned context requests the
 * track rate, and mismatched context/decoder rates fail explicitly.
 *
 * PCM retained by the transport is capped by `bufferSeconds`; a packet may
 * not contribute more than half that capacity after trimming. Encoded input is limited by
 * `maxPacketBytes`. No playback-rate changes, streaming groups, resampling or
 * pitch preservation are provided by this experimental contract.
 *
 * @param {object} options
 * @param {StreamingAudioTrack} options.track Read-only source, owned by the host.
 * @param {AudioContext} [options.context] Injected contexts are never closed/suspended.
 * @param {number} [options.bufferSeconds=2] PCM budget, between 0.5 and 30 seconds.
 * @param {number} [options.maxPacketBytes=1048576] Maximum bytes in one encoded packet.
 * @param {import('./buffered-audio.js').BufferedAudioDiagnosticsOptions} [options.diagnostics]
 * @returns {Promise<StreamingAudioPlayer>}
 * @throws {Error} Unsupported native capabilities/configuration or invalid limits.
 */
export async function createStreamingAudioPlayer({
  track, context, bufferSeconds = 2, maxPacketBytes = 1048576, diagnostics
}) {
  if (!track || !Number.isFinite(track.duration) || track.duration <= 0 || typeof track.chunks !== 'function'
    || !track.decoderConfig || !Number.isInteger(track.decoderConfig.sampleRate) || track.decoderConfig.sampleRate <= 0
    || !Number.isInteger(track.decoderConfig.numberOfChannels) || track.decoderConfig.numberOfChannels < 1
    || track.decoderConfig.numberOfChannels > 2) throw new Error('Invalid streaming audio track (mono/stereo required)');
  if (!Number.isFinite(bufferSeconds) || bufferSeconds < 0.5 || bufferSeconds > 30
    || !Number.isSafeInteger(maxPacketBytes) || maxPacketBytes <= 0) throw new RangeError('Invalid streaming buffer limits');
  if (typeof globalThis.AudioDecoder !== 'function' || typeof AudioWorkletNode !== 'function') {
    throw new Error('Streaming requires native AudioDecoder and AudioWorklet');
  }
  const support = await globalThis.AudioDecoder.isConfigSupported(track.decoderConfig);
  if (!support.supported) throw new Error('Unsupported native streaming audio codec');
  const audioContext = context ?? new AudioContext({ sampleRate: track.decoderConfig.sampleRate });
  try {
    if (audioContext.sampleRate !== track.decoderConfig.sampleRate) {
      throw new Error('Streaming requires matching context and track sample rates; resampling is not implemented');
    }
    await audioContext.audioWorklet.addModule(new URL('./streaming-worklet.js', import.meta.url));
    const capacity = Math.floor(bufferSeconds * audioContext.sampleRate);
    const node = new AudioWorkletNode(audioContext, 'ieee1599-streaming', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [track.decoderConfig.numberOfChannels],
      processorOptions: { capacity }
    });
    return new StreamingAudioPlayer(track, audioContext, !context, node, capacity, maxPacketBytes, diagnostics);
  } catch (error) {
    if (!context) await audioContext.close();
    throw error;
  }
}

/**
 * Single-track streaming transport. Events mirror the buffered player;
 * `bufferedFrames` measures outstanding PCM (not demuxer/network caches).
 * Create with {@link createStreamingAudioPlayer}.
 */
export class StreamingAudioPlayer extends EventTarget {
  /**
   * @internal
   * @param {StreamingAudioTrack} track
   * @param {AudioContext} context
   * @param {boolean} ownsContext
   * @param {AudioWorkletNode} node
   * @param {number} capacity
   * @param {number} maxPacketBytes
   * @param {import('./buffered-audio.js').BufferedAudioDiagnosticsOptions} [diagnostics]
   */
  constructor(track, context, ownsContext, node, capacity, maxPacketBytes, diagnostics) {
    super();
    this.track = track;
    this.context = context;
    this.ownsContext = ownsContext;
    this.node = node;
    this.capacity = capacity;
    this.maxPacketBytes = maxPacketBytes;
    this.diagnostics = createLogger(diagnostics);
    /** @type {import('./buffered-audio.js').PlayerState} */
    this._state = 'paused';
    this.position = 0;
    this.anchor = context.currentTime;
    this.bufferedFrames = 0;
    this.bufferedUntil = 0;
    this.generation = 0;
    this.readyGeneration = -1;
    this.wantsPlay = false;
    this.eof = false;
    /** @type {AbortController | null} */
    this.loading = null;
    /** @type {AudioDecoder | null} */
    this.decoder = null;
    /** @type {(() => void)[]} */
    this.waiters = [];
    /** @type {((reason?: unknown) => void) | null} */
    this.finishStart = null;
    this.node.connect(context.destination);
    this.node.port.onmessage = (event) => this.onMessage(event.data);
    this.processorError = () => this.fail(new Error('Streaming AudioWorklet processor failed'));
    node.addEventListener('processorerror', this.processorError);
    this.contextListener = () => {
      if (context.state === 'closed') this.fail(new Error('AudioContext was closed'));
      else if (this.wantsPlay && context.state !== 'running') {
        this.freeze();
        this.changeState('buffering');
      } else this.maybeStart();
    };
    context.addEventListener('statechange', this.contextListener);
  }
  /** @returns {import('./buffered-audio.js').PlayerState} */
  get state() { return this._state; }
  /** @returns {number} */
  get duration() { return this.track.duration; }
  /** @returns {number} */
  get currentTime() {
    return this.state === 'playing'
      ? Math.min(this.duration, this.bufferedUntil, this.position + Math.max(0, this.context.currentTime - this.anchor))
      : this.position;
  }
  assertUsable() { if (this.state === 'disposed') throw new Error('Player is disposed'); }
  /** @param {string} type @param {unknown} detail */
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  /** @param {import('./buffered-audio.js').PlayerState} state */
  changeState(state) {
    if (this._state === state) return;
    this._state = state;
    this.emit('statechange', { state });
  }
  /** @param {unknown} error */
  fail(error) {
    if (this.state === 'disposed') return;
    this.position = this.currentTime;
    this.wantsPlay = false;
    this.cancel();
    this.changeState('error');
    this.diagnostics.log('error', 'audio', 'Streaming audio failed');
    this.emit('error', { error });
    this.finishStart?.(error);
    this.finishStart = null;
  }
  /** @param {unknown} [reason] */
  settleStart(reason) { this.finishStart?.(reason); this.finishStart = null; }
  cancel() {
    ++this.generation;
    this.loading?.abort();
    this.loading = null;
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    this.wake();
    this.node.port.postMessage({ type: 'reset', generation: this.generation,
      position: Math.round(this.position * this.context.sampleRate), end: this.endFrame() });
    this.bufferedFrames = 0;
    this.bufferedUntil = this.position;
    this.eof = false;
  }
  endFrame() { return Math.round(this.duration * this.context.sampleRate); }
  wake() { for (const resolve of this.waiters.splice(0)) resolve(); }
  freeze() {
    this.position = this.currentTime;
    this.node.port.postMessage({ type: 'pause', generation: this.generation });
    this.emit('positionchange', { currentTime: this.position });
  }
  maybeStart() {
    if (!this.wantsPlay || this.state !== 'buffering' || this.context.state !== 'running') return;
    if (!this.eof && this.bufferedFrames < Math.min(this.capacity / 2, this.context.sampleRate / 4)) return;
    this.anchor = this.context.currentTime;
    this.node.port.postMessage({ type: 'play', generation: this.generation });
    this.changeState('playing');
    this.emit('positionchange', { currentTime: this.position });
    this.settleStart();
  }
  /** @param {{type: string, generation: number, consumed: number, position: number,
   * contextTime: number, status: 'playing' | 'buffering' | 'ended', message?: string}} data */
  onMessage(data) {
    if (data.generation !== this.generation || this.state === 'disposed') return;
    if (data.type === 'reset') {
      this.readyGeneration = data.generation;
      this.wake();
      return;
    }
    if (data.type === 'error') { this.fail(new Error(data.message)); return; }
    this.bufferedFrames = Math.max(0, this.bufferedFrames - data.consumed);
    this.wake();
    if (this.state !== 'playing') return;
    this.position = Math.min(this.duration, data.position);
    this.anchor = data.contextTime;
    if (data.status === 'ended') {
      this.position = this.duration;
      this.wantsPlay = false;
      this.cancel();
      this.changeState('ended');
      this.emit('positionchange', { currentTime: this.position });
    } else if (data.status === 'buffering') {
      this.changeState('buffering');
      this.emit('positionchange', { currentTime: this.position });
      this.maybeStart();
    }
  }
  /** @param {number} generation @param {AbortSignal} signal */
  async pump(generation, signal) {
    while (this.readyGeneration !== generation) {
      await new Promise((resolve) => this.waiters.push(() => resolve(undefined)));
      if (generation !== this.generation) return;
    }
    const origin = this.position;
    const target = Math.round(origin * this.context.sampleRate);
    const end = this.endFrame();
    let produced = false;
    const decoder = new globalThis.AudioDecoder({
      output: (data) => {
        try {
          if (generation !== this.generation) return;
          if (data.sampleRate !== this.context.sampleRate || data.numberOfChannels !== this.track.decoderConfig.numberOfChannels) {
            throw new Error('Decoded audio changed its sample rate or channels');
          }
          const start = Math.round(data.timestamp * this.context.sampleRate / 1e6);
          const first = Math.max(target, start);
          const retained = Math.min(end, start + data.numberOfFrames) - first;
          if (retained <= 0) return;
          if (retained > this.capacity / 2 || this.bufferedFrames + retained > this.capacity) {
            throw new Error('Decoded PCM exceeds the configured buffer budget');
          }
          const planes = Array.from({ length: data.numberOfChannels }, (_, planeIndex) => {
            const plane = new Float32Array(retained);
            data.copyTo(plane, { planeIndex, format: 'f32-planar', frameOffset: first - start, frameCount: retained });
            if (!plane.every(Number.isFinite)) throw new Error('Native audio decoder returned non-finite PCM samples');
            return plane;
          });
          produced = true;
          this.bufferedFrames += retained;
          this.bufferedUntil = Math.max(this.bufferedUntil, (first + retained) / this.context.sampleRate);
          this.node.port.postMessage({ type: 'data', generation, start: first, planes }, planes.map((plane) => plane.buffer));
          this.maybeStart();
        } catch (error) { this.fail(error); }
        finally { data.close(); }
      },
      error: (error) => { if (generation === this.generation) this.fail(error); }
    });
    this.decoder = decoder;
    decoder.configure(this.track.decoderConfig);
    /** @type {AsyncIterator<EncodedAudioChunk> | undefined} */
    let iterator;
    try {
      let packets = 0;
      iterator = this.track.chunks(origin, signal)[Symbol.asyncIterator]();
      while (generation === this.generation) {
        while (this.bufferedFrames > this.capacity / 2) {
          await new Promise((resolve) => this.waiters.push(() => resolve(undefined)));
          if (generation !== this.generation) return;
        }
        const next = await iterator.next();
        if (generation !== this.generation) return;
        if (next.done) break;
        const chunk = next.value;
        if (chunk.type !== 'key') throw new Error('Streaming currently requires key audio packets');
        if (chunk.byteLength > this.maxPacketBytes) throw new Error('Encoded audio packet exceeds the configured byte budget');
        packets++;
        decoder.decode(chunk);
        // Flush each audio packet to bound decoder-owned output independently
        // of the network reader. This first backend accepts key audio packets.
        await decoder.flush();
        if (this.bufferedUntil >= end / this.context.sampleRate) break;
      }
      if (generation !== this.generation) return;
      if (!packets || !produced) throw new Error('Streaming source returned no audio at the requested position');
      decoder.close();
      this.decoder = null;
      this.eof = true;
      this.node.port.postMessage({ type: 'end', generation, end });
      this.maybeStart();
    } catch (error) { if (generation === this.generation) this.fail(error); }
    finally {
      try { await iterator?.return?.(); }
      catch (error) {
        if (generation === this.generation) this.fail(error);
        else this.diagnostics.log('warn', 'audio', 'Cancelled streaming source cleanup failed');
      }
    }
  }
  /** Start or resume after native activation and bounded preroll. @returns {Promise<void>} */
  async play() {
    this.assertUsable();
    if (this.state === 'playing') return;
    if (this.state === 'buffering' && this.wantsPlay) throw new Error('Streaming start is already pending');
    this.wantsPlay = true;
    if (this.position >= this.duration) this.position = 0;
    this.cancel();
    const generation = this.generation;
    this.changeState('buffering');
    try {
      await this.context.resume();
      if (generation !== this.generation) return;
      if (this.context.state !== 'running') throw new Error('AudioContext did not start');
      const started = new Promise((resolve, reject) => {
        this.finishStart = (error) => error ? reject(error) : resolve(undefined);
      });
      this.loading = new AbortController();
      void this.pump(generation, this.loading.signal).catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
      await started;
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      throw error;
    }
  }
  /** Pause without suspending a shared context. @returns {void} */
  pause() {
    this.assertUsable();
    this.position = this.currentTime;
    this.wantsPlay = false;
    this.settleStart();
    this.cancel();
    this.changeState('paused');
    this.emit('positionchange', { currentTime: this.position });
  }
  /** Seek with fresh decoder/preroll; retains play intent. @param {number} seconds @returns {Promise<void>} */
  async seek(seconds) {
    this.assertUsable();
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seek position');
    const resume = this.wantsPlay;
    this.pause();
    this.position = Math.min(seconds, this.duration);
    if (this.position === this.duration) this.changeState('ended');
    this.emit('positionchange', { currentTime: this.position });
    if (resume && this.position < this.duration) await this.play();
  }
  /** Release decoder, message port, graph and an owned context. @returns {Promise<void>} */
  async dispose() {
    if (this.state === 'disposed') return;
    this.pause();
    this.context.removeEventListener('statechange', this.contextListener);
    this.node.port.postMessage({ type: 'dispose', generation: this.generation });
    this.node.port.onmessage = null;
    this.node.removeEventListener('processorerror', this.processorError);
    this.node.port.close();
    this.node.disconnect();
    this.changeState('disposed');
    if (this.ownsContext) await this.context.close();
  }
}
