/** @typedef {'debug' | 'info' | 'warn' | 'error'} Level */
/** @typedef {{level: Level, subsystem: string, message: string, timestamp: number}} DiagnosticRecord */

/**
 * Create a bounded, per-player diagnostic log.
 * Callers should not include XML, media data, or sensitive URL query strings.
 * @param {{capacity?: number, verbose?: boolean, console?: boolean}} [options]
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
