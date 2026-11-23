/**
 * First-class view of the Logic layer LOS (Logically Organized Symbols).
 *
 * The LOS describes the score symbolically: a staff list, parts with their
 * voice items, and measures whose voices contain chords, rests and other
 * symbols. Symbols are attached to Spine events through `event_ref`.
 * @module ieee1599/model/los
 */

/**
 * Indexed LOS of a document.
 *
 * @example
 * const symbols = doc.los.forEvent('e12');       // chords/rests/... on e12
 * const staff = doc.los.staffOf(symbols[0]);     // their staff element
 */
export class LOS {
  /** @type {Map<string, import('./node.js').IEEE1599Element[]>} */ #byEvent = new Map();
  /** @type {Map<string, import('./node.js').IEEE1599Element>} */ #staves = new Map();
  /** @type {Map<string, import('./node.js').IEEE1599Element>} */ #voiceItems = new Map();

  /**
   * @param {import('./node.js').IEEE1599Element | null} element `los` element, if present.
   */
  constructor(element) {
    /** The `los` element, or `null`. @type {import('./node.js').IEEE1599Element | null} */
    this.element = element;
    /** `staff` elements of the staff list, in order. @type {readonly import('./node.js').IEEE1599Element[]} */
    this.staves = Object.freeze(element?.element('staff_list')?.elements('staff') ?? []);
    /** `part` elements, in order. @type {readonly import('./node.js').IEEE1599Element[]} */
    this.parts = Object.freeze(element?.elements('part') ?? []);
    /** `voice_item` elements of all parts, in order. @type {readonly import('./node.js').IEEE1599Element[]} */
    this.voiceItems = Object.freeze(this.parts.flatMap((part) => part.element('voice_list')?.elements('voice_item') ?? []));
    /**
     * Every LOS element attached to a Spine event (any element with an
     * `event_ref` attribute), in document order.
     * @type {readonly import('./node.js').IEEE1599Element[]}
     */
    this.symbols = Object.freeze(element?.descendants((node) => node.vocabulary === 'ieee1599' && node.attribute('event_ref') !== null) ?? []);
    for (const staff of this.staves) this.#staves.set(staff.attribute('id') ?? '', staff);
    for (const item of this.voiceItems) this.#voiceItems.set(item.attribute('id') ?? '', item);
    for (const symbol of this.symbols) {
      const id = /** @type {string} */ (symbol.attribute('event_ref'));
      const list = this.#byEvent.get(id);
      if (list) list.push(symbol);
      else this.#byEvent.set(id, [symbol]);
    }
  }

  /**
   * LOS elements attached to a Spine event, in document order.
   * @param {string} eventId Spine event ID.
   * @returns {readonly import('./node.js').IEEE1599Element[]}
   */
  forEvent(eventId) {
    return this.#byEvent.get(eventId) ?? [];
  }

  /**
   * Staff by ID.
   * @param {string} id Staff ID.
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  staff(id) {
    return this.#staves.get(id) ?? null;
  }

  /**
   * Voice item by ID.
   * @param {string} id Voice item ID.
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  voiceItem(id) {
    return this.#voiceItems.get(id) ?? null;
  }

  /**
   * Staff of an LOS element: its own `staff_ref` when specified, otherwise the
   * staff of the enclosing voice's `voice_item`.
   * @param {import('./node.js').IEEE1599Element} element Element inside the LOS.
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  staffOf(element) {
    const own = element.attribute('staff_ref');
    if (own !== null) return this.staff(own);
    const voice = element.closest('voice');
    const item = voice ? this.voiceItem(voice.attribute('voice_item_ref') ?? '') : null;
    const ref = item?.attribute('staff_ref');
    return ref ? this.staff(ref) : null;
  }

  /**
   * Enclosing `part` of an LOS element.
   * @param {import('./node.js').IEEE1599Element} element
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  partOf(element) {
    return element.closest('part');
  }

  /**
   * Enclosing `measure` of an LOS element.
   * @param {import('./node.js').IEEE1599Element} element
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  measureOf(element) {
    return element.closest('measure');
  }
}
