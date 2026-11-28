/**
 * Bounded, native-rate planar PCM queue shared by the worklet and tests.
 * @module ieee1599/media/pcm-queue
 */

/** Fixed-capacity PCM queue. Positions and timestamps are integer sample frames. */
export class PCMQueue {
  /** @param {number} capacity Maximum retained sample frames per channel. */
  constructor(capacity) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new RangeError('Invalid PCM capacity');
    this.capacity = capacity;
    /** @type {{start: number, planes: Float32Array[], offset: number}[]} */
    this.blocks = [];
    this.frames = 0;
    this.position = 0;
    this.end = Infinity;
    this.finished = false;
    this.lastEnd = 0;
  }
  /** Drop queued data and seek. @param {number} position @param {number} [end] Declared end. @returns {void} */
  reset(position, end = Infinity) {
    this.blocks = [];
    this.frames = 0;
    this.position = position;
    this.end = end;
    this.finished = false;
    this.lastEnd = position;
  }
  /** Retain one timestamped block. @param {number} start @param {Float32Array[]} planes @returns {number} Retained frames. */
  append(start, planes) {
    const length = planes[0]?.length ?? 0;
    if (!Number.isSafeInteger(start) || !length || planes.some((plane) => plane.length !== length)) {
      throw new Error('Invalid PCM block');
    }
    const offset = Math.max(0, this.position - start);
    if (offset >= length) return 0;
    if (start + offset < this.lastEnd) throw new Error('Overlapping or unordered PCM blocks');
    const frames = length - offset;
    if (this.frames + frames > this.capacity) throw new Error('PCM buffer capacity exceeded');
    this.blocks.push({ start, planes, offset });
    this.frames += frames;
    this.lastEnd = start + length;
    return frames;
  }
  /** Mark the known media end. @param {number} end @returns {void} */
  finish(end) { this.end = end; this.finished = true; }
  /**
   * Fill one render quantum; silence a gap, but freeze on missing data.
   * @param {Float32Array[]} output Planar destination.
   * @returns {{consumed: number, status: 'playing' | 'buffering' | 'ended'}}
   */
  render(output) {
    for (const plane of output) plane.fill(0);
    let consumed = 0;
    for (let frame = 0; frame < (output[0]?.length ?? 0); frame++) {
      if (this.position >= this.end) return { consumed, status: 'ended' };
      const block = this.blocks[0];
      if (!block && !this.finished) return { consumed, status: 'buffering' };
      if (block && this.position >= block.start + block.offset) {
        for (let channel = 0; channel < output.length; channel++) {
          output[channel][frame] = block.planes[channel]?.[block.offset] ?? 0;
        }
        block.offset++;
        consumed++;
        this.frames--;
        if (block.offset === block.planes[0].length) this.blocks.shift();
      }
      this.position++;
    }
    return { consumed, status: this.position >= this.end ? 'ended' : 'playing' };
  }
}
