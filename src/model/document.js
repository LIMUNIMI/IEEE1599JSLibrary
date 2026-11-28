/**
 * Lossless, schema-driven IEEE 1599 document model.
 *
 * `parseIEEE1599Document()` converts XML into a tree of
 * {@link IEEE1599Element} nodes that keeps every element, attribute, text,
 * CDATA section, comment and processing instruction, validates it against the
 * vendored IEEE 1599 DTD 1.0 (strict by default), and exposes the six layers,
 * a first-class Spine and LOS, and ID/reference indexes.
 * `serializeIEEE1599Document()` writes the tree back as XML.
 *
 * Validation scope: the browser `DOMParser` checks well-formedness only. The
 * DTD constraints are checked by this module against the generated inventory
 * in `src/schema/ieee1599-schema.js`. Imported SVG and MIDI subtrees are kept
  * as opaque typed subtrees (`doc.imports()`, `doc.importedById()`) and are not
  * validated. External DTDs are never fetched and entity
 * declarations are rejected.
 * @module ieee1599/model/document
 */
import { IEEE1599_SCHEMA } from '../schema/ieee1599-schema.js';
import { describeImport, isImportedElement } from './imports.js';
import { LOS } from './los.js';
import { IEEE1599Element } from './node.js';
import { Spine } from './spine.js';
import { effectiveAttributes, IEEE1599ValidationError, validateTree, vocabularyOf } from './validate.js';

/**
 * Document type declaration as written in the source.
 * @typedef {object} IEEE1599Doctype
 * @property {string} name Declared root name.
 * @property {string | null} publicId Public identifier.
 * @property {string | null} systemId System identifier (DTD URL). Never fetched.
 * @property {string | null} internalSubset Raw internal subset text, without brackets.
 * @property {string} source Exact declaration text, reused by the serializer.
 * @property {number} [prologIndex] Number of prolog nodes before the declaration.
 */

/**
 * Options for {@link parseIEEE1599Document}.
 * @typedef {object} ParseDocumentOptions
 * @property {boolean} [strict=true] Throw {@link ieee1599/model/validate!IEEE1599ValidationError} when
 *   any DTD validity error is found. With `false` the document is returned and
 *   all findings are listed in `doc.issues`.
 * @property {string} [baseURL] Absolute URL used by `doc.resolveURL()` for
 *   relative file references (normally the document URL).
 */

/**
 * A reference from an IDREF/IDREFS attribute.
 * @typedef {object} IEEE1599Reference
 * @property {import('./node.js').IEEE1599Element} element Referring element.
 * @property {string} attribute Referring attribute name.
 */

/** @typedef {'general' | 'logic' | 'structural' | 'notational' | 'performance' | 'audio'} IEEE1599LayerName */

/**
 * Parsed IEEE 1599 document. Create with {@link parseIEEE1599Document} or
 * {@link loadIEEE1599Document}.
 *
 * @example
 * const doc = parseIEEE1599Document(xml, { baseURL: location.href });
 * doc.general?.element('description')?.element('main_title')?.text;
 * for (const event of doc.spine) console.log(event.id, event.vtu);
 * doc.eventLinks('e1').audio; // track_event elements mapped to e1
 */
export class IEEE1599Document {
  /** @type {Map<string, IEEE1599Reference[]>} */ #references = new Map();
  /** @type {import('./imports.js').IEEE1599Import[]} */ #imports = [];
  /** @type {Map<string, import('./imports.js').IEEE1599ImportedElement[]>} */ #importedIds = new Map();
  /** @type {Spine | null} */ #spine = null;
  /** @type {LOS | null} */ #los = null;

  /**
   * @param {object} init
   * @param {import('./node.js').IEEE1599Element} init.root
   * @param {IEEE1599Doctype | null} init.doctype
   * @param {string | null} init.xmlDeclaration
   * @param {(import('./node.js').IEEE1599Comment | import('./node.js').IEEE1599ProcessingInstruction)[]} init.prolog
   * @param {(import('./node.js').IEEE1599Comment | import('./node.js').IEEE1599ProcessingInstruction)[]} init.epilog
   * @param {import('./validate.js').IEEE1599Issue[]} init.issues
   * @param {Map<string, import('./node.js').IEEE1599Element>} init.ids
   * @param {string | null} init.baseURL
   */
  constructor({ root, doctype, xmlDeclaration, prolog, epilog, issues, ids, baseURL }) {
    /** Document element (`ieee1599`). @type {import('./node.js').IEEE1599Element} */
    this.root = root;
    /** DOCTYPE declaration, or `null`. @type {IEEE1599Doctype | null} */
    this.doctype = doctype;
    /** XML declaration text (e.g. `<?xml version="1.0"?>`), or `null`. @type {string | null} */
    this.xmlDeclaration = xmlDeclaration;
    /** Comments and processing instructions before the root. @type {ReadonlyArray<import('./node.js').IEEE1599Comment | import('./node.js').IEEE1599ProcessingInstruction>} */
    this.prolog = prolog;
    /** Comments and processing instructions after the root. @type {ReadonlyArray<import('./node.js').IEEE1599Comment | import('./node.js').IEEE1599ProcessingInstruction>} */
    this.epilog = epilog;
    /** Validation errors (only in lenient mode) and warnings. @type {ReadonlyArray<import('./validate.js').IEEE1599Issue>} */
    this.issues = Object.freeze(issues);
    /** Schema inventory the document was validated against. */
    this.schema = IEEE1599_SCHEMA;
    /** Base URL for relative references, or `null`. @type {string | null} */
    this.baseURL = baseURL;
    /** Elements by ID-typed attribute value (first occurrence wins). @type {ReadonlyMap<string, import('./node.js').IEEE1599Element>} */
    this.ids = ids;
    for (const element of [root, ...root.descendants()]) {
      if (isImportedElement(element)) {
        const boundary = describeImport(element);
        if (boundary) this.#imports.push(boundary);
        const id = element.attribute('id');
        if (id !== null) {
          const list = this.#importedIds.get(id);
          if (list) list.push(element);
          else this.#importedIds.set(id, [element]);
        }
        continue;
      }
      const declaration = element.declaration;
      if (!declaration) continue;
      for (const [name, attribute] of Object.entries(declaration.attributes)) {
        if (attribute.type !== 'IDREF' && attribute.type !== 'IDREFS') continue;
        const value = element.attribute(name);
        if (value === null) continue;
        for (const id of attribute.type === 'IDREFS' ? value.split(' ') : [value]) {
          const list = this.#references.get(id);
          if (list) list.push({ element, attribute: name });
          else this.#references.set(id, [{ element, attribute: name }]);
        }
      }
    }
  }

  /** `general` layer element. @returns {import('./node.js').IEEE1599Element | null} */
  get general() { return this.root.element('general'); }
  /** `logic` layer element. @returns {import('./node.js').IEEE1599Element | null} */
  get logic() { return this.root.element('logic'); }
  /** `structural` layer element, or `null` when absent. @returns {import('./node.js').IEEE1599Element | null} */
  get structural() { return this.root.element('structural'); }
  /** `notational` layer element, or `null` when absent. @returns {import('./node.js').IEEE1599Element | null} */
  get notational() { return this.root.element('notational'); }
  /** `performance` layer element, or `null` when absent. @returns {import('./node.js').IEEE1599Element | null} */
  get performance() { return this.root.element('performance'); }
  /** `audio` layer element, or `null` when absent. @returns {import('./node.js').IEEE1599Element | null} */
  get audio() { return this.root.element('audio'); }

  /**
   * Layer element by name.
   * @param {IEEE1599LayerName} name Layer name.
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  layer(name) {
    return this.root.element(name);
  }

  /** Indexed Spine of the Logic layer. @returns {Spine} */
  get spine() {
    this.#spine ??= new Spine(this.logic?.element('spine') ?? null);
    return this.#spine;
  }

  /** Indexed LOS of the Logic layer. @returns {LOS} */
  get los() {
    this.#los ??= new LOS(this.logic?.element('los') ?? null);
    return this.#los;
  }

  /** Whether validation found no errors (warnings allowed). @returns {boolean} */
  get valid() {
    return !this.issues.some((issue) => issue.severity === 'error');
  }

  /**
   * Element whose ID-typed attribute equals `id`.
   * @param {string} id
   * @returns {import('./node.js').IEEE1599Element | null}
   */
  byId(id) {
    return this.ids.get(id) ?? null;
  }

  /**
   * Imported SVG/MIDI subtrees in document order, optionally filtered by
   * vocabulary. Each record identifies the subtree root, its IEEE host, the
   * DTD entry point and the imported DTD identifiers.
   * @param {import('./imports.js').IEEE1599ImportedVocabulary} [vocabulary]
   * @returns {readonly import('./imports.js').IEEE1599Import[]}
   *
   * @example
   * for (const { element, host } of doc.imports('svg')) console.log(host.path, element.name);
   */
  imports(vocabulary) {
    return vocabulary === undefined ? [...this.#imports] : this.#imports.filter((item) => item.vocabulary === vocabulary);
  }

  /**
   * Imported elements whose `id` attribute equals `id`, in document order.
   * Imported IDs are separate from IEEE 1599 IDs (`byId()`): they are not
   * validated, so the list may contain several elements, for example the
   * same SVG `id` in two independent fragments.
   * @param {string} id Attribute value as written (no normalization).
   * @returns {readonly import('./imports.js').IEEE1599ImportedElement[]}
   */
  importedById(id) {
    return this.#importedIds.get(id) ?? [];
  }

  /**
   * Every IDREF/IDREFS attribute that refers to `id`, in document order.
   * @param {string} id Referenced ID.
   * @returns {readonly IEEE1599Reference[]}
   */
  referencesTo(id) {
    return this.#references.get(id) ?? [];
  }

  /**
   * Elements of each layer that refer to a Spine event, i.e. the cross-layer
   * links that make the Spine the backbone of the document.
   * @param {string} eventId Spine event ID.
   * @returns {Record<IEEE1599LayerName, import('./node.js').IEEE1599Element[]>}
   */
  eventLinks(eventId) {
    /** @type {Record<IEEE1599LayerName, import('./node.js').IEEE1599Element[]>} */
    const links = { general: [], logic: [], structural: [], notational: [], performance: [], audio: [] };
    for (const { element } of this.referencesTo(eventId)) {
      const layer = element.layer;
      if (layer && !links[layer].includes(element)) links[layer].push(element);
    }
    return links;
  }

  /**
   * Resolve a file reference (e.g. `file_name`) against `baseURL`.
   * @param {string} path Relative or absolute URL.
   * @returns {string} Absolute URL.
   * @throws {Error} When the URL cannot be resolved (relative path without base).
   */
  resolveURL(path) {
    try {
      return new URL(path, this.baseURL ?? undefined).href;
    } catch {
      throw new Error(`Cannot resolve media path ${path}; provide an absolute baseURL`);
    }
  }
}

/**
 * Scan only the prolog, skipping comments and processing instructions.
 * Do not interpret strings in comments, quoted identifiers or CDATA as DTD
 * markup. DOMParser still checks XML syntax.
 * @param {string} xml
 * @returns {{xmlDeclaration: string | null, doctype: IEEE1599Doctype | null}}
 */
function readProlog(xml) {
  const declaration = /^\uFEFF?(<\?xml\s[\s\S]*?\?>)/.exec(xml);
  const tokens = /[ \t\r\n]+|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/y;
  tokens.lastIndex = declaration?.[0].length ?? (xml.startsWith('\uFEFF') ? 1 : 0);
  let start = tokens.lastIndex;
  while (tokens.exec(xml)) start = tokens.lastIndex;
  const header = /<!DOCTYPE[ \t\r\n]+([^ \t\r\n[>]+)(?:[ \t\r\n]+(?:PUBLIC[ \t\r\n]+("[^"]*"|'[^']*')[ \t\r\n]+("[^"]*"|'[^']*')|SYSTEM[ \t\r\n]+("[^"]*"|'[^']*')))?[ \t\r\n]*/y;
  header.lastIndex = start;
  const match = header.exec(xml);
  const xmlDeclaration = declaration?.[1] ?? null;
  if (!match) return { xmlDeclaration, doctype: null };
  let end = header.lastIndex;
  let internalSubset = null;
  if (xml[end] === '[') {
    const subsetStart = ++end;
    const chunk = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|"[^"]*"|'[^']*'|<!ENTITY\b|[\s\S]/y;
    chunk.lastIndex = end;
    for (let token; (token = chunk.exec(xml));) {
      if (token[0] === '<!ENTITY') throw new Error('XML entity declarations are not supported');
      if (token[0] !== ']') continue;
      internalSubset = xml.slice(subsetStart, token.index);
      end = chunk.lastIndex;
      while (/[ \t\r\n]/.test(xml[end] ?? '')) end++;
      break;
    }
  }
  const unquote = (/** @type {string | undefined} */ value) => (value === undefined ? null : value.slice(1, -1));
  return {
    xmlDeclaration,
    doctype: xml[end] === '>' ? {
      name: match[1],
      publicId: unquote(match[2]),
      systemId: unquote(match[3] ?? match[4]),
      internalSubset,
      source: xml.slice(start, end + 1)
    } : null
  };
}

/**
 * Convert a DOM element subtree into model nodes.
 * @param {Element} source
 * @param {import('./node.js').IEEE1599Element | null} parent
 * @returns {import('./node.js').IEEE1599Element}
 */
function convert(source, parent) {
  const name = source.nodeName;
  const vocabulary = vocabularyOf(name, parent);
  /** @type {Array<[string, string]>} */
  const rawAttributes = Array.from(source.attributes, (attribute) => [attribute.name, attribute.value]);
  const element = new IEEE1599Element({
    name,
    namespaceURI: source.namespaceURI,
    vocabulary,
    rawAttributes,
    attributes: effectiveAttributes(name, vocabulary, rawAttributes),
    parent
  });
  for (const child of Array.from(source.childNodes)) {
    const node = convertNode(child, element);
    if (node) element.children.push(node);
  }
  return element;
}

/**
 * @param {Node} node
 * @param {import('./node.js').IEEE1599Element | null} parent
 * @returns {import('./node.js').IEEE1599Node | null}
 */
function convertNode(node, parent) {
  switch (node.nodeType) {
    case 1: return convert(/** @type {Element} */ (node), parent);
    case 3: return { type: 'text', value: node.nodeValue ?? '' };
    case 4: return { type: 'cdata', value: node.nodeValue ?? '' };
    case 7: return { type: 'processing-instruction', target: node.nodeName, data: node.nodeValue ?? '' };
    case 8: return { type: 'comment', value: node.nodeValue ?? '' };
    default: return null;
  }
}

/**
 * Parse IEEE 1599 XML into the lossless document model and validate it
 * against the vendored IEEE 1599 DTD 1.0.
 *
 * @param {string} xml IEEE 1599 XML text.
 * @param {ParseDocumentOptions} [options]
 * @returns {IEEE1599Document}
 * @throws {Error} `DOMParser is not available` outside browsers;
 *   `XML entity declarations are not supported` (entities are never expanded);
 *   `Malformed IEEE 1599 XML or invalid root element` for XML that is not
 *   well-formed or whose root is not `ieee1599`.
 * @throws {IEEE1599ValidationError} In strict mode, when any DTD validity
 *   error is found; `error.issues` lists every finding.
 *
 * @example
 * const doc = parseIEEE1599Document(xml);                    // strict
 * const lax = parseIEEE1599Document(xml, { strict: false }); // inspect lax.issues
 */
export function parseIEEE1599Document(xml, options = {}) {
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser is not available');
  const { xmlDeclaration, doctype } = readProlog(xml);
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.documentElement?.nodeName !== IEEE1599_SCHEMA.root || dom.getElementsByTagName('parsererror').length) {
    throw new Error('Malformed IEEE 1599 XML or invalid root element');
  }
  const root = convert(dom.documentElement, null);
  /** @type {(import('./node.js').IEEE1599Comment | import('./node.js').IEEE1599ProcessingInstruction)[]} */
  const prolog = [];
  /** @type {(import('./node.js').IEEE1599Comment | import('./node.js').IEEE1599ProcessingInstruction)[]} */
  const epilog = [];
  let afterRoot = false;
  for (const child of Array.from(dom.childNodes)) {
    if (child === dom.documentElement) { afterRoot = true; continue; }
    if (doctype && child === dom.doctype) { doctype.prologIndex = prolog.length; continue; }
    const node = convertNode(child, null);
    if (node && (node.type === 'comment' || node.type === 'processing-instruction')) (afterRoot ? epilog : prolog).push(node);
  }
  const { issues, ids } = validateTree({ root, doctype });
  if ((options.strict ?? true) && issues.some((issue) => issue.severity === 'error')) throw new IEEE1599ValidationError(issues);
  return new IEEE1599Document({ root, doctype, xmlDeclaration, prolog, epilog, issues, ids, baseURL: options.baseURL ?? null });
}

/**
 * Decode XML bytes using the BOM, HTTP charset, or XML declaration (in
 * that order), defaulting to UTF-8. UTF-16 without a BOM can be identified
 * from its opening `<?`. Decoding errors are reported, never replaced.
 * @internal
 * @param {ArrayBuffer} buffer
 * @param {string | null} [contentType]
 * @returns {string}
 */
export function decodeXML(buffer, contentType) {
  const [a, b, c, d] = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const bom = a === 0xef && b === 0xbb && c === 0xbf ? 'utf-8'
    : a === 0xff && b === 0xfe ? 'utf-16le' : a === 0xfe && b === 0xff ? 'utf-16be' : undefined;
  if ((a === 0 && b === 0 && c === 0xfe && d === 0xff) || (a === 0xff && b === 0xfe && c === 0 && d === 0)
    || (a === 0 && b === 0 && c === 0 && d === 0x3c) || (a === 0x3c && b === 0 && c === 0 && d === 0)) {
    throw new Error('UTF-32 XML is not supported');
  }
  const signature = a === 0 && b === 0x3c && c === 0 && d === 0x3f ? 'utf-16be'
    : a === 0x3c && b === 0 && c === 0x3f && d === 0 ? 'utf-16le' : undefined;
  const charset = /;\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType ?? '');
  const httpEncoding = charset?.[1] ?? charset?.[2];
  let prefix;
  const bytes = new Uint8Array(buffer);
  if (!bom && !httpEncoding && !signature && a === 0x3c && b === 0x3f && c === 0x78 && d === 0x6d
    && bytes[4] === 0x6c && [9, 10, 13, 32].includes(bytes[5])) {
    const end = bytes.indexOf(0x3f, 5);
    if (end >= 0 && bytes[end + 1] === 0x3e) prefix = new globalThis.TextDecoder().decode(bytes.subarray(0, end + 2));
  }
  const declared = prefix?.match(/\bencoding[ \t\r\n]*=[ \t\r\n]*["']([^"']+)["']/)?.[1];
  const encoding = bom ?? (httpEncoding?.toLowerCase() === 'utf-16' && signature ? signature : httpEncoding)
    ?? signature ?? declared ?? 'utf-8';
  try {
    return new globalThis.TextDecoder(encoding, { fatal: true }).decode(buffer);
  } catch (error) {
    throw new Error(`Cannot decode IEEE 1599 XML as ${encoding}`, { cause: error });
  }
}

/**
 * Fetch and parse an IEEE 1599 document. `baseURL` defaults to the final
 * response URL (after redirects).
 * @param {string} url Document URL.
 * @param {ParseDocumentOptions & {signal?: AbortSignal}} [options]
 * @returns {Promise<IEEE1599Document>}
 * @throws {Error} `IEEE 1599 fetch failed: HTTP <status>` for non-OK responses,
 *   an XML decoding error for unsupported encodings or malformed bytes, or
 *   any error of {@link parseIEEE1599Document}.
 */
export async function loadIEEE1599Document(url, options = {}) {
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`IEEE 1599 fetch failed: HTTP ${response.status}`);
  return parseIEEE1599Document(decodeXML(await response.arrayBuffer(), response.headers.get('Content-Type')),
    { strict: options.strict, baseURL: options.baseURL ?? response.url });
}

/** @param {string} value */
const escapeText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
/** @param {string} value */
const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');

/**
 * @param {import('./node.js').IEEE1599Node} node
 * @param {string[]} out
 */
function writeNode(node, out) {
  switch (node.type) {
    case 'text': out.push(escapeText(node.value)); break;
    case 'cdata': out.push(`<![CDATA[${node.value.split(']]>').join(']]]]><![CDATA[>')}]]>`); break;
    case 'comment': out.push(`<!--${node.value}-->`); break;
    case 'processing-instruction': out.push(`<?${node.target}${node.data ? ` ${node.data}` : ''}?>`); break;
    default: {
      const attributes = node.rawAttributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
      if (!node.children.length) { out.push(`<${node.name}${attributes}/>`); break; }
      out.push(`<${node.name}${attributes}>`);
      for (const child of node.children) writeNode(child, out);
      out.push(`</${node.name}>`);
    }
  }
}

/**
 * Serialize a document model to XML. Only source-specified attributes are
 * written (DTD defaults are not materialized), in source order; text, CDATA,
 * comments and processing instructions are preserved. The XML and DOCTYPE
 * declarations are written as in the source (a UTF-8 XML declaration is added
 * when the source had none). Whitespace outside the root element is not
 * preserved, and character references are written as literal characters
 * (except where escaping is required).
 * @param {IEEE1599Document} doc Document to serialize.
 * @returns {string} XML text.
 *
 * @example
 * const xml = serializeIEEE1599Document(parseIEEE1599Document(source));
 */
export function serializeIEEE1599Document(doc) {
  /** @type {string[]} */
  const out = [doc.xmlDeclaration ?? '<?xml version="1.0" encoding="UTF-8"?>', '\n'];
  const doctypeIndex = doc.doctype?.prologIndex ?? 0;
  for (const [index, node] of doc.prolog.entries()) {
    if (doc.doctype && index === doctypeIndex) out.push(doc.doctype.source, '\n');
    writeNode(node, out);
    out.push('\n');
  }
  if (doc.doctype && doctypeIndex >= doc.prolog.length) out.push(doc.doctype.source, '\n');
  writeNode(doc.root, out);
  for (const node of doc.epilog) { out.push('\n'); writeNode(node, out); }
  out.push('\n');
  return out.join('');
}

export { IEEE1599ValidationError };
