/**
 * Browser-side checks for one IEEE 1599 document of a local corpus. Loaded by
 * `tools/corpus/run.js` in a real browser so parsing, decoding and demuxing
 * use the same native APIs as a web player. Only files referenced by the
 * document are fetched; unreferenced variants next to it are never touched.
 * @module tools/corpus/check
 */
import {
  createBufferedAudioPlayer, createPlayerProjection, createTimeline,
  loadIEEE1599Document, parseIEEE1599Document, serializeIEEE1599Document
} from '../../src/index.js';
import { openMediabunnyInput } from '../../src/adapters/mediabunny.js';

/** @typedef {import('../../src/model/node.js').IEEE1599Element} IEEE1599Element */
/** @typedef {import('../../src/xml/parse.js').PlayerDocument} PlayerDocument */

/**
 * @typedef {object} CorpusFinding
 * @property {'error' | 'warning' | 'info'} severity
 * @property {string} code Stable category, e.g. `missing-file` or `decode-failed`.
 * @property {string} message Human-readable detail.
 * @property {string} [reference] The `file_name` value as written in the document.
 */

/**
 * @typedef {object} CorpusMedia
 * @property {string} element Element holding `file_name`.
 * @property {string} reference Value of `file_name`.
 * @property {string} [url] Resolved URL, when resolvable.
 * @property {'ok' | 'missing' | 'unresolvable' | 'unsupported' | 'failed' | 'remote'} status
 * @property {Record<string, unknown>} [details] Duration, dimensions, codecs...
 */

/**
 * @typedef {object} CorpusDocumentReport
 * @property {string} url Document URL.
 * @property {boolean} strictValid Whether DTD validation passed.
 * @property {number} validationErrors Count of DTD validity errors.
 * @property {boolean} projected Whether the player projection succeeded.
 * @property {{spine: number, tracks: number, pages: number, graphicEvents: number, trackEvents: number}} [counts]
 * @property {CorpusMedia[]} media Every referenced file.
 * @property {CorpusFinding[]} findings
 * @property {number} elapsedMs
 */

/** @typedef {Omit<CorpusFinding, 'reference'>} Finding */

const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|tiff?)$/i;
const BROWSER_IMAGE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const DEMUXABLE = /\.(?:mp4|m4v|m4a|mov)$/i;
const UNSUPPORTED_CONTAINER = /\.(?:avi|wmv|wma|mid|midi|mpg|mpeg|flv|mkv)$/i;
const TOLERANCE_SECONDS = 0.5;
/** Encoded audio above this size is flagged as likely too large to decode whole. */
const LARGE_AUDIO_BYTES = 100e6;

/**
 * Check one document: strict validation, lenient model, player projection,
 * timelines, serializer round trip, and every referenced file.
 * @param {string} url Absolute URL of the document.
 * @param {{decodeAudio?: boolean, decodeVideo?: boolean}} [options]
 * @returns {Promise<CorpusDocumentReport>}
 */
export async function checkDocument(url, options = {}) {
  const started = globalThis.performance.now();
  /** @type {CorpusFinding[]} */
  const findings = [];
  /** @type {CorpusDocumentReport} */
  const report = { url, strictValid: false, validationErrors: 0, projected: false, media: [], findings, elapsedMs: 0 };
  /** @param {CorpusFinding['severity']} severity @param {string} code @param {string} message @param {string} [reference] */
  const add = (severity, code, message, reference) => findings.push({ severity, code, message, ...(reference ? { reference } : {}) });

  let doc;
  try {
    doc = await loadIEEE1599Document(url, { strict: false });
  } catch (error) {
    add('error', 'load-failed', describe(error));
    report.elapsedMs = Math.round(globalThis.performance.now() - started);
    return report;
  }
  const errors = doc.issues.filter((issue) => issue.severity === 'error');
  report.validationErrors = errors.length;
  report.strictValid = errors.length === 0;
  for (const [message, count] of tally(errors.map((issue) => issue.message)).slice(0, 8)) {
    add('warning', 'dtd-invalid', count > 1 ? `${message} (×${count})` : message);
  }

  try {
    const text = serializeIEEE1599Document(doc);
    const again = parseIEEE1599Document(text, { strict: false, baseURL: url });
    const before = doc.root.descendants(() => true).length;
    const after = again.root.descendants(() => true).length;
    if (before !== after) add('error', 'round-trip', `Serializer round trip changed element count ${before} → ${after}`);
  } catch (error) {
    add('error', 'round-trip', `Serializer round trip failed: ${describe(error)}`);
  }

  /** @type {PlayerDocument | null} */
  let player = null;
  try {
    player = createPlayerProjection(doc);
    report.projected = true;
    for (const warning of player.warnings) add('info', 'projection-warning', warning);
  } catch (error) {
    add('error', 'projection-failed', describe(error));
  }
  if (player) {
    const ids = player.spine.map((event) => event.id);
    report.counts = {
      spine: ids.length,
      tracks: player.audioTracks.length,
      pages: player.graphicInstances.reduce((sum, group) => sum + group.pages.length, 0),
      graphicEvents: player.graphicInstances.reduce((sum, group) => sum + group.pages.reduce((n, page) => n + page.events.length, 0), 0),
      trackEvents: player.audioTracks.reduce((sum, track) => sum + track.events.length, 0)
    };
    for (const track of player.audioTracks) {
      if (!track.events.length) continue;
      try {
        createTimeline(ids, track.events);
      } catch (error) {
        add('error', 'timeline-failed', describe(error), track.url);
      }
    }
  }

  const references = doc.root.descendants((node) => node.attribute('file_name') !== null)
    .map((node) => ({ element: node.name, reference: /** @type {string} */ (node.attribute('file_name')), node }));
  /** @type {AudioContext | null} */
  let context = null;
  try {
    for (const { element, reference, node } of references) {
      /** @type {CorpusMedia} */
      const media = { element, reference, status: 'ok' };
      report.media.push(media);
      /** @param {Finding[]} list */
      const addAll = (list) => list.forEach((finding) => add(finding.severity, finding.code, finding.message, reference));
      if (/^[a-z]:[\\/]|^\\\\|^file:/i.test(reference.trim())) {
        media.status = 'unresolvable';
        add('error', 'local-path', 'Absolute local filesystem path cannot be served to a browser', reference);
        continue;
      }
      try {
        media.url = doc.resolveURL(reference);
      } catch (error) {
        media.status = 'unresolvable';
        add('error', 'unresolvable', describe(error), reference);
        continue;
      }
      if (reference.includes('\\')) {
        add('warning', 'backslash-path', 'Backslash separators work only because browsers normalize them in http(s) URLs', reference);
      }
      if (new URL(media.url).origin !== new URL(url).origin) {
        media.status = 'remote';
        add('info', 'remote-reference', 'Remote reference not fetched by the offline corpus run', reference);
        continue;
      }
      if (element === 'graphic_instance' || (element === 'related_file' && IMAGE.test(reference))) {
        const result = await checkImage(media.url);
        Object.assign(media, result.media);
        addAll(result.findings);
        if (element === 'graphic_instance' && media.status === 'ok' && player) addAll(checkBounds(player, media));
      } else if (element === 'track' && node.ancestors().some((ancestor) => ancestor.name === 'audio')) {
        context ??= new AudioContext();
        const result = await checkTrack(media.url, node, player, context, options);
        Object.assign(media, result.media);
        addAll(result.findings);
      } else {
        const response = await probe(media.url);
        media.status = response.ok ? 'ok' : 'missing';
        media.details = { contentType: response.contentType, bytes: response.bytes };
        if (!response.ok) add('error', 'missing-file', `HTTP ${response.status}`, reference);
        else if (response.caseMismatch) add('warning', 'case-mismatch', caseMessage(response.caseMismatch), reference);
      }
    }
  } finally {
    await context?.close();
  }
  report.elapsedMs = Math.round(globalThis.performance.now() - started);
  return report;
}

/** @param {string[]} values @returns {[string, number][]} */
function tally(values) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** @param {string} actual */
function caseMessage(actual) {
  return `On disk as ${actual}; fails on case-sensitive hosts`;
}

/**
 * Existence probe through a one-byte range request.
 * @param {string} url
 */
async function probe(url) {
  const response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  await response.body?.cancel();
  const total = response.headers.get('Content-Range')?.split('/')[1];
  return {
    ok: response.ok, status: response.status,
    contentType: response.headers.get('Content-Type'),
    bytes: total ? Number(total) : Number(response.headers.get('Content-Length')),
    caseMismatch: response.headers.get('X-Case-Mismatch')
  };
}

/**
 * @param {string} url
 * @returns {Promise<{media: Partial<CorpusMedia>, findings: Finding[]}>}
 */
async function checkImage(url) {
  /** @type {Finding[]} */
  const findings = [];
  const response = await fetch(url);
  if (!response.ok) {
    await response.body?.cancel();
    findings.push({ severity: 'error', code: 'missing-file', message: `HTTP ${response.status}` });
    return { media: { status: 'missing' }, findings };
  }
  const caseMismatch = response.headers.get('X-Case-Mismatch');
  if (caseMismatch) findings.push({ severity: 'warning', code: 'case-mismatch', message: caseMessage(caseMismatch) });
  const blob = await response.blob();
  try {
    const bitmap = await createImageBitmap(blob);
    const details = { width: bitmap.width, height: bitmap.height, bytes: blob.size, type: blob.type };
    bitmap.close();
    return { media: { status: 'ok', details }, findings };
  } catch (error) {
    if (!BROWSER_IMAGE.test(new URL(url).pathname)) {
      findings.push({ severity: 'warning', code: 'unsupported-image', message: `Browsers generally cannot display ${blob.type || 'this format'}` });
      return { media: { status: 'unsupported', details: { bytes: blob.size, type: blob.type } }, findings };
    }
    const actual = sniffImage(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
    const hint = actual ? `; the bytes are ${actual}, not the format its extension names` : '';
    findings.push({ severity: 'error', code: 'decode-failed', message: `Image decode failed: ${describe(error)}${hint}` });
    return { media: { status: 'failed', details: { bytes: blob.size, type: blob.type, actual } }, findings };
  }
}

/**
 * Identify an image container from its signature.
 * @param {Uint8Array} bytes First bytes of the file.
 * @returns {string | null} Format name, or `null` when unrecognized.
 */
export function sniffImage(bytes) {
  const starts = (/** @type {number[]} */ ...signature) => signature.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'JPEG';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'PNG';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'GIF';
  if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return 'TIFF';
  if (starts(0x42, 0x4d)) return 'BMP';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'WebP';
  return null;
}

/**
 * Compare graphic event rectangles with the decoded image size.
 * @param {PlayerDocument} player
 * @param {CorpusMedia} media
 * @returns {Finding[]}
 */
function checkBounds(player, media) {
  const page = player.graphicInstances.flatMap((group) => group.pages).find((candidate) => candidate.url === media.url);
  const { width, height } = /** @type {{width: number, height: number}} */ (media.details);
  if (!page?.events.length) return [];
  const outside = page.events.filter((event) => event.x2 > width + 1 || event.y2 > height + 1 || event.x1 < 0 || event.y1 < 0);
  if (!outside.length) return [];
  const maxX = Math.max(...page.events.map((event) => event.x2));
  const maxY = Math.max(...page.events.map((event) => event.y2));
  return [{
    severity: 'warning', code: 'graphic-out-of-bounds',
    message: `${outside.length}/${page.events.length} rectangles exceed the ${width}×${height} image (max ${maxX}×${maxY}); `
      + 'the coordinates may describe another scan resolution'
  }];
}

/**
 * Decode an audio-layer track with the library's buffered loader and, for
 * MP4/QuickTime, demux and decode the first video frame with Mediabunny.
 * @param {string} url
 * @param {IEEE1599Element} node
 * @param {PlayerDocument | null} player
 * @param {AudioContext} context
 * @param {{decodeAudio?: boolean, decodeVideo?: boolean}} options
 * @returns {Promise<{media: Partial<CorpusMedia>, findings: Finding[]}>}
 */
async function checkTrack(url, node, player, context, options) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, unknown>} */
  const details = { format: node.attribute('file_format'), encoding: node.attribute('encoding_format') };
  const head = await probe(url);
  details.bytes = head.bytes;
  details.contentType = head.contentType;
  if (!head.ok) {
    findings.push({ severity: 'error', code: 'missing-file', message: `HTTP ${head.status}` });
    return { media: { status: 'missing', details }, findings };
  }
  if (head.caseMismatch) findings.push({ severity: 'warning', code: 'case-mismatch', message: caseMessage(head.caseMismatch) });
  const path = new URL(url).pathname;
  const track = player?.audioTracks.find((candidate) => candidate.url === url);
  const lastEvent = track?.events.length ? Math.max(...track.events.map((event) => event.time)) : null;
  details.lastEvent = lastEvent;
  if (UNSUPPORTED_CONTAINER.test(path)) {
    findings.push({ severity: 'warning', code: 'unsupported-container', message: 'Container is outside native audio and MP4/QuickTime support; it is not converted' });
    return { media: { status: 'unsupported', details }, findings };
  }
  /** @type {CorpusMedia['status']} */
  let status = 'ok';
  /** @type {number | null} */
  let duration = null;
  const demuxable = DEMUXABLE.test(path);
  if (demuxable && options.decodeVideo !== false) {
    const container = await checkContainer(url);
    Object.assign(details, container.details);
    findings.push(...container.findings);
    if (container.failed) status = 'failed';
    duration = /** @type {number | null} */ (container.details.duration ?? null);
  }
  if (options.decodeAudio !== false && (!demuxable || details.hasAudio)) {
    const audio = createBufferedAudioPlayer({ context });
    try {
      const buffer = await audio.loadAudio(url);
      Object.assign(details, { duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels });
      duration = buffer.duration;
      if (!hasSignal(buffer)) findings.push({ severity: 'warning', code: 'silent-audio', message: 'Decoded audio is entirely silent' });
    } catch (error) {
      status = 'failed';
      const bytes = Number(details.bytes);
      const hint = bytes > LARGE_AUDIO_BYTES
        ? `; the file is ${Math.round(bytes / 1e6)} MB, so full PCM decoding may exceed browser memory (streamed playback is unaffected)`
        : '';
      findings.push({ severity: 'error', code: 'decode-failed', message: `decodeAudioData failed: ${describe(error)}${hint}` });
    } finally {
      await audio.dispose();
    }
  }
  if (duration !== null && lastEvent !== null && lastEvent > duration + TOLERANCE_SECONDS) {
    findings.push({ severity: 'warning', code: 'events-after-end', message: `Last track_event at ${lastEvent.toFixed(2)} s; media ends at ${duration.toFixed(2)} s` });
  }
  return { media: { status, details }, findings };
}

/** @param {AudioBuffer} buffer */
function hasSignal(buffer) {
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    const step = Math.max(1, Math.floor(data.length / 200000));
    for (let index = 0; index < data.length; index += step) if (data[index] !== 0) return true;
  }
  return false;
}

/**
 * @param {string} url
 * @returns {Promise<{failed: boolean, details: Record<string, unknown>, findings: Finding[]}>}
 */
async function checkContainer(url) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, unknown>} */
  const details = {};
  /** @type {Awaited<ReturnType<typeof openMediabunnyInput>> | undefined} */
  let input;
  try {
    const bundle = '/node_modules/mediabunny/dist/bundles/mediabunny.mjs';
    /** @type {any} */
    const mediabunny = await import(/* @vite-ignore */ bundle);
    input = await openMediabunnyInput({ mediabunny, source: url });
    details.mimeType = input.mimeType;
    details.tracks = input.tracks.map((track) => ({ type: track.type, codec: track.codec, canDecode: track.canDecode, duration: track.duration }));
    details.hasAudio = input.tracks.some((track) => track.type === 'audio');
    details.duration = Math.max(0, ...input.tracks.map((track) => track.duration ?? 0)) || null;
    const video = input.tracks.find((track) => track.type === 'video');
    if (video && !video.canDecode) {
      findings.push({ severity: 'warning', code: 'video-codec-unsupported', message: `This browser cannot decode ${video.codec ?? 'unknown'} video with WebCodecs` });
    } else if (video) {
      const sink = new mediabunny.VideoSampleSink(video.sourceTrack);
      const sample = await sink.getSample(await /** @type {any} */ (video.sourceTrack).getFirstTimestamp());
      if (!sample) {
        findings.push({ severity: 'error', code: 'video-no-frame', message: 'No decodable video frame at the first timestamp' });
        return { failed: true, details, findings };
      }
      details.videoSize = `${sample.displayWidth}×${sample.displayHeight}`;
      sample.close();
    }
    return { failed: false, details, findings };
  } catch (error) {
    findings.push({ severity: 'error', code: 'demux-failed', message: `Mediabunny demux failed: ${describe(error)}` });
    return { failed: true, details, findings };
  } finally {
    input?.dispose();
  }
}
