/**
 * Typed boundary records for content declared by vocabularies that the IEEE
 * 1599 DTD imports (SVG 1.1 through `%svg;`, MIDIEvents 1.0 through
 * `%mididtd;`).
 *
 * The user chose to model only the IEEE 1599 declarations and to represent
 * imported content as **opaque typed subtrees**. Every imported subtree is
 * therefore kept losslessly as {@link ieee1599/model/node!IEEE1599Element} nodes whose
 * `vocabulary` is `svg` or `midi`, and each subtree root is described by an
 * {@link IEEE1599Import} record. The record states which vocabulary, DTD
 * parameter entity and entry point allowed the content and which IEEE
 * element hosts it. The internal element and attribute vocabulary of SVG
 * 1.1 and MIDIEvents 1.0 is not enumerated, typed per element or validated.
 * @module ieee1599/model/imports
 */
import { IEEE1599_SCHEMA } from '../schema/ieee1599-schema.js';

/**
 * Vocabulary of imported content.
 * @typedef {'svg' | 'midi'} IEEE1599ImportedVocabulary
 */

/**
 * Element node that belongs to an imported vocabulary. It has the same
 * traversal API as any {@link ieee1599/model/node!IEEE1599Element}; `declaration` is always
 * `null` because imported declarations are not expanded.
 * @typedef {import('./node.js').IEEE1599Element & { vocabulary: IEEE1599ImportedVocabulary }} IEEE1599ImportedElement
 */

/**
 * Description of one imported subtree, i.e. an imported element whose parent
 * is an IEEE 1599 element.
 * @typedef {object} IEEE1599Import
 * @property {IEEE1599ImportedVocabulary} vocabulary Imported vocabulary.
 * @property {IEEE1599ImportedElement} element Root element of the subtree
 *   (for example `<svg>` inside `<slur>`, or `<NoteOn>` inside `<midi_event>`).
 * @property {import('./node.js').IEEE1599Element} host IEEE 1599 element
 *   that contains the subtree.
 * @property {string} entryPoint Name in the host content model that admits
 *   the subtree: an imported element name (`svg`, `font`, `SysEx`) or a
 *   parameter-entity reference (`%MIDIChannelMessage;`).
 * @property {string} entity IEEE DTD parameter entity that imports the
 *   vocabulary (`svg` or `mididtd`).
 * @property {string} title Human-readable vocabulary name (`SVG 1.1`, `MIDIEvents 1.0`).
 * @property {string | null} publicId Public identifier of the imported DTD.
 * @property {string | null} systemId System identifier of the imported DTD. Never fetched.
 * @property {string | null} expectedNamespace Namespace URI the vocabulary
 *   defines (`http://www.w3.org/2000/svg` for SVG; `null` for MIDIEvents).
 *   Compare with `element.namespaceURI` to detect a missing `xmlns`.
 */

/**
 * Entry points by which imported content may enter IEEE 1599 content, with
 * the IEEE elements that allow each one. Derived from the generated schema so
 * it always matches the vendored DTD.
 * @type {ReadonlyArray<{entryPoint: string, vocabulary: IEEE1599ImportedVocabulary, hosts: readonly string[]}>}
 */
export const IMPORT_ENTRY_POINTS = Object.freeze(Object.entries(IEEE1599_SCHEMA.importedNames).map(([entryPoint, use]) => Object.freeze({
  entryPoint,
  vocabulary: /** @type {IEEE1599ImportedVocabulary} */ (use.vocabulary),
  hosts: Object.freeze([...use.usedBy])
})));

/**
 * Whether an element belongs to an imported vocabulary.
 * @param {import('./node.js').IEEE1599Element} element
 * @returns {element is IEEE1599ImportedElement}
 */
export function isImportedElement(element) {
  return element.vocabulary === 'svg' || element.vocabulary === 'midi';
}

/**
 * Describe an imported subtree root. Returns `null` when `element` is not
 * imported or is nested inside another imported element (only roots whose
 * parent is an IEEE 1599 element are boundaries).
 *
 * @param {import('./node.js').IEEE1599Element} element Candidate subtree root.
 * @returns {IEEE1599Import | null}
 *
 * @example
 * const svg = doc.notational?.descendants('svg')[0];
 * describeImport(svg)?.host.name; // 'slur'
 */
export function describeImport(element) {
  const host = element.parent;
  if (!isImportedElement(element) || !host || host.vocabulary !== 'ieee1599') return null;
  const direct = IMPORT_ENTRY_POINTS.find((entry) => entry.entryPoint === element.name
    && entry.vocabulary === element.vocabulary && entry.hosts.includes(host.name));
  const entry = direct ?? IMPORT_ENTRY_POINTS.find((item) => item.entryPoint.startsWith('%')
    && item.vocabulary === element.vocabulary && item.hosts.includes(host.name));
  const source = IEEE1599_SCHEMA.imports.find((item) => item.vocabulary === element.vocabulary);
  if (!entry || !source) return null;
  return Object.freeze({
    vocabulary: element.vocabulary,
    element,
    host,
    entryPoint: entry.entryPoint,
    entity: source.entity,
    title: source.title ?? source.entity,
    publicId: source.publicId ?? null,
    systemId: source.systemId ?? null,
    expectedNamespace: source.namespace ?? null
  });
}
