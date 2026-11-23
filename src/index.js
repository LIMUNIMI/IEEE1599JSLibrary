/**
 * Public entry point of the IEEE 1599 JavaScript library.
 *
 * - Data model: {@link parseIEEE1599Document}, {@link loadIEEE1599Document},
 *   {@link serializeIEEE1599Document} and the generated {@link IEEE1599_SCHEMA}.
 * - Player projection: {@link parseIEEE1599}, {@link loadIEEE1599}.
 * - Playback core: timeline, buffered Web Audio player and diagnostics.
 *
 * Optional UI modules (`src/ui/*.js`) are not re-exported so that headless
 * applications never load presentation code.
 * @module ieee1599
 */
export { IEEE1599Document, loadIEEE1599Document, parseIEEE1599Document, serializeIEEE1599Document } from './model/document.js';
export { IEEE1599Element } from './model/node.js';
export { LOS } from './model/los.js';
export { Spine } from './model/spine.js';
export { IEEE1599ValidationError } from './model/validate.js';
export { IEEE1599_SCHEMA } from './schema/ieee1599-schema.js';
export { loadIEEE1599, parseIEEE1599 } from './xml/parse.js';
export { createTimeline } from './core/timeline.js';
export { BufferedAudioPlayer, createBufferedAudioPlayer } from './media/buffered-audio.js';
export { createLogger } from './diagnostics/logger.js';
