/**
 * Starter web player for your own IEEE 1599 material: a score that follows a
 * recording, clickable score events, page turning and switching between
 * performances while keeping the score position. Copy this folder, change
 * what you need, and read the "Build your own player" guide for each step.
 * @module examples/starter
 */
import { createBufferedAudioPlayer, createPlayerProjection, createTimeline,
  loadIEEE1599Document } from '../../src/index.js';
import { createScoreView } from '../../src/ui/score-view.js';
import { createTransportControls } from '../../src/ui/transport-controls.js';
import { createAssetSource } from '../dmite/assets.js';

/** @typedef {import('../../src/xml/parse.js').PlayerDocument} PlayerDocument */
/** @typedef {PlayerDocument['audioTracks'][number]} Recording */
/** @typedef {PlayerDocument['graphicInstances'][number]['pages'][number]} ScorePage */

/** @param {string} selector @returns {any} */
const element = (selector) => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`Missing page element: ${selector}`);
  return found;
};

/**
 * Recordings the player can use: tracks with a time for at least one score
 * event, excluding video (see the DmITE example for synchronized video).
 * @param {PlayerDocument} piece
 * @returns {Recording[]}
 */
export function playableRecordings(piece) {
  return piece.audioTracks.filter((track) => track.events.length > 0
    && !/^video/i.test(track.format ?? '') && !/\.(mp4|mov|m4v|avi)$/i.test(track.url));
}

/**
 * Index of the first score page showing any of the given events, or `-1`.
 * @param {readonly ScorePage[]} pages
 * @param {readonly string[]} eventRefs
 * @returns {number}
 */
export function pageShowing(pages, eventRefs) {
  return pages.findIndex((page) => page.events.some((event) => eventRefs.includes(event.eventRef)));
}

/** Everything belonging to the document currently open. */
const session = {
  /** @type {AbortController | null} */ loading: null,
  /** @type {AbortController | null} */ recording: null,
  /** @type {ReturnType<typeof createBufferedAudioPlayer> | null} */ player: null,
  /** @type {{dispose(): void} | null} */ controls: null,
  /** @type {ReturnType<typeof createScoreView> | null} */ view: null,
  /** @type {ReturnType<typeof createTimeline> | null} */ timeline: null,
  /** @type {ReturnType<typeof createAssetSource> | null} */ source: null,
  /** @type {ScorePage[]} */ pages: [],
  /** @type {string[]} */ spine: [],
  pageIndex: -1,
  frame: 0
};

/**
 * Show one score page; clicking an event seeks the current recording.
 * @param {number} index Page index in `session.pages`.
 */
function showPage(index) {
  if (index < 0 || index >= session.pages.length) return;
  let page = session.pages[index];
  try {
    if (session.source) page = { ...page, url: session.source.imageURL(page.url) };
  } catch (error) {
    report(error);
    return;
  }
  session.view?.dispose();
  session.pageIndex = index;
  session.view = createScoreView({
    container: element('#score'),
    page,
    onSeek: (eventRef) => {
      if (session.player && session.timeline) session.player.seek(session.timeline.resolve(eventRef).time);
    }
  });
  element('#page').textContent = `Page ${index + 1} of ${session.pages.length}`;
  element('#previous').disabled = index === 0;
  element('#next').disabled = index === session.pages.length - 1;
  refresh();
}

/**
 * Highlight the events sounding now and turn the page when they are elsewhere.
 * Animation frames only repaint; the player's clock is the time authority.
 */
function refresh() {
  cancelAnimationFrame(session.frame);
  session.frame = 0;
  const { player, timeline } = session;
  if (!player || !timeline) return;
  const current = timeline.eventsAt(player.currentTime);
  const target = pageShowing(session.pages, current);
  if (target >= 0 && target !== session.pageIndex && player.state === 'playing') return showPage(target);
  session.view?.highlight(current);
  element('#now').textContent = `${current.join(', ') || '—'} at ${player.currentTime.toFixed(2)} s`;
  if (player.state === 'playing') session.frame = requestAnimationFrame(refresh);
}

/**
 * Load one recording. When switching, start at the score event the previous
 * recording was playing, so listeners can compare performances.
 * @param {Recording} recording
 * @param {AbortSignal} signal
 */
async function useRecording(recording, signal) {
  session.recording?.abort();
  const request = new AbortController();
  session.recording = request;
  signal = globalThis.AbortSignal.any([signal, request.signal]);
  const previous = session.player && session.timeline
    ? session.timeline.eventsAt(session.player.currentTime)[0] : undefined;
  session.controls?.dispose();
  const oldPlayer = session.player;
  session.player = null;
  await oldPlayer?.dispose();
  signal.throwIfAborted();
  element('#status').textContent = `Loading ${recording.url}…`;
  const player = createBufferedAudioPlayer();
  try {
    const buffer = session.source
      ? await session.source.use(recording.url, (url) => player.loadAudio(url, { signal }))
      : await player.loadAudio(recording.url, { signal });
    signal.throwIfAborted();
    player.addAudio(buffer, { id: 'recording' });
  } catch (error) {
    await player.dispose();
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error(`Cannot play ${recording.url}: ${error instanceof Error ? error.message : error}`, { cause: error });
  }
  session.player = player;
  session.timeline = createTimeline(session.spine, recording.events);
  if (previous) player.seek(session.timeline.resolve(previous).time);
  session.controls = createTransportControls({ container: element('#controls'), player });
  player.addEventListener('statechange', refresh);
  player.addEventListener('positionchange', refresh);
  player.addEventListener('error', (event) => report(/** @type {CustomEvent} */ (event).detail.error));
  element('#status').textContent = '';
  const page = pageShowing(session.pages, session.timeline.eventsAt(player.currentTime));
  showPage(page >= 0 ? page : Math.max(session.pageIndex, 0));
}

/** Release audio, listeners and the score view of the previous document. */
async function close() {
  const previous = { ...session };
  Object.assign(session, { loading: null, player: null, controls: null, view: null, timeline: null,
    recording: null, source: null, pages: [], spine: [], pageIndex: -1, frame: 0 });
  previous.loading?.abort();
  previous.recording?.abort();
  cancelAnimationFrame(previous.frame);
  previous.controls?.dispose();
  previous.view?.dispose();
  previous.source?.dispose();
  await previous.player?.dispose();
}

let opening = 0;
/**
 * Open an IEEE 1599 document. Paths inside it (score images, recordings) are
 * resolved relative to the document, so keep them next to the XML.
 * @param {string} url
 * @param {ReturnType<typeof createAssetSource>} [source] Selected local folder.
 */
async function open(url, source) {
  const generation = ++opening;
  await close();
  if (generation !== opening) {
    source?.dispose();
    return;
  }
  const loading = new AbortController();
  session.loading = loading;
  session.source = source ?? null;
  element('#player').hidden = true;
  element('#status').textContent = `Opening ${url}…`;
  try {
    // Lenient mode keeps going on DTD findings; the projection still rejects
    // data the player cannot use. Use the inspector example to review findings.
    const doc = source
      ? await source.use(url, (localURL) => loadIEEE1599Document(localURL, {
        strict: false, baseURL: source.documentURL, signal: loading.signal
      }))
      : await loadIEEE1599Document(url, { strict: false, signal: loading.signal });
    loading.signal.throwIfAborted();
    const piece = createPlayerProjection(doc);
    const title = piece.metadata.mainTitle ?? piece.metadata.workTitle ?? 'Untitled';
    element('#title').textContent = title;
    document.title = title;
    element('#authors').textContent = piece.metadata.authors
      .map((author) => author.type ? `${author.name} (${author.type})` : author.name).join(', ');
    session.spine = piece.spine.map((event) => event.id);
    session.pages = piece.graphicInstances[0]?.pages ?? [];
    const recordings = playableRecordings(piece);
    if (!session.pages.length) throw new Error('The document has no usable score pages (pixel coordinates required).');
    if (!recordings.length) throw new Error('The document has no indexed audio recording (audio layer, timing in seconds).');
    const select = element('#recording');
    select.replaceChildren(...recordings.map((recording, index) =>
      new Option(decodeURIComponent(recording.url.split('/').at(-1) ?? `Recording ${index + 1}`), String(index))));
    select.onchange = () => {
      useRecording(recordings[Number(select.value)], loading.signal).catch(report);
    };
    element('#player').hidden = false;
    await useRecording(recordings[0], loading.signal);
    element('#status').textContent = [
      !doc.valid ? `Opened with ${doc.issues.length} validation finding(s); check them in the inspector example.` : '',
      ...piece.warnings.filter((warning) => !warning.startsWith('Unsupported XML element:'))
    ].filter(Boolean).join(' ');
  } catch (error) {
    report(error);
  }
}

/** @param {unknown} error */
function report(error) {
  if (error instanceof Error && error.name === 'AbortError') return;
  element('#status').textContent = error instanceof Error ? error.message : String(error);
}

element('#previous').addEventListener('click', () => showPage(session.pageIndex - 1));
element('#next').addEventListener('click', () => showPage(session.pageIndex + 1));
element('#open').addEventListener('submit', (/** @type {SubmitEvent} */ event) => {
  event.preventDefault();
  open(new URL(element('#document').value, location.href).href);
});
const requested = new URL(location.href).searchParams.get('document');
if (requested) element('#document').value = requested;
/** @type {File[]} Files held only while the user keeps this tab open. */
let selectedFiles = [];
element('#folder').addEventListener('change', () => {
  opening++;
  selectedFiles = [...element('#folder').files];
  const documents = selectedFiles.filter((file) => /\.xml$/i.test(file.name))
    .map((file) => file.webkitRelativePath.split('/').slice(1).join('/')).sort();
  element('#local-document').replaceChildren(...documents.map((name) => new Option(name, name)));
  element('#local-document').disabled = !documents.length;
  element('#open-local').disabled = !documents.length;
  close().then(() => {
    element('#player').hidden = true;
    element('#status').textContent = documents.length ? 'Select an IEEE 1599 XML file, then open it.' : 'No XML files found in the selected folder.';
  }).catch(report);
});
element('#open-local').addEventListener('click', () => {
  try {
    const source = createAssetSource(selectedFiles, {
      baseURL: new URL('./materials/', location.href).href,
      documentName: element('#local-document').value
    });
    open(source.documentURL, source).catch(report);
  } catch (error) {
    report(error);
  }
});
element('#clear').addEventListener('click', () => {
  opening++;
  selectedFiles = [];
  element('#folder').value = '';
  element('#local-document').replaceChildren();
  element('#local-document').disabled = true;
  element('#open-local').disabled = true;
  close().then(() => {
    element('#player').hidden = true;
    element('#title').textContent = document.title = 'IEEE 1599 starter player';
    element('#authors').textContent = '';
    element('#now').textContent = '';
    element('#page').textContent = '';
    element('#recording').replaceChildren();
    element('#status').textContent = 'Materials cleared.';
  }).catch(report);
});
window.addEventListener('pagehide', () => { opening++; selectedFiles = []; close().catch(report); });
