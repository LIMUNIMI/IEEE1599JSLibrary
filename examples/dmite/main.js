import { createBufferedAudioPlayer, createPlayerProjection, parseIEEE1599Document } from '../../src/index.js';
import { scoreCanvas } from '../shared/score.js';
import { createVideoPresenter, openVideo } from '../shared/video.js';
import { createAssetSource } from './assets.js';
import { instrumentCatalogue, recordingTimeline } from './model.js';

/** @template {HTMLElement} T @param {string} id @param {{new(): T}} type */
function element(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing DmITE control: ${id}`);
  return found;
}

const files = element('assets', HTMLInputElement);
const served = element('served', HTMLButtonElement);
const status = element('status', HTMLElement);
const error = element('error', HTMLElement);
const validation = element('validation', HTMLElement);
const title = element('title', HTMLElement);
const credits = element('credits', HTMLElement);
const edition = element('edition', HTMLSelectElement);
const pages = element('page', HTMLSelectElement);
const events = element('event', HTMLSelectElement);
const jump = element('jump', HTMLButtonElement);
const canvas = element('score', HTMLCanvasElement);
const note = element('note', HTMLOutputElement);
const panels = element('panels', HTMLElement);
const play = element('play', HTMLButtonElement);
const rewind = element('rewind', HTMLButtonElement);
const slow = element('slow', HTMLButtonElement);
const normal = element('normal', HTMLButtonElement);
const fast = element('fast', HTMLButtonElement);
const oneNote = element('one-note', HTMLInputElement);
const position = element('position', HTMLInputElement);
const time = element('time', HTMLOutputElement);
const transport = [play, rewind, slow, normal, fast, oneNote, position, jump];

/** @type {{controller: AbortController, dispose?: () => void} | undefined} */
let session;

/** @param {unknown} reason */
function report(reason) {
  error.textContent = reason instanceof Error ? reason.message : String(reason);
}

/** @param {HTMLSelectElement} select @param {{label: string, value: string}[]} options */
function choices(select, options) {
  select.replaceChildren(...options.map(({ label, value }) => new Option(label, value)));
}

/** @param {string[]} labels */
const indexed = (labels) => labels.map((label, i) => ({ label, value: String(i) }));

/**
 * Set up one score, three independent listening choices and one audible
 * fully decoded recording. No presentation timer is a playback clock.
 * @param {ReturnType<typeof createAssetSource>} source
 * @param {import('../../src/model/document.js').IEEE1599Document} doc
 * @param {string} params
 * @param {AbortSignal} signal
 */
function mount(source, doc, params, signal) {
  const { metadata, spine, graphicInstances, audioTracks, logicalEvents } = createPlayerProjection(doc);
  const editions = graphicInstances.filter((group) => group.pages.length);
  if (!editions.length) throw new Error('The IEEE 1599 document has no score images');
  const instruments = instrumentCatalogue(params, source.documentURL, audioTracks);
  const spineIds = spine.map(({ id }) => id);
  /** @type {Map<string, string[]>} */
  const notes = new Map();
  for (const { eventRef, kind, pitches } of logicalEvents) {
    const labels = kind === 'rest' ? ['rest'] : pitches.map(({ step, octave, accidental }) =>
      `${step}${accidental === 'sharp' ? '#' : accidental === 'flat' ? 'b' : ''}${octave}`);
    notes.set(eventRef, [...(notes.get(eventRef) ?? []), ...labels]);
  }

  title.textContent = metadata.mainTitle || 'DmITE';
  const people = metadata.authors.filter(({ type }) => type === 'composer');
  credits.textContent = [metadata.workTitle, (people.length ? people : metadata.authors).map(({ name }) => name).join(', ')]
    .filter(Boolean).join(' · ');
  validation.textContent = `${doc.issues.length} XML validation finding(s)`;
  choices(edition, indexed(editions.map((group, i) => group.description || `Score ${i + 1}`)));
  choices(events, spineIds.map((id) => ({ label: id, value: id })));
  for (const control of [edition, pages, events]) control.disabled = false;

  /** @type {{url: string, player: ReturnType<typeof createBufferedAudioPlayer>,
   *   timeline: ReturnType<typeof recordingTimeline>} | undefined} */
  let active;
  /** @type {AbortController | undefined} */
  let pending;
  /** @type {AudioContext | undefined} */
  let context;
  let resume = false;
  let resumeRef = '';
  let rate = 100;
  /** @type {number | undefined} */
  let noteEnd;
  let lastRefs = '';
  let lastState = '';
  let shown = 0;
  let frame = 0;
  let selected = 1;
  /** @typedef {{canvas: HTMLCanvasElement, status: HTMLElement, compass: HTMLElement,
   *   controller?: AbortController, presenter?: ReturnType<typeof createVideoPresenter>,
   *   timeline?: ReturnType<typeof recordingTimeline>}} VideoFeed */
  /** @type {VideoFeed[]} */
  const videoFeeds = [];
  const listeners = { signal };
  const view = scoreCanvas(canvas, seekEvent, 'rgba(228, 21, 28, 0.45)');
  const pageList = () => editions[Number(edition.value)].pages;

  async function showPage() {
    const request = ++shown;
    const page = pageList()[Number(pages.value)];
    canvas.hidden = true;
    try {
      await source.use(page.url, (url) => view.show({ ...page, url }));
      if (!signal.aborted && shown === request) canvas.hidden = false;
    } catch (reason) {
      if (!signal.aborted && shown === request) report(reason);
    }
  }

  function showEdition() {
    choices(pages, indexed(pageList().map(({ position }) => String(position))));
    lastRefs = '';
    void showPage();
  }

  /** @param {boolean} ready */
  function enableTransport(ready) {
    for (const control of transport) control.disabled = !ready;
    slow.disabled ||= rate <= 50;
    fast.disabled ||= rate >= 100;
  }

  /** @param {number} next */
  function changeRate(next) {
    rate = Math.max(50, Math.min(next, 100));
    normal.textContent = `${rate}%`;
    active?.player.setRate(rate / 100);
    enableTransport(Boolean(active));
  }

  /** @param {number} seconds */
  function seek(seconds) {
    if (!active) return;
    const { player, timeline } = active;
    player.seek(seconds);
    if (oneNote.checked && player.state === 'playing') {
      noteEnd = timeline.nextBoundary(player.currentTime, player.duration);
    }
    refresh();
  }

  /** @param {string} ref */
  function seekEvent(ref) {
    if (!active) {
      status.textContent = 'Wait for a recording to load before seeking.';
      return;
    }
    seek(active.timeline.resolve(ref).time);
  }

  /** @param {NonNullable<typeof active>} recording */
  async function start(recording) {
    const { player, timeline } = recording;
    if (player.state === 'ended') player.seek(0);
    if (oneNote.checked && player.currentTime < timeline.firstTime && timeline.firstTime < player.duration) {
      player.seek(timeline.firstTime);
    }
    noteEnd = oneNote.checked ? timeline.nextBoundary(player.currentTime, player.duration) : undefined;
    try {
      await player.play();
    } catch (reason) {
      if (active === recording) report(reason);
    }
  }

  /** @param {import('./model.js').Angle} angle */
  async function selectRecording({ track }) {
    if (active?.url === track.url) return;
    if (active) {
      resume = active.player.state === 'playing' || active.player.state === 'buffering';
      resumeRef = active.timeline.eventsAt(active.player.currentTime).at(-1) ?? '';
    }
    pending?.abort();
    const request = new AbortController();
    pending = request;
    const old = active;
    active = undefined;
    noteEnd = undefined;
    enableTransport(false);
    play.textContent = 'Play';
    error.textContent = '';
    status.textContent = 'Loading and decoding recording…';
    let player;
    try {
      await old?.player.dispose();
      request.signal.throwIfAborted();
      context ??= new AudioContext();
      player = createBufferedAudioPlayer({ context });
      const loadingPlayer = player;
      const buffer = await source.use(track.url, (url) => loadingPlayer.loadAudio(url, { signal: request.signal }));
      request.signal.throwIfAborted();
      const timeline = recordingTimeline(spineIds, track);
      player.addAudio(buffer, { id: 'recording' });
      player.setRate(rate / 100);
      if (resumeRef) player.seek(timeline.resolve(resumeRef).time);
      player.addEventListener('error', (event) => {
        if (active?.player === loadingPlayer && event instanceof CustomEvent) report(event.detail.error);
      }, { signal: request.signal });
      active = { url: track.url, player, timeline };
      const shouldPlay = resume;
      resume = false;
      resumeRef = '';
      enableTransport(true);
      status.textContent = 'Recording ready';
      refresh();
      renderVideos();
      if (shouldPlay && player.state !== 'ended') await start(active);
    } catch (reason) {
      if (active?.player === player) active = undefined;
      await player?.dispose();
      if (!request.signal.aborted) {
        enableTransport(false);
        status.textContent = 'Recording unavailable. Select another angle or instrument, or reload assets.';
        const filename = decodeURIComponent(new URL(track.url).pathname.split('/').at(-1) ?? '');
        report(new Error(`${filename}: ${reason instanceof Error ? reason.message : String(reason)}`));
      }
    }
  }

  /**
   * Map the active recording clock from its most recent Spine event to one
   * instrument's indexed video timeline.
   * @param {ReturnType<typeof recordingTimeline>} videoTimeline
   * @param {number} seconds
   */
  function videoPosition(videoTimeline, seconds) {
    if (!active) return 0;
    const ref = active.timeline.eventsAt(seconds).at(-1);
    if (!ref) return 0;
    const audioAnchor = active.timeline.resolve(ref).time;
    const videoAnchor = videoTimeline.resolve(ref).time;
    return Math.max(0, videoAnchor + seconds - audioAnchor);
  }

  /** @param {VideoFeed} feed @param {number} index */
  async function loadVideo(feed, index) {
    feed.controller?.abort();
    feed.presenter?.dispose();
    feed.presenter = undefined;
    feed.timeline = undefined;
    feed.canvas.hidden = true;
    feed.compass.hidden = false;
    const instrument = instruments[index];
    if (!instrument.video) {
      feed.status.textContent = 'No indexed video for this instrument.';
      feed.status.hidden = false;
      return;
    }

    const controller = new AbortController();
    feed.controller = controller;
    feed.status.textContent = 'Opening video…';
    feed.status.hidden = false;
    /** @type {Awaited<ReturnType<typeof openVideo>> | undefined} */
    let picture;
    try {
      picture = await source.media(instrument.video.path,
        (input) => openVideo(input, feed.canvas, controller.signal));
      if (controller.signal.aborted) {
        picture.dispose();
        return;
      }
      const timeline = recordingTimeline(spineIds, instrument.video.track);
      const presenter = createVideoPresenter(picture);
      feed.timeline = timeline;
      feed.presenter = presenter;
      await presenter.seek(videoPosition(timeline, active?.player.currentTime ?? 0));
      if (controller.signal.aborted) {
        presenter.dispose();
        feed.presenter = undefined;
        feed.timeline = undefined;
        return;
      }
      feed.canvas.hidden = false;
      feed.compass.hidden = true;
      feed.status.hidden = true;
    } catch (reason) {
      if (feed.presenter) {
        feed.presenter.dispose();
        feed.presenter = undefined;
        feed.timeline = undefined;
      } else {
        picture?.dispose();
      }
      if (!controller.signal.aborted) {
        feed.status.textContent = `Video unavailable: ${reason instanceof Error ? reason.message : String(reason)}`;
        feed.status.hidden = false;
        feed.canvas.hidden = true;
        feed.compass.hidden = false;
      }
    }
  }

  function renderVideos() {
    const seconds = active?.player.currentTime ?? 0;
    for (const feed of videoFeeds) {
      if (!feed.presenter || !feed.timeline) continue;
      void feed.presenter.present(videoPosition(feed.timeline, seconds)).catch((reason) => {
        feed.presenter?.dispose();
        feed.presenter = undefined;
        feed.canvas.hidden = true;
        feed.compass.hidden = false;
        feed.status.textContent = `Video unavailable: ${reason instanceof Error ? reason.message : String(reason)}`;
        feed.status.hidden = false;
      });
    }
  }

  function refresh() {
    if (!active) return;
    const { player, timeline } = active;
    if (player.state === 'playing' && noteEnd !== undefined && player.currentTime >= noteEnd) {
      player.pause();
      player.seek(noteEnd);
      noteEnd = undefined;
    }
    const seconds = player.currentTime;
    lastState = player.state;
    const playing = player.state === 'playing' || player.state === 'buffering';
    play.textContent = playing ? 'Pause' : 'Play';
    position.max = String(player.duration);
    position.value = String(seconds);
    time.value = `${seconds.toFixed(2)} / ${player.duration.toFixed(2)} s`;
    const refs = timeline.eventsAt(seconds);
    const key = refs.join(' ');
    if (key === lastRefs) return;
    lastRefs = key;
    view.highlight(refs);
    const page = pageList().findIndex((candidate) => candidate.events.some(({ eventRef }) => refs.includes(eventRef)));
    if (page >= 0 && page !== Number(pages.value)) {
      pages.value = String(page);
      void showPage();
    }
    note.value = refs.flatMap((ref) => notes.get(ref) ?? []).join(' ') || key;
  }

  function update() {
    if (active && (active.player.state === 'playing' || active.player.state !== lastState)) refresh();
    renderVideos();
    if (!signal.aborted) frame = requestAnimationFrame(update);
  }

  const template = document.getElementsByTagName('template')[0];
  const angleLabels = new Map([[0, 'Front'], [90, 'Right'], [180, 'Back'], [270, 'Left']]);
  const readPanels = ['Left', 'Center', 'Right'].map((label, index) => {
    const fragment = document.importNode(template.content, true);
    const block = fragment.querySelector('fieldset');
    const legend = fragment.querySelector('legend');
    const radio = fragment.querySelector('input');
    const [instrument, angle] = Array.from(fragment.querySelectorAll('select'));
    const videoCanvas = fragment.querySelector('canvas');
    const videoStatus = fragment.querySelector('.video-status');
    const compass = fragment.querySelector('.compass');
    if (!block || !legend || !radio || !instrument || !angle || !(videoCanvas instanceof HTMLCanvasElement)
      || !(videoStatus instanceof HTMLElement) || !(compass instanceof HTMLElement)) {
      throw new Error('Missing DmITE panel controls');
    }
    legend.textContent = label;
    radio.checked = index === selected;
    choices(instrument, indexed(instruments.map((item) => item.label)));
    const instrumentAngles = () => instruments[Number(instrument.value)].angles;
    const recording = () => instrumentAngles()[Number(angle.value)];
    const changeAngle = () => {
      block.style.setProperty('--angle', `${recording().degrees}deg`);
      if (selected === index) void selectRecording(recording());
    };
    const setAngles = () => {
      choices(angle, indexed(instrumentAngles().map(({ degrees }) => {
        const direction = angleLabels.get(degrees);
        return direction ? `${degrees}° (${direction})` : `${degrees}°`;
      })));
    };
    setAngles();
    block.style.setProperty('--angle', `${recording().degrees}deg`);
    block.disabled = false;
    instrument.addEventListener('change', () => { setAngles(); changeAngle(); }, listeners);
    angle.addEventListener('change', changeAngle, listeners);
    radio.addEventListener('change', () => { selected = index; changeAngle(); }, listeners);
    const feed = { canvas: videoCanvas, status: videoStatus, compass };
    videoFeeds.push(feed);
    instrument.addEventListener('change', () => void loadVideo(feed, Number(instrument.value)), listeners);
    panels.append(fragment);
    void loadVideo(feed, Number(instrument.value));
    return { recording };
  });

  edition.addEventListener('change', showEdition, listeners);
  pages.addEventListener('change', () => void showPage(), listeners);
  jump.addEventListener('click', () => seekEvent(events.value), listeners);
  position.addEventListener('input', () => seek(Number(position.value)), listeners);
  slow.addEventListener('click', () => changeRate(rate - 5), listeners);
  fast.addEventListener('click', () => changeRate(rate + 5), listeners);
  normal.addEventListener('click', () => changeRate(100), listeners);
  rewind.addEventListener('click', () => {
    active?.player.pause();
    noteEnd = undefined;
    seek(0);
    pages.value = '0';
    void showPage();
  }, listeners);
  play.addEventListener('click', () => {
    if (!active) return;
    if (active.player.state === 'playing' || active.player.state === 'buffering') active.player.pause();
    else void start(active);
    refresh();
  }, listeners);
  oneNote.addEventListener('change', () => {
    active?.player.pause();
    noteEnd = undefined;
    refresh();
  }, listeners);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && oneNote.checked) {
      active?.player.pause();
      noteEnd = undefined;
      refresh();
    }
  }, listeners);
  changeRate(100);
  showEdition();
  void selectRecording(readPanels[selected].recording());
  update();

  return () => {
    pending?.abort();
    for (const feed of videoFeeds) {
      feed.controller?.abort();
      feed.presenter?.dispose();
    }
    cancelAnimationFrame(frame);
    view.dispose();
    void (async () => {
      await active?.player.dispose();
      await context?.close();
    })().catch(console.error);
  };
}

/** @param {Iterable<File>} [localFiles] */
async function load(localFiles) {
  session?.controller.abort();
  session?.dispose?.();
  const request = { controller: new AbortController(), dispose: /** @type {(() => void) | undefined} */ (undefined) };
  session = request;
  const { signal } = request.controller;
  status.textContent = 'Loading DmITE XML…';
  error.textContent = '';
  validation.textContent = '';
  title.textContent = 'DmITE';
  credits.textContent = '';
  canvas.hidden = true;
  note.value = '';
  time.value = '0.00 / 0.00 s';
  play.textContent = 'Play';
  oneNote.checked = false;
  position.value = '0';
  panels.replaceChildren();
  for (const control of [...transport, edition, pages, events]) control.disabled = true;
  try {
    const source = createAssetSource(localFiles);
    const [xml, params] = await Promise.all([
      source.text('variationsserieuses.xml', signal), source.text('params.xml', signal)
    ]);
    signal.throwIfAborted();
    const doc = parseIEEE1599Document(xml, { strict: false, baseURL: source.documentURL });
    request.dispose = mount(source, doc, params, signal);
  } catch (reason) {
    if (!signal.aborted) {
      status.textContent = 'Choose an assets folder to load the example.';
      report(reason);
      request.controller.abort();
    }
  }
}

files.addEventListener('change', () => {
  const selectedFiles = Array.from(files.files ?? []);
  files.value = '';
  if (selectedFiles.length) void load(selectedFiles);
});
served.addEventListener('click', () => void load());
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  session?.controller.abort();
  session?.dispose?.();
});
