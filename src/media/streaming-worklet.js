/// <reference path="./worklet-globals.d.ts" />
/**
 * Private native-rate AudioWorklet processor; loaded through audioWorklet.
 * @module ieee1599/media/streaming-worklet
 */
import { PCMQueue } from './pcm-queue.js';

/* global AudioWorkletProcessor, registerProcessor, currentTime, sampleRate */

class StreamingProcessor extends AudioWorkletProcessor {
  /** @param {{processorOptions: {capacity: number}}} options */
  constructor(options) {
    super();
    this.queue = new PCMQueue(options.processorOptions.capacity);
    this.generation = 0;
    this.running = false;
    this.disposed = false;
    this.consumed = 0;
    this.ticks = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'reset') {
        this.generation = data.generation;
        this.queue.reset(data.position);
        this.running = false;
        this.consumed = 0;
        this.ticks = 0;
      } else if (data.generation === this.generation) {
        try {
          if (data.type === 'data') this.queue.append(data.start, data.planes);
          if (data.type === 'end') this.queue.finish(data.end);
          if (data.type === 'play') this.running = true;
          if (data.type === 'pause') this.running = false;
          if (data.type === 'dispose') {
            this.running = false;
            this.disposed = true;
            this.queue.reset(0);
          }
        } catch (error) {
          this.running = false;
          this.port.postMessage({ type: 'error', generation: this.generation, message: String(error) });
        }
      }
    };
  }
  /** @param {Float32Array[][]} _inputs @param {Float32Array[][]} outputs @returns {boolean} */
  process(_inputs, outputs) {
    if (this.disposed) return false;
    if (!this.running) return true;
    const result = this.queue.render(outputs[0]);
    this.consumed += result.consumed;
    this.ticks += outputs[0][0]?.length ?? 0;
    if (this.ticks >= 2048 || result.status !== 'playing') {
      this.port.postMessage({
        type: 'progress', generation: this.generation, consumed: this.consumed,
        position: this.queue.position / sampleRate,
        contextTime: currentTime + (outputs[0][0]?.length ?? 0) / sampleRate,
        status: result.status
      });
      this.consumed = 0;
      this.ticks = 0;
    }
    if (result.status !== 'playing') this.running = false;
    return true;
  }
}
registerProcessor('ieee1599-streaming', StreamingProcessor);
