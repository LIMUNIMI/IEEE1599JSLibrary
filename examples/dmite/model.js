/**
 * DmITE-specific instrument catalogue and note navigation. This format
 * belongs to the example, not to IEEE 1599 or the player API.
 * @module examples/dmite/model
 */
import { createTimeline } from '../../src/index.js';

/** @typedef {import('../../src/xml/parse.js').PlayerDocument['audioTracks'][number]} Track */
/** @typedef {{degrees: number, track: Track}} Angle */
/** @typedef {{label: string, angles: Angle[]}} Instrument */

/**
 * Match the legacy params.xml angle entries to recordings indexed by IEEE 1599.
 * Only angles with nonempty time mappings are offered; paths retain their case.
 * @param {string} xml Contents of params.xml.
 * @param {string} documentURL Virtual URL of the score XML.
 * @param {Track[]} tracks Projected audio files.
 * @returns {Instrument[]}
 * @throws {Error} Malformed configuration, duplicate angles or no indexed recordings.
 */
export function instrumentCatalogue(xml, documentURL, tracks) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('params.xml cannot contain a DOCTYPE or entity declaration');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.documentElement.localName !== 'params' || doc.querySelector('parsererror')) {
    throw new Error('Invalid DmITE params.xml');
  }
  const indexed = new Map(tracks.filter((track) => track.events.length).map((track) => [track.url, track]));
  const instruments = Array.from(doc.querySelectorAll('params > instruments > instrument')).map((node) => {
    const name = segment(node, 'name');
    const prefix = segment(node, 'track_prefix');
    const label = node.getAttribute('display_name')?.trim() || name;
    const seen = new Set();
    /** @type {Angle[]} */
    const angles = [];
    for (const nodeAngle of Array.from(node.querySelectorAll(':scope > angle'))) {
      const value = nodeAngle.getAttribute('value');
      const degrees = Number(value);
      if (!value?.trim() || !Number.isInteger(degrees) || degrees < 0 || degrees >= 360 || seen.has(degrees)) {
        throw new Error(`Invalid or duplicate angle for ${label}`);
      }
      seen.add(degrees);
      const suffix = segment(nodeAngle, 'track_suffix');
      const path = `audio_files/${encodeURIComponent(name)}/${encodeURIComponent(`${prefix}_${suffix}.wav`)}`;
      const track = indexed.get(new URL(path, documentURL).href);
      if (track) angles.push({ degrees, track });
    }
    return { label, angles: angles.sort((a, b) => a.degrees - b.degrees) };
  }).filter((instrument) => instrument.angles.length);
  if (!instruments.length) throw new Error('No recordings in params.xml match the IEEE 1599 track index');
  return instruments;
}

/**
 * Read a required filename component rather than allowing configuration
 * entries to supply a path.
 * @param {Element} node
 * @param {string} attribute
 * @returns {string}
 */
function segment(node, attribute) {
  const value = node.getAttribute(attribute);
  if (!value?.trim() || /[/\\]/.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid ${attribute} in params.xml`);
  }
  return value;
}

/**
 * Use the library's timeline for score navigation. One Note uses the next
 * distinct timestamp, or the recording's end for the final event.
 * @param {string[]} spine Spine IDs in document order.
 * @param {Track} track Selected recording.
 */
export function recordingTimeline(spine, track) {
  const timeline = createTimeline(spine, track.events);
  const times = [...new Set(track.events.map(({ time }) => time))].sort((a, b) => a - b);
  return {
    ...timeline,
    /** First mapped playback time in seconds. */
    firstTime: times[0],
    /** @param {number} time @param {number} duration @returns {number} Next boundary in media seconds. */
    nextBoundary(time, duration) {
      return Math.min(times.find((value) => value > time) ?? duration, duration);
    }
  };
}
