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
 * @property {(eventRef: string, occurrence?: number) => TimelineMapping & {occurrence: number}} resolve
 *   Media time for a Spine event. Unmapped events resolve to the nearest
 *   earlier mapped event in Spine order, otherwise the first later one. When a
 *   repeat maps the event more than once, `occurrence` (default `0`, clamped
 *   to the last one) selects the performance of that repetition. Throws
 *   `Unknown spine event` or `Performance has no mapped score events`.
 * @property {(eventRef: string, time: number) => number} occurrenceAt Index of
 *   the latest repetition of `eventRef` that starts at or before `time`
 *   (`0` when none has started or the event is unmapped). Pass it to another
 *   timeline's `resolve()` to keep the same repeat when switching performance.
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
 * A Spine event may be mapped more than once, as when a performance plays a
 * repeated section; identical mappings (same event and time) are kept once.
 *
 * @param {readonly string[]} spine Spine event IDs in Spine order.
 * @param {readonly TimelineMapping[]} mappings Track events of one performance.
 * @returns {Timeline}
 * @throws {Error} `Invalid or duplicate spine event`, `Unknown spine event`
 *   or `Invalid media time for <id>`.
 *
 * @example
 * const timeline = createTimeline(['e1', 'e2'], [{ eventRef: 'e1', time: 0 }, { eventRef: 'e2', time: 0.5 }]);
 * timeline.eventsAt(0.7);      // ['e2']
 * timeline.resolve('e2').time; // 0.5
 *
 * @example <caption>Keep the same repeat when switching performance</caption>
 * const ref = from.eventsAt(seconds).at(-1);
 * to.resolve(ref, from.occurrenceAt(ref, seconds)).time;
 */
export function createTimeline(spine, mappings) {
  const positions = new Map();
  for (const [index, id] of spine.entries()) {
    if (!id || positions.has(id)) throw new Error(`Invalid or duplicate spine event: ${id}`);
    positions.set(id, index);
  }

  /** @type {Map<string, number[]>} Ascending times of each mapped event. */
  const times = new Map();
  /** @type {TimelineMapping[]} */
  const unique = [];
  for (const { eventRef, time } of mappings) {
    if (!positions.has(eventRef)) throw new Error(`Unknown spine event: ${eventRef}`);
    if (!Number.isFinite(time) || time < 0) throw new Error(`Invalid media time for ${eventRef}`);
    const list = times.get(eventRef) ?? [];
    if (list.includes(time)) continue;
    list.push(time);
    times.set(eventRef, list);
    unique.push({ eventRef, time });
  }
  for (const list of times.values()) list.sort((a, b) => a - b);
  const chronological = unique.map((mapping, order) => ({ ...mapping, order }))
    .sort((a, b) => a.time - b.time || a.order - b.order);

  return {
    /**
     * Resolve a switch by score order, preferring the nearest earlier mapping.
     * @param {string} eventRef
     * @param {number} [occurrence] Repetition index; clamped to those mapped.
     * @returns {{eventRef: string, time: number, occurrence: number}}
     */
    resolve(eventRef, occurrence = 0) {
      const position = positions.get(eventRef);
      if (position === undefined) throw new Error(`Unknown spine event: ${eventRef}`);
      /** @param {number} i */
      const at = (i) => {
        const list = times.get(spine[i]);
        if (!list) return null;
        const index = Math.min(Math.max(0, Math.trunc(occurrence) || 0), list.length - 1);
        return { eventRef: spine[i], time: list[index], occurrence: index };
      };
      for (let i = position; i >= 0; i--) {
        const found = at(i);
        if (found) return found;
      }
      for (let i = position + 1; i < spine.length; i++) {
        const found = at(i);
        if (found) return found;
      }
      throw new Error('Performance has no mapped score events');
    },
    /**
     * Index of the latest repetition of an event starting at or before a time.
     * @param {string} eventRef
     * @param {number} time
     * @returns {number}
     */
    occurrenceAt(eventRef, time) {
      const list = times.get(eventRef) ?? [];
      let index = 0;
      while (index + 1 < list.length && list[index + 1] <= time) index++;
      return index;
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
