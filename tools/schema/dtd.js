/**
 * Minimal, dependency-free DTD reader used only at development time to turn the
 * vendored IEEE 1599 DTD into an audited inventory. It understands the
 * constructs that appear in XML 1.0 DTDs (comments, processing instructions,
 * parameter entities, ELEMENT, ATTLIST, ENTITY and NOTATION declarations and
 * conditional sections). External parameter entities are never loaded: they
 * are reported as imports, and references to their declarations are resolved
 * through the explicit `imports` configuration supplied by the caller.
 * @module tools/schema/dtd
 */

/**
 * @typedef {{ kind: 'name', name: string, occurrence: Occurrence }
 *   | { kind: 'seq' | 'choice', items: Particle[], occurrence: Occurrence }
 *   | { kind: 'import', vocabulary: string, entity: string, occurrence: Occurrence }} Particle
 * A content-model particle. `import` marks content defined by an imported
 * vocabulary that is intentionally not expanded.
 */

/** @typedef {'' | '?' | '*' | '+'} Occurrence */

/**
 * @typedef {{ type: 'empty' } | { type: 'any' }
 *   | { type: 'mixed', names: string[] }
 *   | { type: 'children', particle: Particle }} ContentModel
 */

/**
 * @typedef {object} AttributeDeclaration
 * @property {string} name Attribute name.
 * @property {string} type `CDATA`, `ID`, `IDREF`, `IDREFS`, `ENTITY`, `ENTITIES`,
 *   `NMTOKEN`, `NMTOKENS`, `NOTATION` or `enumeration`.
 * @property {string[] | null} values Allowed values for enumerations and NOTATION.
 * @property {'required' | 'implied' | 'fixed' | 'default'} presence Default declaration kind.
 * @property {string | null} defaultValue Declared default or fixed value.
 * @property {number} line 1-based line in the DTD where the ATTLIST starts.
 */

/**
 * @typedef {object} ElementDeclaration
 * @property {string} name Element name.
 * @property {string} source Declared content model after parameter-entity expansion.
 * @property {ContentModel} content Parsed content model.
 * @property {AttributeDeclaration[]} attributes Attributes in declaration order.
 * @property {number} line 1-based line of the ELEMENT declaration.
 * @property {string | null} section Nearest preceding section comment.
 */

/**
 * @typedef {object} ParsedDTD
 * @property {Map<string, ElementDeclaration>} elements Declared elements by name.
 * @property {Map<string, {value: string | null, external: {publicId: string | null, systemId: string} | null, line: number}>} parameterEntities
 *   Parameter entities; `external` entities are imports and are not loaded.
 * @property {{entity: string, publicId: string | null, systemId: string, line: number}[]} imports
 *   External parameter entities referenced at declaration level.
 * @property {string[]} orphanAttlists Names that have ATTLIST but no ELEMENT.
 */

/**
 * Configuration describing intentionally unexpanded imported vocabularies.
 * @typedef {object} ImportConfig
 * @property {Record<string, string>} entities Map of parameter-entity name
 *   declared by an import to vocabulary name, e.g. `{ MIDIChannelMessage: 'midi' }`.
 * @property {Record<string, string>} elements Map of undeclared element name
 *   used in IEEE content models to the vocabulary that declares it.
 */

const NAME = /[A-Za-z_:][-A-Za-z0-9._:]*/y;

/**
 * Parse DTD text.
 * @param {string} text DTD source.
 * @param {ImportConfig} importConfig Imported vocabulary mapping.
 * @returns {ParsedDTD}
 * @throws {Error} On unsupported or malformed declarations, unknown parameter
 *   entities or undeclared names missing from `importConfig`.
 */
export function parseDTD(text, importConfig) {
  /** @type {ParsedDTD['parameterEntities']} */
  const parameterEntities = new Map();
  /** @type {Map<string, ElementDeclaration>} */
  const elements = new Map();
  /** @type {Map<string, AttributeDeclaration[]>} */
  const attlists = new Map();
  /** @type {ParsedDTD['imports']} */
  const imports = [];
  let section = /** @type {string | null} */ (null);
  let position = 0;
  const lineAt = (/** @type {number} */ index) => text.slice(0, index).split('\n').length;

  /**
   * Expand parameter-entity references in declaration text. References to
   * entities declared by imports become `%name;` placeholders preserved for
   * the content-model parser.
   * @param {string} value
   * @param {number} depth
   * @returns {string}
   */
  const expand = (value, depth = 0) => {
    if (depth > 16) throw new Error('Parameter entity recursion is too deep');
    return value.replace(/%([A-Za-z_][-A-Za-z0-9._]*);/g, (match, name) => {
      const entity = parameterEntities.get(name);
      if (entity && entity.value !== null) return ` ${expand(entity.value, depth + 1)} `;
      if (importConfig.entities[name]) return ` %${name}; `;
      throw new Error(`Unknown parameter entity %${name};`);
    });
  };

  while (position < text.length) {
    const rest = text.slice(position);
    const ws = /^\s+/.exec(rest);
    if (ws) { position += ws[0].length; continue; }
    if (rest.startsWith('<!--')) {
      const end = text.indexOf('-->', position + 4);
      if (end < 0) throw new Error('Unterminated comment');
      const comment = text.slice(position + 4, end).trim();
      if (/^[A-Z][A-Za-z -]*$/.test(comment) && comment.length < 60) section = comment;
      position = end + 3;
      continue;
    }
    if (rest.startsWith('<?')) {
      const end = text.indexOf('?>', position);
      if (end < 0) throw new Error('Unterminated processing instruction');
      position = end + 2;
      continue;
    }
    if (rest.startsWith('<![')) throw new Error(`Conditional sections are not supported (line ${lineAt(position)})`);
    const reference = /^%([A-Za-z_][-A-Za-z0-9._]*);/.exec(rest);
    if (reference) {
      const entity = parameterEntities.get(reference[1]);
      if (!entity) throw new Error(`Unknown parameter entity %${reference[1]};`);
      if (!entity.external) throw new Error(`Internal parameter entity %${reference[1]}; at declaration level is not supported`);
      imports.push({ entity: reference[1], ...entity.external, line: lineAt(position) });
      position += reference[0].length;
      continue;
    }
    const declaration = /^<!(ELEMENT|ATTLIST|ENTITY|NOTATION)\b/.exec(rest);
    if (!declaration) throw new Error(`Unexpected DTD content at line ${lineAt(position)}`);
    const end = findDeclarationEnd(text, position);
    const body = text.slice(position + declaration[0].length, end).trim();
    const line = lineAt(position);
    position = end + 1;
    if (declaration[1] === 'ENTITY') {
      const match = /^%\s+([A-Za-z_][-A-Za-z0-9._]*)\s+([\s\S]*)$/.exec(body);
      if (!match) continue; // General entities are not part of the element inventory.
      if (parameterEntities.has(match[1])) continue; // First declaration wins.
      const literal = /^(["'])([\s\S]*)\1$/.exec(match[2].trim());
      if (literal) {
        parameterEntities.set(match[1], { value: literal[2], external: null, line });
        continue;
      }
      const external = /^(?:PUBLIC\s+(["'])([\s\S]*?)\1\s+|SYSTEM\s+)(["'])([\s\S]*?)\3$/.exec(match[2].trim());
      if (!external) throw new Error(`Unsupported parameter entity declaration at line ${line}`);
      parameterEntities.set(match[1], {
        value: null, external: { publicId: external[2] ?? null, systemId: external[4] }, line
      });
    } else if (declaration[1] === 'ELEMENT') {
      const expanded = expand(body).replace(/\s+/g, ' ').trim();
      const nameMatch = /^(\S+)\s+([\s\S]+)$/.exec(expanded);
      if (!nameMatch) throw new Error(`Malformed ELEMENT at line ${line}`);
      if (elements.has(nameMatch[1])) throw new Error(`Duplicate ELEMENT ${nameMatch[1]}`);
      const source = nameMatch[2].replace(/\s*([(),|?*+])\s*/g, '$1').replace(/\)\s*$/, ')');
      elements.set(nameMatch[1], {
        name: nameMatch[1], source, content: parseContentModel(nameMatch[2], importConfig), attributes: [], line, section
      });
    } else if (declaration[1] === 'ATTLIST') {
      const expanded = expand(body);
      const [elementName, attributes] = parseAttlist(expanded, line);
      const list = attlists.get(elementName) ?? [];
      for (const attribute of attributes) {
        // XML 1.0 §3.3: the first declaration of an attribute is binding.
        if (!list.some((existing) => existing.name === attribute.name)) list.push(attribute);
      }
      attlists.set(elementName, list);
    }
  }

  const orphanAttlists = [];
  for (const [name, list] of attlists) {
    const element = elements.get(name);
    if (element) element.attributes = list;
    else orphanAttlists.push(name);
  }
  for (const element of elements.values()) {
    for (const name of referencedNames(element.content)) {
      if (!elements.has(name) && !importConfig.elements[name]) {
        throw new Error(`Element ${element.name} references undeclared element ${name} without an import mapping`);
      }
    }
  }
  return { elements, parameterEntities, imports, orphanAttlists };
}

/**
 * Find the `>` that closes a markup declaration, skipping quoted literals.
 * @param {string} text
 * @param {number} start
 * @returns {number}
 */
function findDeclarationEnd(text, start) {
  let quote = '';
  for (let index = start + 2; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index;
  }
  throw new Error('Unterminated markup declaration');
}

/**
 * Parse an expanded ATTLIST body.
 * @param {string} body
 * @param {number} line
 * @returns {[string, AttributeDeclaration[]]}
 */
function parseAttlist(body, line) {
  let index = 0;
  const skip = () => { while (/\s/.test(body[index] ?? '')) index += 1; };
  const name = () => {
    skip();
    NAME.lastIndex = index;
    const match = NAME.exec(body);
    if (!match) throw new Error(`Expected name in ATTLIST at line ${line}`);
    index = NAME.lastIndex;
    return match[0];
  };
  const literal = () => {
    skip();
    const quote = body[index];
    if (quote !== '"' && quote !== "'") throw new Error(`Expected literal in ATTLIST at line ${line}`);
    const end = body.indexOf(quote, index + 1);
    const value = body.slice(index + 1, end);
    index = end + 1;
    return value;
  };
  const elementName = name();
  /** @type {AttributeDeclaration[]} */
  const attributes = [];
  for (;;) {
    skip();
    if (index >= body.length) break;
    const attributeName = name();
    skip();
    let type;
    /** @type {string[] | null} */
    let values = null;
    if (body[index] === '(') {
      const end = body.indexOf(')', index);
      values = body.slice(index + 1, end).split('|').map((value) => value.trim());
      type = 'enumeration';
      index = end + 1;
    } else {
      type = name();
      if (type === 'NOTATION') {
        skip();
        const end = body.indexOf(')', index);
        values = body.slice(index + 1, end).split('|').map((value) => value.trim());
        index = end + 1;
      }
      if (!['CDATA', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'NMTOKEN', 'NMTOKENS', 'NOTATION'].includes(type)) {
        throw new Error(`Unknown attribute type ${type} at line ${line}`);
      }
    }
    skip();
    /** @type {AttributeDeclaration['presence']} */
    let presence = 'default';
    let defaultValue = null;
    if (body.startsWith('#REQUIRED', index)) { presence = 'required'; index += 9; }
    else if (body.startsWith('#IMPLIED', index)) { presence = 'implied'; index += 8; }
    else {
      if (body.startsWith('#FIXED', index)) { presence = 'fixed'; index += 6; }
      defaultValue = literal();
    }
    attributes.push({ name: attributeName, type, values, presence, defaultValue, line });
  }
  return [elementName, attributes];
}

/**
 * Parse a content specification (`EMPTY`, `ANY`, mixed or children).
 * @param {string} spec Expanded content specification.
 * @param {ImportConfig} importConfig
 * @returns {ContentModel}
 */
export function parseContentModel(spec, importConfig) {
  const source = spec.replace(/\s+/g, ' ').trim();
  if (source === 'EMPTY') return { type: 'empty' };
  if (source === 'ANY') return { type: 'any' };
  const compact = source.replace(/\s+/g, '');
  if (compact.startsWith('(#PCDATA')) {
    const names = compact.replace(/^\(#PCDATA/, '').replace(/\)\*?$/, '').split('|').filter(Boolean);
    return { type: 'mixed', names };
  }
  let index = 0;
  const tokens = compact.match(/%[A-Za-z_][-A-Za-z0-9._]*;|[A-Za-z_:][-A-Za-z0-9._:]*|[(),|?*+]/g) ?? [];
  /** @returns {Occurrence} */
  const occurrence = () => {
    const token = tokens[index];
    if (token === '?' || token === '*' || token === '+') { index += 1; return token; }
    return '';
  };
  /** @returns {Particle} */
  const particle = () => {
    const token = tokens[index];
    if (token === '(') {
      index += 1;
      /** @type {Particle[]} */
      const items = [particle()];
      let separator = '';
      while (tokens[index] === ',' || tokens[index] === '|') {
        if (separator && separator !== tokens[index]) throw new Error(`Mixed separators in ${source}`);
        separator = tokens[index];
        index += 1;
        items.push(particle());
      }
      if (tokens[index] !== ')') throw new Error(`Unbalanced content model ${source}`);
      index += 1;
      const kind = separator === '|' ? 'choice' : 'seq';
      return { kind, items, occurrence: occurrence() };
    }
    index += 1;
    if (token.startsWith('%')) {
      const entity = token.slice(1, -1);
      return { kind: 'import', vocabulary: importConfig.entities[entity], entity, occurrence: occurrence() };
    }
    return { kind: 'name', name: token, occurrence: occurrence() };
  };
  const root = particle();
  if (index !== tokens.length) throw new Error(`Trailing tokens in content model ${source}`);
  return { type: 'children', particle: root };
}

/**
 * Collect element names referenced by a content model.
 * @param {ContentModel} content
 * @returns {Set<string>}
 */
export function referencedNames(content) {
  const names = new Set();
  if (content.type === 'mixed') content.names.forEach((name) => names.add(name));
  /** @param {Particle} particle */
  const visit = (particle) => {
    if (particle.kind === 'name') names.add(particle.name);
    else if (particle.kind !== 'import') particle.items.forEach(visit);
  };
  if (content.type === 'children') visit(content.particle);
  return names;
}
