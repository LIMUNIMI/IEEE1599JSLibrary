/**
 * Dependency-free rotary angle selector for the DmITE example. It replaces
 * the original jqxKnob: a translucent red pointer rides a ring overlaid on
 * the directivity video, snapping to the recorded angles. A native range
 * input provides keyboard control and slider semantics.
 * @module examples/dmite/knob
 */

const SVG = 'http://www.w3.org/2000/svg';
/** Pointer and tick ring radius in the -100..100 view box (jqxKnob offset 85%). */
const RING = 85;
const DIRECTIONS = new Map([[0, 'Front'], [90, 'Right'], [180, 'Back'], [270, 'Left']]);

/**
 * Describe an angle for menus and assistive technology.
 * @param {number} degrees Clockwise angle from the front, 0–359.
 * @returns {string} For example `90° (Right)`.
 */
export function angleText(degrees) {
  const direction = DIRECTIONS.get(degrees);
  return direction ? `${degrees}° (${direction})` : `${degrees}°`;
}

/**
 * Convert a point relative to the dial centre to a clockwise angle from the
 * top, as used by DmITE (0 front, 90 right, 180 back, 270 left).
 * @param {number} x Horizontal offset, positive to the right.
 * @param {number} y Vertical offset, positive downwards.
 * @returns {number} Degrees in [0, 360).
 */
export function pointAngle(x, y) {
  const degrees = Math.atan2(x, -y) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * Find the available angle closest to a requested direction, measuring
 * around the circle so 350° is next to 0°.
 * @param {number[]} angles Available angles in degrees; must not be empty.
 * @param {number} degrees Requested direction.
 * @returns {number} Index into `angles`.
 */
export function nearestAngle(angles, degrees) {
  let best = 0;
  let distance = Infinity;
  angles.forEach((angle, index) => {
    const difference = Math.abs(angle - degrees) % 360;
    const around = Math.min(difference, 360 - difference);
    if (around < distance) {
      best = index;
      distance = around;
    }
  });
  return best;
}

/**
 * @param {string} name
 * @param {Record<string, string | number>} attributes
 * @returns {SVGElement}
 */
function svg(name, attributes) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** @param {number} degrees @param {number} radius @returns {[number, number]} */
function polar(degrees, radius) {
  const radians = degrees * Math.PI / 180;
  return [radius * Math.sin(radians), -radius * Math.cos(radians)];
}

/**
 * Create a rotary angle control. Dragging previews the angle and commits it
 * on release; keyboard changes commit immediately, as for a native slider.
 * @param {{label?: string, angles: number[], index?: number,
 *   onChange: (index: number) => void, signal?: AbortSignal}} options
 *   `angles` are the selectable directions in degrees; `onChange` receives
 *   the committed index into them.
 * @returns {{element: HTMLElement, input: HTMLInputElement, readonly index: number,
 *   setAngles: (angles: number[], index?: number) => void}}
 * @throws {RangeError} If no angle is available.
 */
export function createAngleKnob({ label = 'Angle', angles, index = 0, onChange, signal }) {
  const element = document.createElement('div');
  element.className = 'knob';
  const dial = /** @type {SVGSVGElement} */ (svg('svg', { viewBox: '-100 -100 200 200', 'aria-hidden': 'true' }));
  const ticks = svg('g', { class: 'knob-ticks' });
  const labels = svg('g', { class: 'knob-labels' });
  const pointer = svg('circle', { class: 'knob-pointer', r: 10, cx: 0, cy: -RING });
  dial.append(svg('circle', { class: 'knob-ring', r: RING }), ticks, labels, pointer);
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'knob-input';
  input.min = '0';
  input.step = '1';
  input.setAttribute('aria-label', label);
  element.append(dial, input);

  /** @type {number[]} */
  let current = [];
  let committed = 0;

  /** @param {number} next */
  function show(next) {
    input.value = String(next);
    const degrees = current[next];
    input.setAttribute('aria-valuetext', angleText(degrees));
    const [cx, cy] = polar(degrees, RING);
    pointer.setAttribute('cx', cx.toFixed(2));
    pointer.setAttribute('cy', cy.toFixed(2));
    element.dataset.degrees = String(degrees);
  }

  /** @param {number} next */
  function commit(next) {
    show(next);
    if (next === committed) return;
    committed = next;
    onChange(next);
  }

  /** @param {number[]} angles @param {number} [selected] */
  function setAngles(angles, selected = 0) {
    if (!angles.length) throw new RangeError('A knob needs at least one angle');
    current = [...angles];
    committed = Math.min(Math.max(0, selected), current.length - 1);
    input.max = String(current.length - 1);
    input.disabled = current.length < 2;
    ticks.replaceChildren(...current.map((degrees) => {
      const [cx, cy] = polar(degrees, RING);
      return svg('circle', { cx: cx.toFixed(2), cy: cy.toFixed(2), r: 1.6 });
    }));
    labels.replaceChildren(...[...DIRECTIONS].map(([degrees, name]) => {
      const [x, y] = polar(degrees, RING - 14);
      const text = svg('text', { x: x.toFixed(2), y: y.toFixed(2) });
      text.textContent = name;
      return text;
    }));
    show(committed);
  }

  /** @param {PointerEvent} event @returns {number} */
  function indexAt(event) {
    const bounds = dial.getBoundingClientRect();
    return nearestAngle(current, pointAngle(event.clientX - bounds.left - bounds.width / 2,
      event.clientY - bounds.top - bounds.height / 2));
  }

  const listeners = { signal };
  let dragging = false;
  dial.addEventListener('pointerdown', (event) => {
    if (input.disabled || event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    dial.setPointerCapture(event.pointerId);
    input.focus({ preventScroll: true });
    show(indexAt(event));
  }, listeners);
  dial.addEventListener('pointermove', (event) => { if (dragging) show(indexAt(event)); }, listeners);
  dial.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    commit(indexAt(event));
  }, listeners);
  dial.addEventListener('pointercancel', () => {
    dragging = false;
    show(committed);
  }, listeners);
  input.addEventListener('input', () => show(Number(input.value)), listeners);
  input.addEventListener('change', () => commit(Number(input.value)), listeners);

  setAngles(angles, index);
  return {
    element,
    input,
    get index() { return committed; },
    setAngles
  };
}
