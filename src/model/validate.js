/**
 * Validation of an IEEE 1599 element tree against the generated DTD inventory.
 *
 * Implements the XML 1.0 validity constraints that a DTD can express for the
 * IEEE 1599 declarations: declared root and element types, content models
 * (EMPTY, mixed and children), declared/required/enumerated/fixed attributes,
 * ID/IDREF/IDREFS/NMTOKEN syntax, ID uniqueness and IDREF resolution. Imported
 * SVG and MIDI subtrees are opaque and are not validated. Additional semantic
 * checks that a DTD cannot express are reported as warnings.
 * @module ieee1599/model/validate
 */
import { IEEE1599_SCHEMA } from '../schema/ieee1599-schema.js';
import { matcherFor } from './content-model.js';

/**
 * Validation or semantic issue.
 * @typedef {object} IEEE1599Issue
 * @property {IEEE1599IssueCode} code Stable machine-readable code.
 * @property {'error' | 'warning'} severity `error` for DTD validity violations
 *   (thrown in strict mode); `warning` for semantic or provenance findings.
 * @property {string} message Human-readable description.
 * @property {string | null} path Location path of the element, e.g. `/ieee1599[1]/logic[1]`.
 * @property {string | null} element Element name.
 * @property {string | null} attribute Attribute name, when relevant.
 * @property {string | null} value Offending value, when relevant.
 */

/**
 * Issue codes.
 * - `doctype-mismatch`: DOCTYPE name differs from the root element.
 * - `doctype-missing`: no DOCTYPE; validated against the vendored DTD anyway (warning).
 * - `doctype-system-id`: DOCTYPE refers to a different DTD URL than the vendored LIM file (warning).
 * - `internal-subset`: internal DTD subset declarations would change the schema; unsupported.
 * - `element-undeclared`: element not declared by IEEE 1599 nor allowed as an import there.
 * - `content-invalid`: children do not match the declared content model.
 * - `content-not-empty`: an EMPTY element has content.
 * - `text-not-allowed`: character data in element-only content.
 * - `attribute-undeclared`, `attribute-required`, `attribute-enumeration`,
 *   `attribute-fixed`, `attribute-syntax`: attribute validity constraints.
 * - `id-duplicate`, `idref-unresolved`: ID uniqueness and IDREF resolution.
 * - `reference-target`: an IDREF resolves to an element of an unexpected kind (warning).
 * - `spine-timing`, `spine-hpos`: spine value is neither an integer nor `null` (warning).
 * @typedef {'doctype-mismatch' | 'doctype-missing' | 'doctype-system-id' | 'internal-subset'
 *   | 'element-undeclared' | 'content-invalid' | 'content-not-empty' | 'text-not-allowed'
 *   | 'attribute-undeclared' | 'attribute-required' | 'attribute-enumeration' | 'attribute-fixed'
 *   | 'attribute-syntax' | 'id-duplicate' | 'idref-unresolved' | 'reference-target'
 *   | 'spine-timing' | 'spine-hpos'} IEEE1599IssueCode
 */

/**
 * Error thrown by strict parsing when the document violates the DTD.
 */
export class IEEE1599ValidationError extends Error {
  /**
   * @param {IEEE1599Issue[]} issues All issues found (errors and warnings).
   */
  constructor(issues) {
    const errors = issues.filter((issue) => issue.severity === 'error');
    const preview = errors.slice(0, 3).map((issue) => `${issue.message}${issue.path ? ` at ${issue.path}` : ''}`).join('; ');
    super(`IEEE 1599 document is not valid against the DTD (${errors.length} error${errors.length === 1 ? '' : 's'}): ${preview}${errors.length > 3 ? '; ...' : ''}`);
    this.name = 'IEEE1599ValidationError';
    /** All issues, including warnings. @type {IEEE1599Issue[]} */
    this.issues = issues;
  }
}

const NAME_START = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
/** XML 1.0 `Name` production. */
// XML 1.0 NameChar deliberately includes combining-mark ranges.
// eslint-disable-next-line no-misleading-character-class
export const XML_NAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`, 'u');
/** XML 1.0 `Nmtoken` production. */
// XML 1.0 NameChar deliberately includes combining-mark ranges.
// eslint-disable-next-line no-misleading-character-class
export const XML_NMTOKEN = new RegExp(`^[${NAME_CHAR}]+$`, 'u');

/** DTD system identifiers that denote the vendored DTD. */
export const KNOWN_SYSTEM_IDS = Object.freeze([
  'https://www.lim.di.unimi.it/IEEE/ieee1599.dtd',
  'http://www.lim.di.unimi.it/IEEE/ieee1599.dtd',
  'ieee1599.dtd'
]);

/**
 * Normalize an attribute value as XML 1.0 §3.3.3 requires for non-CDATA types.
 * @param {string} type DTD attribute type.
 * @param {string} value Value after CDATA normalization (done by the XML parser).
 * @returns {string}
 */
export function normalizeAttribute(type, value) {
  return type === 'CDATA' ? value : value.replace(/^ +| +$/g, '').replace(/ {2,}/g, ' ');
}

/**
 * @param {import('./node.js').IEEE1599Element} element
 * @param {IEEE1599Issue['code']} code
 * @param {IEEE1599Issue['severity']} severity
 * @param {string} message
 * @param {string | null} [attribute]
 * @param {string | null} [value]
 * @returns {IEEE1599Issue}
 */
const issueAt = (element, code, severity, message, attribute = null, value = null) => ({
  code, severity, message, path: element.path, element: element.name, attribute, value
});

/**
 * Validate an element tree and collect its ID index.
 * @param {object} input
 * @param {import('./node.js').IEEE1599Element} input.root Document element.
 * @param {{name: string, publicId: string | null, systemId: string | null, internalSubset: string | null} | null} input.doctype
 *   Document type declaration, if any.
 * @returns {{issues: IEEE1599Issue[], ids: Map<string, import('./node.js').IEEE1599Element>}}
 */
export function validateTree({ root, doctype }) {
  /** @type {IEEE1599Issue[]} */
  const issues = [];
  /** @type {Map<string, import('./node.js').IEEE1599Element>} */
  const ids = new Map();
  /** @type {{element: import('./node.js').IEEE1599Element, attribute: string, value: string, targets: string[] | null}[]} */
  const references = [];
  const document = (/** @type {IEEE1599Issue} */ issue) => issues.push(issue);

  if (!doctype) {
    document({ code: 'doctype-missing', severity: 'warning', message: 'No DOCTYPE declaration; validated against the vendored IEEE 1599 DTD 1.0', path: null, element: null, attribute: null, value: null });
  } else {
    if (doctype.name !== root.name) {
      document({ code: 'doctype-mismatch', severity: 'error', message: `DOCTYPE name ${doctype.name} does not match root element ${root.name}`, path: null, element: null, attribute: null, value: doctype.name });
    }
    if (doctype.systemId && !KNOWN_SYSTEM_IDS.includes(doctype.systemId)) {
      document({ code: 'doctype-system-id', severity: 'warning', message: `DOCTYPE refers to ${doctype.systemId}; validated against the vendored LIM IEEE 1599 DTD 1.0 instead`, path: null, element: null, attribute: null, value: doctype.systemId });
    }
    if (doctype.internalSubset && /[^ \t\r\n]/.test(doctype.internalSubset.replace(/<!--[\s\S]*?-->/g, ''))) {
      document({ code: 'internal-subset', severity: 'error', message: 'Internal DTD subset declarations are not supported', path: null, element: null, attribute: null, value: null });
    }
  }

  /** @type {import('./node.js').IEEE1599Element[]} */
  const stack = [root];
  while (stack.length) {
    const element = /** @type {import('./node.js').IEEE1599Element} */ (stack.pop());
    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      const child = element.children[index];
      if (child.type === 'element') stack.push(child);
    }
    if (element.vocabulary === 'svg' || element.vocabulary === 'midi') continue;
    const declaration = element.declaration;
    if (!declaration) {
      // Report only the top of an unknown subtree.
      if (element.parent?.vocabulary !== 'unknown') {
        document(issueAt(element, 'element-undeclared', 'error', `Element ${element.name} is not declared by the IEEE 1599 DTD here`));
      }
      continue;
    }
    validateContent(element, declaration, document);
    for (const [name] of element.rawAttributes) {
      if (!Object.hasOwn(declaration.attributes, name)) {
        document(issueAt(element, 'attribute-undeclared', 'error', `Attribute ${name} is not declared for ${element.name}`, name, element.attributes[name] ?? null));
      }
    }
    for (const [name, attribute] of Object.entries(declaration.attributes)) {
      const value = element.attribute(name);
      if (value === null) {
        if (attribute.presence === 'required') {
          document(issueAt(element, 'attribute-required', 'error', `Required attribute ${name} is missing on ${element.name}`, name));
        }
        continue;
      }
      if (attribute.values && !attribute.values.includes(value)) {
        document(issueAt(element, 'attribute-enumeration', 'error', `Attribute ${name}="${value}" is not one of ${attribute.values.join(', ')}`, name, value));
      }
      if (attribute.presence === 'fixed' && value !== attribute.defaultValue) {
        document(issueAt(element, 'attribute-fixed', 'error', `Attribute ${name} must have the fixed value "${attribute.defaultValue}"`, name, value));
      }
      const tokens = attribute.type === 'IDREFS' || attribute.type === 'NMTOKENS' || attribute.type === 'ENTITIES' ? value.split(' ') : [value];
      const pattern = attribute.type.startsWith('NMTOKEN') ? XML_NMTOKEN
        : ['ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES'].includes(attribute.type) ? XML_NAME : null;
      if (pattern && tokens.some((token) => !pattern.test(token))) {
        document(issueAt(element, 'attribute-syntax', 'error', `Attribute ${name}="${value}" is not a valid ${attribute.type}`, name, value));
        continue;
      }
      if (attribute.type === 'ID') {
        if (ids.has(value)) document(issueAt(element, 'id-duplicate', 'error', `Duplicate ID ${value}`, name, value));
        else ids.set(value, element);
      } else if (attribute.type === 'IDREF' || attribute.type === 'IDREFS') {
        for (const token of tokens) references.push({ element, attribute: name, value: token, targets: attribute.targets });
      }
    }
  }
  for (const reference of references) {
    const target = ids.get(reference.value);
    if (!target) {
      document(issueAt(reference.element, 'idref-unresolved', 'error', `${reference.attribute}="${reference.value}" does not match any ID`, reference.attribute, reference.value));
    } else if (reference.targets && !reference.targets.includes(target.name)) {
      document(issueAt(reference.element, 'reference-target', 'warning', `${reference.attribute}="${reference.value}" refers to <${target.name}>, expected <${reference.targets.join('> or <')}>`, reference.attribute, reference.value));
    }
  }
  for (const event of root.element('logic')?.element('spine')?.elements('event') ?? []) {
    for (const name of /** @type {const} */ (['timing', 'hpos'])) {
      const value = event.attribute(name);
      if (value !== null && value !== 'null' && !/^\s*[-+]?\d+\s*$/.test(value)) {
        document(issueAt(event, name === 'timing' ? 'spine-timing' : 'spine-hpos', 'warning', `Spine ${name}="${value}" is neither an integer nor "null"`, name, value));
      }
    }
  }
  return { issues, ids };
}

/**
 * @param {import('./node.js').IEEE1599Element} element
 * @param {import('../schema/ieee1599-schema.js').SchemaElement} declaration
 * @param {(issue: IEEE1599Issue) => void} report
 */
function validateContent(element, declaration, report) {
  const { content } = declaration;
  if (content.type === 'any') return;
  if (content.type === 'empty') {
    if (element.children.length) report(issueAt(element, 'content-not-empty', 'error', `EMPTY element ${element.name} has content`));
    return;
  }
  const childElements = element.elements();
  if (content.type === 'mixed') {
    for (const child of childElements) {
      if (!content.names.includes(child.name)) {
        report(issueAt(element, 'content-invalid', 'error', `Element ${child.name} is not allowed in ${element.name} (allowed: #PCDATA${content.names.map((name) => ` | ${name}`).join('')})`, null, child.name));
      }
    }
    return;
  }
  for (const child of element.children) {
    if ((child.type === 'text' && /[^ \t\r\n]/.test(child.value)) || child.type === 'cdata') {
      report(issueAt(element, 'text-not-allowed', 'error', `Character data is not allowed in element-only content of ${element.name}`));
      break;
    }
  }
  const result = matcherFor(content.particle).match(childElements.map((child) => ({ name: child.name, vocabulary: child.vocabulary })));
  if (!result.valid) {
    const found = result.failedAt < childElements.length ? `<${childElements[result.failedAt].name}> at child ${result.failedAt + 1}` : 'end of content';
    report(issueAt(element, 'content-invalid', 'error', `Content of ${element.name} does not match ${declaration.contentSource}: found ${found}, expected ${result.expected.join(' | ')}`, null, result.failedAt < childElements.length ? childElements[result.failedAt].name : null));
  }
}

/**
 * Vocabulary of a child element given its parent, following the opaque import
 * policy: imported names allowed by the parent's content model start an `svg`
 * or `midi` subtree; descendants of opaque or unknown subtrees inherit.
 * @param {string} name Child element name.
 * @param {import('./node.js').IEEE1599Element | null} parent Parent element.
 * @returns {import('./node.js').IEEE1599Vocabulary}
 */
export function vocabularyOf(name, parent) {
  if (!parent) return 'ieee1599';
  if (parent.vocabulary !== 'ieee1599') return parent.vocabulary;
  const imported = IEEE1599_SCHEMA.importedNames[name];
  if (imported && imported.usedBy.includes(parent.name)) return /** @type {'svg' | 'midi'} */ (imported.vocabulary);
  for (const [key, use] of Object.entries(IEEE1599_SCHEMA.importedNames)) {
    if (key.startsWith('%') && use.usedBy.includes(parent.name) && !IEEE1599_SCHEMA.elements[name]) {
      return /** @type {'svg' | 'midi'} */ (use.vocabulary);
    }
  }
  return IEEE1599_SCHEMA.elements[name] ? 'ieee1599' : 'unknown';
}

/**
 * Compute effective attributes (normalized values plus DTD defaults).
 * @param {string} name Element name.
 * @param {import('./node.js').IEEE1599Vocabulary} vocabulary
 * @param {Array<[string, string]>} rawAttributes Source attributes.
 * @returns {Record<string, string>}
 */
export function effectiveAttributes(name, vocabulary, rawAttributes) {
  /** @type {Record<string, string>} */
  const attributes = Object.create(null);
  const declared = vocabulary === 'ieee1599' ? IEEE1599_SCHEMA.elements[name]?.attributes : undefined;
  for (const [attribute, value] of rawAttributes) {
    const type = declared?.[attribute]?.type;
    attributes[attribute] = type ? normalizeAttribute(type, value) : value;
  }
  if (declared) {
    for (const [attribute, declaration] of Object.entries(declared)) {
      if (!(attribute in attributes) && declaration.defaultValue !== null) attributes[attribute] = declaration.defaultValue;
    }
  }
  return attributes;
}
