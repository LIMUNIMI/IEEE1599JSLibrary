/**
 * Score-to-media timeline of one performance. Pure logic; no DOM or media.
 * @module ieee1599/core/timeline
 */

/**
 * A Spine event mapped to a media time in seconds.
 * @typedef {object} TimelineMapping
 * @property {string} eventRef Spine event ID.
 * @property {number} time Media-local time in seconds (finite, `>= 0`).
 */

/**
 * Lookups between score events and one performance's media time.
 * @typedef {object} Timeline
 * @property {(eventRef: string) => TimelineMapping} resolve Media time for a
 *   Spine event. Unmapped events resolve to the nearest earlier mapped event in
 *   Spine order, otherwise the first later one. Throws `Unknown spine event`
 *   or `Performance has no mapped score events`.
 * @property {(time: number) => string[]} eventsAt Every event at the latest
 *   mapped time not after `time` seconds (`[]` before the first mapping),
 *   in mapping order. Throws `Invalid media time` for negative/non-finite input.
 */

/**
 * Index ordered score events and the timestamps in one performance.
 * The score order is authoritative and is not inferred from media time.
 * Different performances need separate timelines; switch between them with
 * `resolve()` on the current score event, never by copying media time.
 *
 * @param {readonly string[]} spine Spine event IDs in Spine order.
 * @param {readonly TimelineMapping[]} mappings Track events of one performance.
 * @returns {Timeline}
 * @throws {Error} `Invalid or duplicate spine event`, `Unknown spine event`,
 *   `Invalid media time for <id>` or `Duplicate track event`.
 *
 * @example
 * const timeline = createTimeline(['e1', 'e2'], [{ eventRef: 'e1', time: 0 }, { eventRef: 'e2', time: 0.5 }]);
 * timeline.eventsAt(0.7);      // ['e2']
 * timeline.resolve('e2').time; // 0.5
 */
export function createTimeline(spine, mappings) {
  const positions = new Map();
  for (const [index, id] of spine.entries()) {
    if (!id || positions.has(id)) throw new Error(`Invalid or duplicate spine event: ${id}`);
    positions.set(id, index);
  }

  /** @type {Map<string, number>} */
  const times = new Map();
  for (const { eventRef, time } of mappings) {
    if (!positions.has(eventRef)) throw new Error(`Unknown spine event: ${eventRef}`);
    if (!Number.isFinite(time) || time < 0) throw new Error(`Invalid media time for ${eventRef}`);
    if (times.has(eventRef)) throw new Error(`Duplicate track event: ${eventRef}`);
    times.set(eventRef, time);
  }
  const chronological = mappings.map((mapping, order) => ({ ...mapping, order }))
    .sort((a, b) => a.time - b.time || a.order - b.order);

  return {
    /**
     * Resolve a switch by score order, preferring the nearest earlier mapping.
     * @param {string} eventRef
     * @returns {{eventRef: string, time: number}}
     */
    resolve(eventRef) {
      const position = positions.get(eventRef);
      if (position === undefined) throw new Error(`Unknown spine event: ${eventRef}`);
      for (let i = position; i >= 0; i--) {
        const time = times.get(spine[i]);
        if (time !== undefined) return { eventRef: spine[i], time };
      }
      for (let i = position + 1; i < spine.length; i++) {
        const time = times.get(spine[i]);
        if (time !== undefined) return { eventRef: spine[i], time };
      }
      throw new Error('Performance has no mapped score events');
    },
    /**
     * Return every event at the latest timestamp not after the given time.
     * @param {number} time
     * @returns {string[]}
     */
    eventsAt(time) {
      if (!Number.isFinite(time) || time < 0) throw new Error('Invalid media time');
      let low = 0;
      let high = chronological.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (chronological[mid].time <= time) low = mid + 1;
        else high = mid;
      }
      if (low === 0) return [];
      const latest = chronological[low - 1].time;
      let start = low - 1;
      while (start > 0 && chronological[start - 1].time === latest) start--;
      return chronological.slice(start, low).map((entry) => entry.eventRef);
    }
  };
}
