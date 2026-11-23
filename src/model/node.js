/**
 * Node types of the lossless IEEE 1599 document model.
 *
 * Elements keep their exact XML names, ordered children (including text,
 * CDATA, comments and processing instructions), effective attribute values
 * (DTD defaults applied and normalized as a validating XML processor reports
 * them) and the raw source attributes used for serialization.
 * @module ieee1599/model/node
 */
import { IEEE1599_SCHEMA } from '../schema/ieee1599-schema.js';

/**
 * Vocabulary an element belongs to. `svg` and `midi` subtrees are imported
 * content kept as opaque generic nodes; `unknown` marks elements not declared
 * by the IEEE 1599 DTD nor allowed as imports at their position.
 * @typedef {'ieee1599' | 'svg' | 'midi' | 'unknown'} IEEE1599Vocabulary
 */

/**
 * Character data.
 * @typedef {object} IEEE1599Text
 * @property {'text'} type
 * @property {string} value Text exactly as parsed (entity and character references resolved).
 */

/**
 * CDATA section.
 * @typedef {object} IEEE1599CData
 * @property {'cdata'} type
 * @property {string} value Section content.
 */

/**
 * XML comment.
 * @typedef {object} IEEE1599Comment
 * @property {'comment'} type
 * @property {string} value Comment text without delimiters.
 */

/**
 * Processing instruction.
 * @typedef {object} IEEE1599ProcessingInstruction
 * @property {'processing-instruction'} type
 * @property {string} target PI target.
 * @property {string} data PI data.
 */

/**
 * Any child node of an element.
 * @typedef {IEEE1599Element | IEEE1599Text | IEEE1599CData | IEEE1599Comment | IEEE1599ProcessingInstruction} IEEE1599Node
 */

/**
 * Element node. Instances are created by `parseIEEE1599Document()`; treat them
 * as read-only. Generated typedefs such as
 * `import('../schema/ieee1599-types.js').IEEE1599ChordElement` narrow `name`
 * and `attributes` for individual elements.
 *
 * @example
 * const chord = doc.byId('c1');
 * chord?.attributes.event_ref;      // 'e1'
 * chord?.isSpecified('beam_before'); // false when the DTD default "no" applies
 */
export class IEEE1599Element {
  /** Node discriminator. @type {'element'} */
  type = 'element';

  /**
   * @param {object} init
   * @param {string} init.name Qualified element name as written in the source.
   * @param {string | null} init.namespaceURI Namespace URI reported by the XML parser.
   * @param {IEEE1599Vocabulary} init.vocabulary Owning vocabulary.
   * @param {Array<[string, string]>} init.rawAttributes Source attributes in source order.
   * @param {Record<string, string>} init.attributes Effective attribute values.
   * @param {IEEE1599Element | null} init.parent Parent element, `null` for the root.
   */
  constructor({ name, namespaceURI, vocabulary, rawAttributes, attributes, parent }) {
    /** Qualified element name, identical to the DTD name for IEEE elements. @type {string} */
    this.name = name;
    /** Namespace URI from the parser (normally `null` for IEEE elements). @type {string | null} */
    this.namespaceURI = namespaceURI;
    /** Vocabulary of this element. @type {IEEE1599Vocabulary} */
    this.vocabulary = vocabulary;
    /**
     * Source attributes in source order, with values as parsed and before DTD
     * normalization. Used by the serializer.
     * @type {ReadonlyArray<readonly [string, string]>}
     */
    this.rawAttributes = rawAttributes;
    /**
     * Effective attribute values: specified values (whitespace-normalized for
     * tokenized DTD types) plus declared defaults for absent attributes.
     * @type {Record<string, string>}
     */
    this.attributes = attributes;
    /** Ordered children. @type {IEEE1599Node[]} */
    this.children = [];
    /** Parent element or `null` for the document element. @type {IEEE1599Element | null} */
    this.parent = parent;
  }

  /**
   * Whether an attribute was written in the source, as opposed to absent or
   * supplied by a DTD default.
   * @param {string} name Attribute name.
   * @returns {boolean}
   */
  isSpecified(name) {
    return this.rawAttributes.some(([attribute]) => attribute === name);
  }

  /**
   * Effective value of an attribute, or `null` when absent without default.
   * @param {string} name Attribute name.
   * @returns {string | null}
   */
  attribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  /**
   * Child elements, optionally filtered by name.
   * @param {string} [name] Element name to keep.
   * @returns {IEEE1599Element[]}
   */
  elements(name) {
    const result = [];
    for (const child of this.children) {
      if (child.type === 'element' && (name === undefined || child.name === name)) result.push(child);
    }
    return result;
  }

  /**
   * First child element with the given name.
   * @param {string} name Element name.
   * @returns {IEEE1599Element | null}
   */
  element(name) {
    for (const child of this.children) if (child.type === 'element' && child.name === name) return child;
    return null;
  }

  /**
   * Descendant elements in document order (excluding this element).
   * @param {string | string[] | ((element: IEEE1599Element) => boolean)} [filter]
   *   Name, list of names or predicate.
   * @returns {IEEE1599Element[]}
   */
  descendants(filter) {
    const test = typeof filter === 'function' ? filter
      : filter === undefined ? () => true
        : Array.isArray(filter) ? (/** @type {IEEE1599Element} */ element) => filter.includes(element.name)
          : (/** @type {IEEE1599Element} */ element) => element.name === filter;
    /** @type {IEEE1599Element[]} */
    const result = [];
    /** @type {IEEE1599Element[]} */
    const stack = this.elements().reverse();
    while (stack.length) {
      const element = /** @type {IEEE1599Element} */ (stack.pop());
      if (test(element)) result.push(element);
      for (let index = element.children.length - 1; index >= 0; index -= 1) {
        const child = element.children[index];
        if (child.type === 'element') stack.push(child);
      }
    }
    return result;
  }

  /**
   * Ancestors from the parent up to the document element.
   * @returns {IEEE1599Element[]}
   */
  ancestors() {
    const result = [];
    for (let node = this.parent; node; node = node.parent) result.push(node);
    return result;
  }

  /**
   * Nearest ancestor (or self) with the given name.
   * @param {string} name Element name.
   * @returns {IEEE1599Element | null}
   */
  closest(name) {
    for (let node = /** @type {IEEE1599Element | null} */ (this); node; node = node.parent) {
      if (node.name === name) return node;
    }
    return null;
  }

  /**
   * Concatenated text and CDATA content of this element and its descendants.
   * @returns {string}
   */
  get text() {
    let value = '';
    for (const child of this.children) {
      if (child.type === 'text' || child.type === 'cdata') value += child.value;
      else if (child.type === 'element') value += child.text;
    }
    return value;
  }

  /**
   * Location path such as `/ieee1599[1]/logic[1]/spine[1]/event[3]`.
   * @returns {string}
   */
  get path() {
    if (!this.parent) return `/${this.name}[1]`;
    let position = 0;
    for (const sibling of this.parent.children) {
      if (sibling.type === 'element' && sibling.name === this.name) position += 1;
      if (sibling === this) break;
    }
    return `${this.parent.path}/${this.name}[${position}]`;
  }

  /**
   * Schema declaration for IEEE elements, `null` for imported or unknown ones.
   * @returns {import('../schema/ieee1599-schema.js').SchemaElement | null}
   */
  get declaration() {
    return this.vocabulary === 'ieee1599' ? IEEE1599_SCHEMA.elements[this.name] ?? null : null;
  }

  /**
   * IEEE 1599 layer containing this element (`general`, `logic`,
   * `structural`, `notational`, `performance`, `audio`), or `null` for the
   * root element.
   * @returns {'general' | 'logic' | 'structural' | 'notational' | 'performance' | 'audio' | null}
   */
  get layer() {
    for (let node = /** @type {IEEE1599Element | null} */ (this); node; node = node.parent) {
      if (node.parent && !node.parent.parent && node.vocabulary === 'ieee1599') {
        const layer = IEEE1599_SCHEMA.layers.find((name) => name === node?.name);
        return layer ?? null;
      }
    }
    return null;
  }
}
