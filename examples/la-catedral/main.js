import { loadIEEE1599 } from '../../src/xml/parse.js';
import { createTimeline } from '../../src/core/timeline.js';
import { openPerformance } from './playback.js';
import { scoreCanvas } from './score.js';

/** @template {HTMLElement} T @param {string} id @param {{new(): T}} type */
function element(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing La Catedral demo element: ${id}`);
  return found;
}
const performancePicker = element('performance', HTMLSelectElement);
const edition = element('edition', HTMLSelectElement);
const pages = element('pages', HTMLSelectElement);
const events = element('events', HTMLSelectElement);
const video = element('video', HTMLCanvasElement);
const canvas = element('score', HTMLCanvasElement);
const play = element('play', HTMLButtonElement);
const pause = element('pause', HTMLButtonElement);
const stop = element('stop', HTMLButtonElement);
const status = element('status', HTMLElement);
const errorOutput = element('error', HTMLElement);
const time = element('time', HTMLOutputElement);
const pagePicker = element('page-picker', HTMLElement);

/** @param {unknown} reason */
const report = (reason) => { errorOutput.textContent = reason instanceof Error ? reason.message : String(reason); };
/** @param {HTMLSelectElement} select @param {string[]} labels */
function choices(select, labels) {
  select.replaceChildren(...labels.map((label, index) => new Option(label, String(index))));
}

/** @type {Awaited<ReturnType<typeof openPerformance>> | undefined} */
let active;
/** @type {AudioContext | undefined} */
let context;
/** @type {AbortController | undefined} */
let load;
/** @type {ReturnType<typeof createTimeline> | undefined} */
let timeline;
let currentRefs = '';
let lastEvent = '';
let frame = 0;
const score = scoreCanvas(canvas, seekEvent);

/** @param {string} ref */
function seekEvent(ref) {
  if (!active || !timeline) return;
  void active.seek(timeline.resolve(ref).time).catch(report);
}

async function initialize() {
  const documentModel = await loadIEEE1599('./local/catedral.xml');
  const groups = documentModel.graphicInstances;
  const tracks = documentModel.audioTracks;
  if (!groups.length || tracks.length !== 3) throw new Error('Unexpected La Catedral fixture layout');
  const spine = documentModel.spine.map((item) => item.id);
  const timelines = tracks.map((track) => createTimeline(spine, track.events));
  choices(performancePicker, ['Augustin Barrios (1928)', 'Notis Mavrudis (1990)', 'Ana Vidovic (video)']);
  choices(edition, groups.map((group, i) => group.description ?? `Score ${i + 1}`));
  choices(events, spine);

  const showPage = () => {
    const page = groups[Number(edition.value)].pages[Number(pages.value)];
    if (page) void score.show(page).catch(report);
  };
  const showEdition = () => {
    const group = groups[Number(edition.value)];
    choices(pages, group.pages.map((page) => String(page.position)));
    pagePicker.hidden = group.pages.length <= 1;
    showPage();
    currentRefs = '';
  };

  let switchIntent = false;
  /** @param {number} index */
  async function selectPerformance(index) {
    if (active) {
      switchIntent = active.playing;
      lastEvent = timeline?.eventsAt(active.player.currentTime).at(-1) ?? '';
    }
    const shouldPlay = switchIntent;
    const ref = lastEvent;
    load?.abort();
    const request = new AbortController();
    load = request;
    const old = active;
    active = undefined;
    timeline = undefined;
    video.hidden = true;
    delete video.dataset.timestamp;
    errorOutput.textContent = '';
    status.textContent = 'Loading performance...';
    await old?.dispose();
    if (request.signal.aborted) return;
    try {
      context ??= new AudioContext();
      const source = tracks[index].url;
      const selected = await openPerformance({
        context,
        audio: [{ url: index === 2 ? source.replace(/_video\.avi$/i, '_soundtrack.mp3') : source }],
        video: index === 2 ? source.replace(/\.avi$/i, '.mp4') : undefined,
        canvas: video,
        signal: request.signal
      });
      if (request.signal.aborted) {
        await selected.dispose();
        return;
      }
      try {
        const mapping = timelines[index];
        await selected.seek(ref ? mapping.resolve(ref).time : 0);
        if (request.signal.aborted) {
          await selected.dispose();
          return;
        }
        active = selected;
        timeline = mapping;
        video.hidden = index !== 2;
        if (shouldPlay) await selected.play();
        switchIntent = false;
      } catch (reason) {
        if (active === selected) active = undefined;
        await selected.dispose();
        throw reason;
      }
    } catch (reason) {
      if (!request.signal.aborted) {
        switchIntent = false;
        status.textContent = 'Performance unavailable';
        report(reason);
      }
    }
  }

  function refresh() {
    const performance = active;
    play.disabled = !performance || performance.playing;
    pause.disabled = !performance?.playing;
    stop.disabled = events.disabled = !performance;
    if (performance && timeline) {
      const position = performance.player.currentTime;
      time.value = `${position.toFixed(2)} s`;
      const nextState = performance.buffering ? 'Buffering' : performance.player.state;
      if (status.textContent !== nextState) status.textContent = nextState;
      const refs = timeline.eventsAt(position);
      const key = refs.join(' ');
      if (key !== currentRefs) {
        currentRefs = key;
        score.highlight(refs);
        const group = groups[Number(edition.value)];
        const pageIndex = group.pages.findIndex((page) => page.events.some((event) => refs.includes(event.eventRef)));
        if (pageIndex >= 0 && String(pageIndex) !== pages.value) {
          pages.value = String(pageIndex);
          showPage();
        }
      }
      void performance.present().catch(report);
    }
    frame = requestAnimationFrame(refresh);
  }

  performancePicker.addEventListener('change', () => void selectPerformance(Number(performancePicker.value)));
  edition.addEventListener('change', showEdition);
  pages.addEventListener('change', showPage);
  events.addEventListener('change', () => seekEvent(spine[Number(events.value)]));
  play.addEventListener('click', () => void active?.play().catch(report));
  pause.addEventListener('click', () => active?.pause());
  stop.addEventListener('click', () => {
    active?.pause();
    void active?.seek(0).catch(report);
  });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    cancelAnimationFrame(frame);
    load?.abort();
    void active?.dispose();
    void context?.close();
  });
  performancePicker.disabled = edition.disabled = false;
  showEdition();
  refresh();
  await selectPerformance(0);
}

void initialize().catch((reason) => {
  status.textContent = 'Could not load La Catedral';
  report(`${reason instanceof Error ? reason.message : reason}. Run the local fixture preparation script first.`);
});
