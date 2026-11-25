/**
 * @typedef {{eventRef: string, x1: number, x2: number, y1: number, y2: number}} Rectangle
 * @typedef {{url: string, events: Rectangle[]}} Page
 */

/** @param {HTMLCanvasElement} canvas @param {(event: string) => void} seek */
export function scoreCanvas(canvas, seek) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Score canvas is unavailable');
  /** @type {HTMLImageElement | undefined} */
  let image;
  /** @type {Rectangle[]} */
  let rectangles = [];
  let generation = 0;
  let highlighted = new Set();
  function draw() {
    if (!image || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    context.fillStyle = 'rgba(255, 170, 0, 0.48)';
    for (const { eventRef, x1, y1, x2, y2 } of rectangles) {
      if (highlighted.has(eventRef)) context.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    canvas.dataset.highlighted = [...highlighted].join(' ');
  }
  canvas.addEventListener('click', (event) => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left - canvas.clientLeft) * canvas.width / canvas.clientWidth;
    const y = (event.clientY - bounds.top - canvas.clientTop) * canvas.height / canvas.clientHeight;
    const hit = rectangles.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
    if (hit) seek(hit.eventRef);
  });
  return {
    /** @param {Page} page */
    async show(page) {
      const request = ++generation;
      const next = new Image();
      next.src = page.url.replace(/\.tif$/i, '.png');
      try {
        await next.decode();
      } catch {
        if (request === generation) throw new Error('Score image could not be decoded; prepare the local assets first');
        return;
      }
      if (request !== generation) return;
      image = next;
      rectangles = page.events;
      canvas.width = next.naturalWidth;
      canvas.height = next.naturalHeight;
      draw();
    },
    /** @param {string[]} refs */
    highlight(refs) {
      highlighted = new Set(refs);
      draw();
    }
  };
}
