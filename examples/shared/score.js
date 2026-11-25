/**
 * Shared example-only canvas score renderer. Playback stays in the host.
 * @module examples/shared/score
 */

/**
 * @typedef {{eventRef: string, x1: number, x2: number, y1: number, y2: number}} Rectangle
 * @typedef {{url: string, events: readonly Rectangle[]}} Page
 */

/**
 * Draw score images at their intrinsic resolution, with scaled hit testing.
 * New page requests supersede earlier decodes; disposal cancels pending work.
 * @param {HTMLCanvasElement} canvas Rendering surface.
 * @param {(event: string) => void} seek Host-owned event navigation.
 * @param {string} [color] Highlight fill; defaults to amber.
 * @returns {{show: (page: Page) => Promise<void>, highlight: (refs: readonly string[]) => void, dispose: () => void}}
 */
export function scoreCanvas(canvas, seek, color = 'rgba(255, 170, 0, 0.48)') {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Score canvas is unavailable');
  /** @type {HTMLImageElement | undefined} */
  let image;
  /** @type {readonly Rectangle[]} */
  let rectangles = [];
  let generation = 0;
  let disposed = false;
  /** @type {Set<string>} */
  let highlighted = new Set();
  function draw() {
    if (!image || disposed || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    context.fillStyle = color;
    for (const { eventRef, x1, y1, x2, y2 } of rectangles) {
      if (highlighted.has(eventRef)) context.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    canvas.dataset.highlighted = [...highlighted].join(' ');
  }
  /** @param {MouseEvent} event */
  function click(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const x = (event.clientX - bounds.left - canvas.clientLeft) * canvas.width / canvas.clientWidth;
    const y = (event.clientY - bounds.top - canvas.clientTop) * canvas.height / canvas.clientHeight;
    const hit = rectangles.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
    if (hit) seek(hit.eventRef);
  }
  canvas.addEventListener('click', click);
  return {
    async show(page) {
      if (disposed) throw new Error('Score canvas is disposed');
      const request = ++generation;
      const next = new Image();
      next.src = page.url;
      try {
        await next.decode();
      } catch {
        if (request === generation && !disposed) throw new Error('Score image could not be decoded; check the local assets and image format');
        return;
      }
      if (request !== generation || disposed) return;
      image = next;
      rectangles = page.events;
      canvas.width = next.naturalWidth;
      canvas.height = next.naturalHeight;
      draw();
    },
    highlight(refs) {
      highlighted = new Set(refs);
      draw();
    },
    dispose() {
      disposed = true;
      generation++;
      image = undefined;
      rectangles = [];
      highlighted.clear();
      canvas.removeEventListener('click', click);
    }
  };
}
