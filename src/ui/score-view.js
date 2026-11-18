/**
 * @param {{container: HTMLElement,
 *   page: {url: string, events: readonly {eventRef: string, x1: number, y1: number, x2: number, y2: number}[]},
 *   onSeek: (eventRef: string) => void}} options
 */
export function createScoreView({ container, page, onSeek }) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.maxWidth = '100%';
  const image = document.createElement('img');
  image.src = page.url;
  image.alt = 'Score';
  image.style.display = 'block';
  image.style.maxWidth = '100%';
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const onLoad = () => overlay.setAttribute('viewBox', `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
  const onError = () => {
    alert.textContent = 'Could not load score image';
    alert.hidden = false;
  };
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
    rect.setAttribute('tabindex', '0');
    rect.setAttribute('role', 'button');
    rect.setAttribute('aria-label', `Seek to score event ${event.eventRef}`);
    rect.addEventListener('click', () => onSeek(event.eventRef));
    rect.addEventListener('keydown', (key) => {
      if (key.key === 'Enter' || key.key === ' ') {
        key.preventDefault();
        onSeek(event.eventRef);
      }
    });
    overlay.append(rect);
    rectangles.push({ element: rect, eventRef: event.eventRef });
  }
  wrapper.append(image, overlay, alert);
  container.append(wrapper);
  return {
    /** @param {readonly string[]} eventRefs */
    highlight(eventRefs) {
      const selected = new Set(eventRefs);
      for (const { element, eventRef } of rectangles) {
        element.setAttribute('fill', selected.has(eventRef) ? 'rgba(255, 180, 0, 0.4)' : 'transparent');
      }
    },
    dispose() {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      wrapper.remove();
    }
  };
}
