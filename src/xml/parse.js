/**
 * Player projection of an IEEE 1599 document: the subset used by the buffered
 * player, timeline and score view. Built on the lossless document model in
 * `src/model/document.js`; use `parseIEEE1599Document()` for complete data.
 * @module ieee1599/xml/parse
 */
import { loadIEEE1599Document, parseIEEE1599Document } from '../model/document.js';

const supported = new Set([
  'ieee1599', 'general', 'description', 'main_title', 'work_title', 'work_number',
  'author', 'related_file', 'logic', 'spine', 'event', 'los', 'staff_list',
  'staff', 'part', 'voice_list', 'voice_item', 'measure', 'voice', 'chord',
  'rest', 'duration', 'notehead', 'pitch', 'notational', 'graphic_instance_group',
  'graphic_instance', 'graphic_event', 'audio', 'track', 'track_indexing',
  'track_event'
]);

/** @typedef {import('../model/node.js').IEEE1599Element} IEEE1599Element */

/**
 * Attribute value exactly as written in the source (DTD defaults ignored), as
 * the original DOM-based projection read it.
 * @param {IEEE1599Element} element
 * @param {string} name
 * @returns {string | null}
 */
function source(element, name) {
  return element.rawAttributes.find(([attribute]) => attribute === name)?.[1] ?? null;
}

/** @param {IEEE1599Element} element @param {string} name @returns {string} */
function required(element, name) {
  const value = source(element, name);
  if (value === null || value.trim() === '') throw new Error(`Missing ${name} on ${element.name}`);
  return value;
}

/** @param {IEEE1599Element} element @param {string} name @returns {number} */
function numberAttribute(element, name) {
  const value = Number(required(element, name));
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name} on ${element.name}`);
  return value;
}

/** @param {IEEE1599Element} element @param {string} name @returns {string} */
function token(element, name) {
  const value = element.attribute(name);
  if (!value?.trim()) throw new Error(`Missing ${name} on ${element.name}`);
  return value;
}

/** @param {IEEE1599Element} element @param {string} name @returns {number | null} */
function spineOffset(element, name) {
  const value = element.attribute(name);
  if (value === null || value.trim() === 'null') return null;
  return numberAttribute(element, name);
}

/** @param {IEEE1599Element} element @param {string} name @returns {string | null} */
function text(element, name) {
  return element.descendants(name)[0]?.text.trim() ?? null;
}

/** @param {IEEE1599Element} element @param {string} name @returns {boolean} */
const inside = (element, name) => element.ancestors().some((ancestor) => ancestor.name === name);

/**
 * @typedef {object} PlayerDocument
 * @property {{mainTitle: string | null, workTitle: string | null, workNumber: string | null,
 *   authors: {name: string, type: string | null}[], relatedFiles: {url: string, description: string | null}[]}} metadata
 *   General layer metadata.
 * @property {{id: string, timing: number | null, hpos: number | null}[]} spine Spine events with relative values.
 * @property {{eventRef: string, kind: string, voice: string | null,
 *   duration: {numerator: number, denominator: number | null} | null,
 *   pitches: {step: string, octave: number, accidental: string | null}[]}[]} logicalEvents LOS chords and rests.
 * @property {{description: string | null, pages: {position: number, url: string,
 *   events: {eventRef: string, x1: number, y1: number, x2: number, y2: number}[]}[]}[]} graphicInstances
 *   Notational graphic instance groups with pages sorted by `position_in_group`.
 * @property {{url: string, format: string | null, encoding: string | null,
 *   events: {eventRef: string, time: number}[]}[]} audioTracks Audio tracks with `seconds` track events.
 * @property {string[]} warnings Unsupported elements, score units and track timing types.
 */

/**
 * Derive the player projection from an already parsed document model, so an
 * application can load once with `loadIEEE1599Document()` (validating it and
 * keeping the complete data) and still drive the timeline and score view.
 * Element names outside the player subset are reported once each in
 * `warnings`.
 * @param {import('../model/document.js').IEEE1599Document} doc Parsed document.
 * @returns {PlayerDocument}
 * @throws {Error} For missing/invalid values the player needs, duplicate spine
 *   IDs, references to unknown spine events, invalid rectangles or durations,
 *   and negative `seconds` track times. Pages in non-pixel units and
 *   non-`seconds` indexes are skipped with warnings.
 *
 * @example
 * const doc = await loadIEEE1599Document('score.xml');
 * const player = createPlayerProjection(doc);
 * createTimeline(player.spine.map((e) => e.id), player.audioTracks[0].events);
 */
export function createPlayerProjection(doc) {
  const root = doc.root;
  const all = root.descendants((node) => node.vocabulary !== 'svg' && node.vocabulary !== 'midi');
  const warnings = new Set();
  /** @param {string} path */
  const resolve = (path) => doc.resolveURL(path);
  const spine = all.filter((element) => element.name === 'event' && element.parent?.name === 'spine' && element.parent.parent?.name === 'logic')
    .map((element) => ({
      id: token(element, 'id'),
      timing: spineOffset(element, 'timing'),
      hpos: spineOffset(element, 'hpos')
    }));
  const ids = new Set(spine.map((event) => event.id));
  if (ids.size !== spine.length) throw new Error('Duplicate spine event id');
  /** @param {IEEE1599Element} element */
  const ref = (element) => {
    const id = token(element, 'event_ref');
    if (!ids.has(id)) throw new Error(`Unknown spine event: ${id}`);
    return id;
  };
  const general = all.find((element) => element.name === 'general') ?? null;
  const metadata = {
    mainTitle: general ? text(general, 'main_title') : null,
    workTitle: general ? text(general, 'work_title') : null,
    workNumber: general ? text(general, 'work_number') : null,
    authors: general ? general.descendants('author').map((author) => ({
      name: author.text.trim(), type: source(author, 'type')
    })) : [],
    relatedFiles: general ? general.descendants('related_file').map((file) => ({
      url: resolve(required(file, 'file_name')),
      description: source(file, 'description')
    })) : []
  };
  const logicalEvents = all.filter((element) => (element.name === 'chord' || element.name === 'rest')
    && element.ancestors().some((ancestor) => ancestor.name === 'los' && inside(ancestor, 'logic')))
    .map((element) => {
      const duration = element.descendants('duration')[0] ?? null;
      const denominator = duration ? numberAttribute(duration, 'den') : null;
      if (denominator !== null && denominator <= 0) throw new Error('Invalid duration denominator');
      return {
        eventRef: ref(element),
        kind: element.name,
        voice: element.parent?.attribute('voice_item_ref') ?? null,
        duration: duration ? { numerator: numberAttribute(duration, 'num'), denominator } : null,
        pitches: element.descendants((node) => node.name === 'pitch' && node.parent?.name === 'notehead').map((pitch) => ({
          step: required(pitch, 'step'),
          octave: numberAttribute(pitch, 'octave'),
          accidental: source(pitch, 'actual_accidental')
        }))
      };
    });
  const graphicInstances = all.filter((element) => element.name === 'graphic_instance_group' && inside(element, 'notational'))
    .map((group) => ({
      description: source(group, 'description'),
      pages: group.descendants('graphic_instance').filter((page) => {
        const unit = page.attribute('measurement_unit');
        if (unit === null || unit === 'pixels') return true;
        warnings.add(`Unsupported score measurement unit: ${unit}; use pixels for score overlays`);
        return false;
      }).map((page) => ({
        position: numberAttribute(page, 'position_in_group'),
        url: resolve(required(page, 'file_name')),
        events: page.descendants('graphic_event').map((event) => {
          const x1 = numberAttribute(event, 'upper_left_x');
          const y1 = numberAttribute(event, 'upper_left_y');
          const x2 = numberAttribute(event, 'lower_right_x');
          const y2 = numberAttribute(event, 'lower_right_y');
          if (x2 < x1 || y2 < y1) throw new Error('Invalid graphic event rectangle');
          return { eventRef: ref(event), x1, y1, x2, y2 };
        })
      })).sort((a, b) => a.position - b.position)
    })).filter((group) => group.pages.length);
  const audioTracks = all.filter((element) => element.name === 'track' && inside(element, 'audio'))
    .map((track) => ({
      url: resolve(required(track, 'file_name')),
      format: source(track, 'file_format'),
      encoding: source(track, 'encoding_format'),
      events: track.descendants('track_indexing').map((index) => {
        const timing = token(index, 'timing_type');
        if (timing !== 'seconds') {
          warnings.add(`Unsupported track timing type: ${timing}; use seconds for playback`);
          return [];
        }
        return index.descendants('track_event').map((event) => {
          const time = numberAttribute(event, 'start_time');
          if (time < 0) throw new Error('Negative track event time');
          return { eventRef: ref(event), time };
        });
      }).flat()
    }));
  for (const element of all) {
    if (!supported.has(element.name)) warnings.add(`Unsupported XML element: ${element.name}`);
  }
  return { metadata, spine, logicalEvents, graphicInstances, audioTracks, warnings: [...warnings] };
}

/**
 * Parse the player-relevant IEEE 1599 subset. Equivalent to
 * `createPlayerProjection(parseIEEE1599Document(xml, {strict: false, baseURL}))`:
 * DTD validity errors do not throw here; the projection enforces only what the
 * player needs. XML entity declarations are rejected rather than expanded.
 * @param {string} xml IEEE 1599 XML text.
 * @param {{baseURL?: string}} [options] `baseURL` resolves relative file names.
 * @returns {PlayerDocument}
 * @throws {Error} For malformed XML, a non-`ieee1599` root, entity
 *   declarations, and every error of {@link createPlayerProjection}.
 */
export function parseIEEE1599(xml, options = {}) {
  return createPlayerProjection(parseIEEE1599Document(xml, { strict: false, baseURL: options.baseURL }));
}

/**
 * Fetch and parse an IEEE 1599 document, resolving asset URLs against the final
 * response URL, including redirects.
 * @param {string} url Document URL.
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<PlayerDocument>}
 * @throws {Error} HTTP and decoding errors from {@link loadIEEE1599Document},
 *   and any error of {@link parseIEEE1599}.
 */
export async function loadIEEE1599(url, options = {}) {
  return createPlayerProjection(await loadIEEE1599Document(url, { strict: false, signal: options.signal }));
}
