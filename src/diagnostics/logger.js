/**
 * Per-player structured diagnostics with bounded retention and an optional
 * console sink. There is no global logger.
 * @module ieee1599/diagnostics/logger
 */

/** @typedef {'debug' | 'info' | 'warn' | 'error'} Level */

/**
 * One retained diagnostic entry.
 * @typedef {object} DiagnosticRecord
 * @property {Level} level Severity.
 * @property {string} subsystem Emitting area, e.g. `audio`.
 * @property {string} message Human-readable text without media data.
 * @property {number} timestamp `Date.now()` milliseconds when logged.
 */

/**
 * Diagnostic log returned by {@link createLogger}.
 * @typedef {object} Logger
 * @property {(level: Level, subsystem: string, message: string) => void} log
 *   Record an entry. `debug`/`info` are dropped unless `verbose`. Throws
 *   `Invalid diagnostic level` for unknown levels.
 * @property {() => DiagnosticRecord[]} snapshot Copies of retained entries, oldest first.
 * @property {() => void} clear Remove all retained entries.
 */

/**
 * Create a bounded, per-player diagnostic log.
 * Callers should not include XML, media data, or sensitive URL query strings.
 * @param {object} [options]
 * @param {number} [options.capacity=200] Retained entries (oldest dropped first); `0` retains none.
 * @param {boolean} [options.verbose=false] Also record `debug` and `info`.
 * @param {boolean} [options.console=true] Mirror recorded entries to the browser console.
 * @returns {Logger}
 * @throws {Error} `Invalid diagnostic capacity` for a negative or non-integer capacity.
 *
 * @example
 * const logger = createLogger({ verbose: true });
 * logger.log('warn', 'audio', 'Decoding took 2.1 s');
 * logger.snapshot(); // [{ level: 'warn', subsystem: 'audio', ... }]
 */
export function createLogger(options = {}) {
  const capacity = options.capacity ?? 200;
  if (!Number.isInteger(capacity) || capacity < 0) throw new Error('Invalid diagnostic capacity');
  const verbose = options.verbose ?? false;
  const useConsole = options.console ?? true;
  /** @type {DiagnosticRecord[]} */
  const records = [];
  return {
    /**
     * @param {Level} level
     * @param {string} subsystem
     * @param {string} message
     */
    log(level, subsystem, message) {
      if (!['debug', 'info', 'warn', 'error'].includes(level)) throw new Error('Invalid diagnostic level');
      if (!verbose && (level === 'debug' || level === 'info')) return;
      const record = { level, subsystem, message, timestamp: Date.now() };
      if (capacity > 0) {
        if (records.length === capacity) records.shift();
        records.push(record);
      }
      if (useConsole) console[level](`[${subsystem}] ${message}`);
    },
    /** @returns {DiagnosticRecord[]} */
    snapshot() {
      return records.map((record) => ({ ...record }));
    },
    clear() {
      records.length = 0;
    }
  };
}
