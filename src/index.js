/**
 * Public entry point of the IEEE 1599 JavaScript library.
 *
 * - Data model: {@link ieee1599/model/document!parseIEEE1599Document},
 *   {@link ieee1599/model/document!loadIEEE1599Document},
 *   {@link ieee1599/model/document!serializeIEEE1599Document} and the generated
 *   {@link ieee1599/schema!IEEE1599_SCHEMA}.
 * - Player projection: {@link ieee1599/xml/parse!parseIEEE1599},
 *   {@link ieee1599/xml/parse!loadIEEE1599}.
 * - Playback core: timeline, buffered Web Audio player and diagnostics.
 *
 * Optional UI modules (`src/ui/*.js`) are not re-exported so that headless
 * applications never load presentation code.
 * @module ieee1599
 */
export { IEEE1599Document, loadIEEE1599Document, parseIEEE1599Document, serializeIEEE1599Document } from './model/document.js';
export { IEEE1599Element } from './model/node.js';
export { describeImport, IMPORT_ENTRY_POINTS, isImportedElement } from './model/imports.js';
export { LOS } from './model/los.js';
export { Spine } from './model/spine.js';
export { IEEE1599ValidationError } from './model/validate.js';
export { IEEE1599_SCHEMA } from './schema/ieee1599-schema.js';
export { createPlayerProjection, loadIEEE1599, parseIEEE1599 } from './xml/parse.js';
export { createTimeline } from './core/timeline.js';
export { BufferedAudioPlayer, createBufferedAudioPlayer } from './media/buffered-audio.js';
export { createLogger } from './diagnostics/logger.js';
