/**
 * First-class view of the Logic layer Spine.
 *
 * The Spine lists every music event of the document. Each `event` carries
 * `timing`, the offset in Virtual Time Units (VTU) from the preceding event,
 * and `hpos`, the offset in Virtual PiXels (VPX). The value `"null"` (the DTD
 * default) means "no value". `timing="0"` makes an event simultaneous with the
 * preceding one. Spine values are score-relative and never media seconds; the
 * Audio layer maps events to seconds per track.
 * @module ieee1599/model/spine
 */

/**
 * One Spine event with decoded relative and cumulative positions.
 * @typedef {object} SpineEvent
 * @property {string} id Event ID referenced by every other layer.
 * @property {number} index Zero-based position in the Spine.
 * @property {import('./node.js').IEEE1599Element} element Source `event` element.
 * @property {number | null} timing Offset in VTU from the preceding event, or
 *   `null` when the value is `"null"` or not an integer.
 * @property {number | null} hpos Offset in VPX from the preceding event, or `null`.
 * @property {string | null} timingSource `timing` exactly as written, `null` when absent (defaulted).
 * @property {string | null} hposSource `hpos` exactly as written, `null` when absent (defaulted).
 * @property {number | null} vtu Cumulative VTU from the start of the Spine (the
 *   first event's timing is its offset from 0). `null` from the first event
 *   whose timing is unknown onwards, since later positions cannot be derived.
 * @property {number | null} vpx Cumulative VPX, computed like `vtu`.
 * @property {number} group Index of the simultaneity group (see {@link Spine#groups}).
 */

const INTEGER = /^\s*[-+]?\d+\s*$/;

/**
 * @param {import('./node.js').IEEE1599Element} element
 * @param {string} name
 * @returns {{value: number | null, source: string | null}}
 */
function relative(element, name) {
  const source = element.rawAttributes.find(([attribute]) => attribute === name)?.[1] ?? null;
  return { value: source !== null && INTEGER.test(source) ? Number(source) : null, source };
}

/**
 * Ordered, indexed Spine of a document.
 *
 * @example
 * const spine = doc.spine;
 * spine.get('e3')?.vtu;        // cumulative virtual time of event e3
 * spine.groups[0].map((e) => e.id); // events sounding together at the start
 */
export class Spine {
  /** @type {Map<string, SpineEvent>} */ #byId = new Map();

  /**
   * @param {import('./node.js').IEEE1599Element | null} element `spine` element, if present.
   */
  constructor(element) {
    /** The `spine` element, or `null` when absent. @type {import('./node.js').IEEE1599Element | null} */
    this.element = element;
    /** Events in Spine order. @type {readonly SpineEvent[]} */
    this.events = [];
    /**
     * Simultaneity groups in order: an event with `timing="0"` joins the
     * preceding event's group; any other value starts a new group.
     * @type {readonly (readonly SpineEvent[])[]}
     */
    this.groups = [];
    /** @type {SpineEvent[]} */
    const events = [];
    /** @type {SpineEvent[][]} */
    const groups = [];
    /** @type {number | null} */
    let vtu = 0;
    /** @type {number | null} */
    let vpx = 0;
    for (const [index, eventElement] of (element?.elements('event') ?? []).entries()) {
      const timing = relative(eventElement, 'timing');
      const hpos = relative(eventElement, 'hpos');
      vtu = vtu === null || timing.value === null ? null : vtu + timing.value;
      vpx = vpx === null || hpos.value === null ? null : vpx + hpos.value;
      if (!(timing.value === 0 && groups.length)) groups.push([]);
      /** @type {SpineEvent} */
      const event = {
        id: eventElement.attribute('id') ?? '',
        index,
        element: eventElement,
        timing: timing.value,
        hpos: hpos.value,
        timingSource: timing.source,
        hposSource: hpos.source,
        vtu,
        vpx,
        group: groups.length - 1
      };
      groups[groups.length - 1].push(event);
      events.push(event);
      if (!this.#byId.has(event.id)) this.#byId.set(event.id, event);
    }
    this.events = Object.freeze(events);
    this.groups = Object.freeze(groups.map((group) => Object.freeze(group)));
  }

  /** Number of events. @returns {number} */
  get length() {
    return this.events.length;
  }

  /**
   * Event by ID.
   * @param {string} id Event ID.
   * @returns {SpineEvent | undefined}
   */
  get(id) {
    return this.#byId.get(id);
  }

  /**
   * Whether the Spine contains an event ID.
   * @param {string} id Event ID.
   * @returns {boolean}
   */
  has(id) {
    return this.#byId.has(id);
  }

  /**
   * Spine position of an event, `-1` when absent.
   * @param {string} id Event ID.
   * @returns {number}
   */
  indexOf(id) {
    return this.#byId.get(id)?.index ?? -1;
  }

  /**
   * Events sounding together with the given event (its simultaneity group).
   * @param {string} id Event ID.
   * @returns {readonly SpineEvent[]}
   */
  simultaneous(id) {
    const event = this.#byId.get(id);
    return event ? this.groups[event.group] : [];
  }

  /** @returns {IterableIterator<SpineEvent>} */
  [Symbol.iterator]() {
    return this.events[Symbol.iterator]();
  }
}
