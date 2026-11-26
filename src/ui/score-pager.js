/**
 * Accessible multi-page score navigation, zoom and score following.
 * @module ieee1599/ui/score-pager
 */
import { createScoreView } from './score-view.js';

/**
 * Show score pages using full-image pixel coordinates. Zoom scrolls within a
 * labelled viewport; highlighting can follow pages without moving keyboard
 * focus. Automatic scrolling is opt-in.
 * @param {object} options
 * @param {HTMLElement} options.container Host element.
 * @param {readonly import('./score-view.js').ScorePage[]} options.pages Ordered score pages.
 * @param {(eventRef: string) => void} options.onSeek Called on score activation.
 * @returns {{readonly pageIndex: number, readonly zoom: number, readonly ready: Promise<void>,
 *   showPage: (index: number) => void, setZoom: (zoom: number) => void,
 *   highlight: (refs: readonly string[], options?: {follow?: boolean, scroll?: boolean}) => void,
 *   dispose: () => void}}
 */
export function createScorePager({ container, pages, onSeek }) {
  if (!pages.length) throw new Error('At least one score page is required');
  const root = document.createElement('div');
  root.className = 'ieee1599-score-pager';
  const toolbar = document.createElement('div');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Score navigation');
  const previous = document.createElement('button');
  previous.type = 'button'; previous.textContent = 'Previous page';
  const next = document.createElement('button');
  next.type = 'button'; next.textContent = 'Next page';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const label = document.createElement('label');
  label.textContent = 'Zoom ';
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range'; zoomInput.min = '0.5'; zoomInput.max = '4'; zoomInput.step = '0.25'; zoomInput.value = '1';
  label.append(zoomInput);
  const viewport = document.createElement('div');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Score pages');
  viewport.style.overflow = 'auto';
  viewport.style.maxHeight = 'var(--ieee1599-score-height, 70vh)';
  toolbar.append(previous, status, next, label);
  root.append(toolbar, viewport);
  container.append(root);
  let pageIndex = 0;
  let zoom = 1;
  let refs = /** @type {readonly string[]} */ ([]);
  let view = createScoreView({ container: viewport, page: pages[0], onSeek });
  let disposed = false;
  function update() {
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex === pages.length - 1;
    status.textContent = `Page ${pageIndex + 1} of ${pages.length}`;
    view.setZoom(zoom);
    view.highlight(refs);
  }
  /** @param {number} index */
  function showPage(index) {
    if (disposed) throw new Error('Score pager is disposed');
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new RangeError('Invalid score page');
    if (pageIndex === index) return;
    view.dispose();
    pageIndex = index;
    view = createScoreView({ container: viewport, page: pages[index], onSeek });
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
    update();
    const focused = root.getRootNode();
    const active = 'activeElement' in focused ? focused.activeElement : null;
    if ((active === previous && previous.disabled) || (active === next && next.disabled)) viewport.focus();
  }
  /** @param {number} value */
  function setZoom(value) {
    if (disposed) throw new Error('Score pager is disposed');
    if (!Number.isFinite(value) || value < 0.5 || value > 4) throw new RangeError('Zoom must be between 0.5 and 4');
    zoom = value;
    zoomInput.value = String(zoom);
    view.setZoom(zoom);
  }
  const onPrevious = () => showPage(pageIndex - 1);
  const onNext = () => showPage(pageIndex + 1);
  const onZoom = () => setZoom(Number(zoomInput.value));
  /** @param {KeyboardEvent} event */
  const onKey = (event) => {
    if (event.target !== viewport) return;
    const index = event.key === 'PageDown' ? Math.min(pages.length - 1, pageIndex + 1)
      : event.key === 'PageUp' ? Math.max(0, pageIndex - 1) : -1;
    if (index >= 0) { event.preventDefault(); showPage(index); }
  };
  previous.addEventListener('click', onPrevious);
  next.addEventListener('click', onNext);
  zoomInput.addEventListener('input', onZoom);
  viewport.addEventListener('keydown', onKey);
  update();
  return {
    get pageIndex() { return pageIndex; },
    get zoom() { return zoom; },
    get ready() { return view.ready; },
    showPage, setZoom,
    highlight(eventRefs, { follow = true, scroll = false } = {}) {
      if (disposed) return;
      const changed = refs.length !== eventRefs.length || refs.some((ref, index) => ref !== eventRefs[index]);
      if (changed) refs = [...eventRefs];
      const previousPage = pageIndex;
      const focused = viewport.getRootNode() instanceof ShadowRoot
        ? /** @type {ShadowRoot} */ (viewport.getRootNode()).activeElement : document.activeElement;
      const editingEvent = focused instanceof Element && focused.getAttribute('role') === 'button' && viewport.contains(focused);
      if (follow && !editingEvent && !pages[pageIndex].events.some((event) => refs.includes(event.eventRef))) {
        const index = pages.findIndex((page) => page.events.some((event) => refs.includes(event.eventRef)));
        if (index >= 0) showPage(index);
      }
      view.highlight(refs);
      if (scroll && (changed || previousPage !== pageIndex)) view.scrollToCurrent();
    },
    dispose() {
      disposed = true;
      view.dispose();
      previous.removeEventListener('click', onPrevious);
      next.removeEventListener('click', onNext);
      zoomInput.removeEventListener('input', onZoom);
      viewport.removeEventListener('keydown', onKey);
      root.remove();
    }
  };
}
