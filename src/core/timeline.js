/**
 * Index ordered score events and the timestamps in one performance.
 * The score order is authoritative and is not inferred from media time.
 *
 * @param {readonly string[]} spine
 * @param {readonly {eventRef: string, time: number}[]} mappings
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
