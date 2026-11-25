/**
 * Content-model matching for DTD element declarations.
 *
 * Children content models are compiled into a Thompson NFA and simulated over
 * the sequence of child elements, giving linear-time validation even for very
 * long `(event)+` spines and precise "expected ..." diagnostics.
 * @module ieee1599/model/content-model
 */

/**
 * A child element symbol presented to the matcher.
 * @typedef {object} ContentSymbol
 * @property {string} name Element name.
 * @property {string} vocabulary Vocabulary of the child element.
 */

/**
 * @typedef {object} NfaState
 * @property {NfaState[]} epsilon Epsilon transitions.
 * @property {{test: (symbol: ContentSymbol) => boolean, label: string, to: NfaState} | null} edge Symbol transition.
 */

/**
 * Result of matching a child sequence.
 * @typedef {object} ContentMatch
 * @property {boolean} valid Whether the full sequence matches.
 * @property {number} failedAt Index of the first child that cannot be accepted,
 *   or the sequence length when more children were required; `-1` when valid.
 * @property {string[]} expected Labels acceptable at the failure point
 *   (`#end` when the content may end there).
 */

/** @returns {NfaState} */
const state = () => ({ epsilon: [], edge: null });

/**
 * Compile a children content particle to an NFA fragment.
 * @param {import('../schema/ieee1599-schema.js').SchemaParticle} particle
 * @returns {{start: NfaState, end: NfaState}}
 */
function compile(particle) {
  /** @type {{start: NfaState, end: NfaState}} */
  let fragment;
  if (particle.kind === 'name' || particle.kind === 'import') {
    const start = state();
    const end = state();
    const vocabulary = particle.kind === 'import' ? particle.vocabulary : null;
    const name = particle.kind === 'name' ? particle.name : null;
    start.edge = particle.kind === 'name'
      ? { test: (symbol) => symbol.name === name, label: /** @type {string} */ (name), to: end }
      : { test: (symbol) => symbol.vocabulary === vocabulary, label: `%${particle.entity};`, to: end };
    fragment = { start, end };
  } else if (particle.kind === 'seq') {
    const parts = particle.items.map(compile);
    for (let index = 0; index < parts.length - 1; index += 1) parts[index].end.epsilon.push(parts[index + 1].start);
    fragment = { start: parts[0].start, end: parts[parts.length - 1].end };
  } else {
    const start = state();
    const end = state();
    for (const part of particle.items.map(compile)) {
      start.epsilon.push(part.start);
      part.end.epsilon.push(end);
    }
    fragment = { start, end };
  }
  const { occurrence } = particle;
  if (!occurrence) return fragment;
  const start = state();
  const end = state();
  start.epsilon.push(fragment.start);
  fragment.end.epsilon.push(end);
  if (occurrence === '?' || occurrence === '*') start.epsilon.push(end);
  if (occurrence === '+' || occurrence === '*') fragment.end.epsilon.push(fragment.start);
  return { start, end };
}

/**
 * @param {Iterable<NfaState>} states
 * @returns {Set<NfaState>}
 */
function closure(states) {
  const result = new Set(states);
  const stack = [...result];
  while (stack.length) {
    for (const next of /** @type {NfaState} */ (stack.pop()).epsilon) {
      if (!result.has(next)) { result.add(next); stack.push(next); }
    }
  }
  return result;
}

/**
 * Compiled matcher for one element's children content model.
 */
export class ContentMatcher {
  /** @type {NfaState} */ #start;
  /** @type {NfaState} */ #accept;

  /** @param {import('../schema/ieee1599-schema.js').SchemaParticle} particle */
  constructor(particle) {
    const { start, end } = compile(particle);
    this.#start = start;
    this.#accept = end;
  }

  /**
   * Match a sequence of child element symbols.
   * @param {ContentSymbol[]} symbols Child elements in document order.
   * @returns {ContentMatch}
   */
  match(symbols) {
    let current = closure([this.#start]);
    for (let index = 0; index < symbols.length; index += 1) {
      const next = [];
      for (const item of current) if (item.edge?.test(symbols[index])) next.push(item.edge.to);
      if (!next.length) return { valid: false, failedAt: index, expected: this.#expected(current) };
      current = closure(next);
    }
    if (current.has(this.#accept)) return { valid: true, failedAt: -1, expected: [] };
    return { valid: false, failedAt: symbols.length, expected: this.#expected(current) };
  }

  /** @param {Set<NfaState>} states */
  #expected(states) {
    const labels = new Set();
    for (const item of states) if (item.edge) labels.add(item.edge.label);
    if (states.has(this.#accept)) labels.add('#end');
    return [...labels];
  }
}

/** @type {Map<object, ContentMatcher>} */
const cache = new Map();

/**
 * Get a cached matcher for a particle.
 * @param {import('../schema/ieee1599-schema.js').SchemaParticle} particle
 * @returns {ContentMatcher}
 */
export function matcherFor(particle) {
  let matcher = cache.get(particle);
  if (!matcher) {
    matcher = new ContentMatcher(particle);
    cache.set(particle, matcher);
  }
  return matcher;
}
