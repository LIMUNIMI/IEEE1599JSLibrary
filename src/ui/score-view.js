/**
 * Optional, framework-free score page view: an image with clickable
 * highlight rectangles. Knows no XML or media; applications map event IDs to
 * performance time.
 * @module ieee1599/ui/score-view
 */
import { loadIIIFImage } from '../adapters/iiif.js';

/**
 * @typedef {object} ScorePage
 * @property {string} url Image URL or IIIF Image API 2/3 `info.json`.
 * @property {readonly {eventRef: string, x1: number, y1: number, x2: number, y2: number}[]} events
 *   Rectangles in full-image source pixels (also for reduced IIIF responses).
 */

/**
 * Handle returned by {@link createScoreView}.
 * @typedef {object} ScoreView
 * @property {(eventRefs: readonly string[]) => void} highlight Highlight exactly
 *   these event IDs (`[]` clears).
 * @property {Promise<void>} ready Resolves after the image loads; failures also appear in an alert.
 * @property {(zoom: number) => void} setZoom Set positive scale relative to the container width.
 * @property {() => void} scrollToCurrent Scroll the first highlighted event into view.
 * @property {() => void} dispose Remove the view's DOM and listeners.
 */

/**
 * Show one score page and report clicks on its event rectangles. Each
 * rectangle is a button labelled `Seek to score event <id>`, so the view is
 * keyboard accessible. Coordinates are image pixels and scale with the image.
 * @returns {ScoreView}
 * @example
 * const view = createScoreView({ container, page: player.graphicInstances[0].pages[0],
 *   onSeek: (ref) => audio.seek(timeline.resolve(ref).time) });
 * view.highlight(timeline.eventsAt(audio.currentTime));
 * @param {{container: HTMLElement, page: ScorePage,
 *   onSeek: (eventRef: string) => void}} options
 */
export function createScoreView({ container, page, onSeek }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ieee1599-score-page';
  const style = document.createElement('style');
  style.textContent = '.ieee1599-score-page [role=button]:focus-visible { outline: 2px solid var(--ieee1599-focus-color, #2563eb); }';
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.maxWidth = '100%';
  const image = document.createElement('img');
  image.alt = 'Score';
  image.style.display = 'block';
  image.style.maxWidth = '100%';
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.setAttribute('aria-label', 'Score events');
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  let disposed = false;
  let width = 0;
  let height = 0;
  const loading = new AbortController();
  let resolveReady = () => {};
  /** @type {(reason: unknown) => void} */
  let rejectReady = () => {};
  const ready = new Promise((resolve, reject) => {
    resolveReady = () => resolve(undefined);
    rejectReady = reject;
  });
  const onLoad = () => {
    overlay.setAttribute('viewBox', `0 0 ${width || image.naturalWidth} ${height || image.naturalHeight}`);
    resolveReady();
  };
  const onError = () => {
    rejectReady(new Error('Could not load score image'));
  };
  ready.catch((error) => {
    if (disposed) return;
    alert.textContent = error instanceof Error ? error.message : String(error);
    alert.hidden = false;
  });
  image.addEventListener('load', onLoad);
  image.addEventListener('error', onError);
  /** @type {{element: SVGRectElement, eventRef: string}[]} */
  const rectangles = [];
  for (const event of page.events) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(event.x1));
    rect.setAttribute('y', String(event.y1));
    rect.setAttribute('width', String(event.x2 - event.x1));
    rect.setAttribute('height', String(event.y2 - event.y1));
    rect.setAttribute('fill', 'transparent');
    rect.setAttribute('tabindex', rectangles.length === 0 ? '0' : '-1');
    rect.setAttribute('role', 'button');
    rect.setAttribute('aria-label', `Seek to score event ${event.eventRef}`);
    rect.addEventListener('click', () => onSeek(event.eventRef));
    rect.addEventListener('keydown', (key) => {
      if (key.key === 'Enter' || key.key === ' ') {
        key.preventDefault();
        onSeek(event.eventRef);
      } else {
        const index = rectangles.findIndex((entry) => entry.element === rect);
        const next = key.key === 'Home' ? 0 : key.key === 'End' ? rectangles.length - 1
          : key.key === 'ArrowRight' || key.key === 'ArrowDown' ? Math.min(rectangles.length - 1, index + 1)
            : key.key === 'ArrowLeft' || key.key === 'ArrowUp' ? Math.max(0, index - 1) : -1;
        if (next < 0) return;
        key.preventDefault();
        rectangles.forEach(({ element }, i) => element.setAttribute('tabindex', i === next ? '0' : '-1'));
        rectangles[next].element.focus();
      }
    });
    overlay.append(rect);
    rectangles.push({ element: rect, eventRef: event.eventRef });
  }
  const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  cursor.setAttribute('stroke', 'var(--ieee1599-cursor-color, #b45309)');
  cursor.setAttribute('stroke-width', 'var(--ieee1599-cursor-width, 2)');
  cursor.setAttribute('vector-effect', 'non-scaling-stroke');
  cursor.setAttribute('pointer-events', 'none');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.display = 'none';
  overlay.append(cursor);
  wrapper.append(style, image, overlay, alert);
  container.append(wrapper);
  if (/\/info\.json(?:[?#]|$)/.test(page.url)) {
    loadIIIFImage(page.url, { signal: loading.signal }).then((source) => {
      if (disposed) return;
      width = source.width;
      height = source.height;
      image.src = source.url;
    }).catch(rejectReady);
  } else image.src = page.url;
  /** @type {SVGRectElement | undefined} */
  let current;
  /** @type {Set<string> | undefined} */
  let highlighted;
  return {
    ready,
    /** @param {readonly string[]} eventRefs */
    highlight(eventRefs) {
      const selected = new Set(eventRefs);
      if (highlighted?.size === selected.size && [...selected].every((ref) => highlighted?.has(ref))) return;
      highlighted = selected;
      current = undefined;
      for (const { element, eventRef } of rectangles) {
        const active = selected.has(eventRef);
        element.setAttribute('fill', active ? 'var(--ieee1599-highlight-color, rgba(255, 180, 0, 0.4))' : 'transparent');
        element.setAttribute('aria-pressed', String(active));
        if (active && !current) current = element;
      }
      cursor.style.display = current ? '' : 'none';
      if (current) {
        cursor.setAttribute('x1', current.getAttribute('x') ?? '0');
        cursor.setAttribute('x2', current.getAttribute('x') ?? '0');
        cursor.setAttribute('y1', current.getAttribute('y') ?? '0');
        cursor.setAttribute('y2', String(Number(current.getAttribute('y')) + Number(current.getAttribute('height'))));
      }
    },
    setZoom(zoom) {
      if (!Number.isFinite(zoom) || zoom <= 0) throw new RangeError('Zoom must be positive');
      wrapper.style.maxWidth = 'none';
      wrapper.style.width = `${zoom * 100}%`;
      image.style.width = '100%';
    },
    scrollToCurrent() {
      current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    },
    dispose() {
      disposed = true;
      loading.abort();
      rejectReady(new Error('Score view is disposed'));
      image.removeAttribute('src');
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      wrapper.remove();
    }
  };
}
