#!/usr/bin/env node
/**
 * Development-only generator for the IEEE 1599 schema inventory.
 *
 * Reads the vendored `schema/ieee1599.dtd`, verifies its pinned SHA-256 hash and
 * writes:
 * - `src/schema/ieee1599-schema.js` runtime inventory used by the document model;
 * - `src/schema/ieee1599-types.js` generated JSDoc typedefs for every element;
 * - `docs/schema-reference.md` per-element/attribute reference.
 *
 * Usage: `node tools/schema/generate.js` to write, `--check` to fail when the
 * committed outputs differ from what the DTD produces (the coverage gate).
 * @module tools/schema/generate
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseDTD, referencedNames } from './dtd.js';

const root = new URL('../../', import.meta.url);
const DTD_PATH = new URL('schema/ieee1599.dtd', root);
const DTD_SHA256 = '6d252f51e1dada2284ab4a21c884c7d4574b09a5a7455758e9b5a07e8d17d04b';
const DTD_URL = 'https://www.lim.di.unimi.it/IEEE/ieee1599.dtd';
const DOC_BASE = 'https://ieee1599.lim.di.unimi.it/documentation/1.0/';

/**
 * Imported vocabularies are deliberately not expanded (user decision): their
 * content is retained as opaque subtrees. Every undeclared name or entity used
 * by the IEEE declarations must be listed here, otherwise generation fails.
 * @type {import('./dtd.js').ImportConfig}
 */
export const IMPORTS = {
  entities: { MIDIChannelMessage: 'midi' },
  elements: { svg: 'svg', font: 'svg', SysEx: 'midi' }
};

/** Vocabulary metadata for the external parameter entities in the DTD. */
const VOCABULARIES = {
  svg: { entity: 'svg', title: 'SVG 1.1', publicId: '-//W3C//DTD SVG 1.1//EN', namespace: 'http://www.w3.org/2000/svg' },
  midi: { entity: 'mididtd', title: 'MIDIEvents 1.0', publicId: '-//MIDI Manufacturers Association//DTD MIDIEvents 1.0//EN', namespace: null }
};

/**
 * Semantic IDREF targets documented by IEEE 1599 but not expressible in a DTD.
 * Only well-established relationships are listed; other IDREFs may target any ID.
 * @type {Record<string, string[]>}
 */
const REFERENCE_TARGETS = {
  event_ref: ['event'],
  start_event_ref: ['event'],
  end_event_ref: ['event'],
  staff_ref: ['staff'],
  voice_item_ref: ['voice_item'],
  voice_ref: ['voice_item'],
  part_ref: ['part'],
  segment_ref: ['segment'],
  segment_a_ref: ['segment'],
  segment_b_ref: ['segment'],
  feature_object_a_ref: ['feature_object'],
  feature_object_b_ref: ['feature_object'],
  feature_object_relationship_ref: ['feature_object_relationship']
};

const LAYERS = ['general', 'logic', 'structural', 'notational', 'performance', 'audio'];

/** @param {string} name */
const pascal = (name) => name.split(/[_-]/).map((part) => part[0].toUpperCase() + part.slice(1)).join('');

/** @param {import('./dtd.js').ContentModel} content */
function contentSummary(content) {
  if (content.type === 'empty') return 'EMPTY';
  if (content.type === 'any') return 'ANY';
  if (content.type === 'mixed') return content.names.length ? `(#PCDATA | ${content.names.join(' | ')})*` : '(#PCDATA)';
  /** @param {import('./dtd.js').Particle} particle @returns {string} */
  const render = (particle) => {
    if (particle.kind === 'name') return particle.name + particle.occurrence;
    if (particle.kind === 'import') return `%${particle.entity};` + particle.occurrence;
    return `(${particle.items.map(render).join(particle.kind === 'seq' ? ', ' : ' | ')})${particle.occurrence}`;
  };
  return render(content.particle);
}

/**
 * Generate all outputs.
 * @returns {Promise<Record<string, string>>} Map of repository path to content.
 */
export async function generate() {
  const bytes = await readFile(DTD_PATH);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== DTD_SHA256) throw new Error(`schema/ieee1599.dtd hash ${sha256} does not match pinned ${DTD_SHA256}`);
  const text = bytes.toString('utf8');
  const parsed = parseDTD(text, IMPORTS);
  const pages = JSON.parse(await readFile(new URL('schema/lim-documentation-pages.json', root), 'utf8'));
  const version = /Version:\s*([\d.]+)/.exec(text)?.[1] ?? null;
  const lastUpdate = /Last update:\s*([\d/]+)/.exec(text)?.[1] ?? null;

  const parents = new Map([...parsed.elements.keys()].map((name) => [name, /** @type {string[]} */ ([])]));
  const importedUses = /** @type {Record<string, {vocabulary: string, usedBy: string[]}>} */ ({});
  for (const element of parsed.elements.values()) {
    for (const child of referencedNames(element.content)) {
      if (parents.has(child)) parents.get(child)?.push(element.name);
      else {
        importedUses[child] ??= { vocabulary: IMPORTS.elements[child], usedBy: [] };
        importedUses[child].usedBy.push(element.name);
      }
    }
    if (element.content.type === 'children') {
      /** @param {import('./dtd.js').Particle} particle */
      const visit = (particle) => {
        if (particle.kind === 'import') {
          const key = `%${particle.entity};`;
          importedUses[key] ??= { vocabulary: particle.vocabulary, usedBy: [] };
          importedUses[key].usedBy.push(element.name);
        } else if (particle.kind !== 'name') particle.items.forEach(visit);
      };
      visit(element.content.particle);
    }
  }
  const layersOf = new Map([...parsed.elements.keys()].map((name) => [name, /** @type {string[]} */ ([])]));
  for (const layer of LAYERS) {
    const stack = [layer];
    const seen = new Set();
    while (stack.length) {
      const name = /** @type {string} */ (stack.pop());
      if (seen.has(name) || !parsed.elements.has(name)) continue;
      seen.add(name);
      layersOf.get(name)?.push(layer);
      const element = parsed.elements.get(name);
      if (element) stack.push(...referencedNames(element.content));
    }
  }
  layersOf.get('ieee1599')?.push('root');
  const unreachable = [...layersOf].filter(([, layers]) => layers.length === 0).map(([name]) => name);

  const elements = Object.fromEntries([...parsed.elements.values()].map((element) => [element.name, {
    name: element.name,
    content: element.content,
    contentSource: contentSummary(element.content),
    attributes: Object.fromEntries(element.attributes.map((attribute) => [attribute.name, {
      type: attribute.type,
      values: attribute.values,
      presence: attribute.presence,
      defaultValue: attribute.defaultValue,
      targets: attribute.type.startsWith('IDREF') ? REFERENCE_TARGETS[attribute.name] ?? null : null
    }])),
    layers: layersOf.get(element.name) ?? [],
    parents: parents.get(element.name) ?? [],
    line: element.line,
    documentation: pages[element.name] ? DOC_BASE + pages[element.name] : null
  }]));

  const source = {
    url: DTD_URL,
    sha256,
    version,
    lastUpdate,
    description: 'IEEE 1599 DTD 1.0, emended version published by LIM (Università degli Studi di Milano)'
  };
  const imports = parsed.imports.map((entry) => {
    const vocabulary = Object.entries(VOCABULARIES).find(([, item]) => item.entity === entry.entity);
    return { ...entry, vocabulary: vocabulary?.[0] ?? null, title: vocabulary?.[1].title ?? null, namespace: vocabulary?.[1].namespace ?? null };
  });
  const inventory = {
    source, imports, root: 'ieee1599', layers: LAYERS, elements, importedNames: importedUses,
    unreachable, parameterEntities: Object.fromEntries([...parsed.parameterEntities].map(([name, entity]) => [name, entity.external
      ? { external: entity.external, line: entity.line }
      : { value: entity.value?.replace(/\s+/g, ' ').trim(), line: entity.line }]))
  };

  const header = '// Generated by tools/schema/generate.js from schema/ieee1599.dtd. Do not edit by hand.\n';
  const schemaModule = `${header}
/**
 * Audited inventory of every element and attribute declared by the IEEE 1599
 * DTD 1.0 (see \`schema/README.md\` for provenance). Imported SVG and MIDI
 * vocabularies are recorded as boundaries but not expanded.
 * @module ieee1599/schema
 */

/**
 * @typedef {{ kind: 'name', name: string, occurrence: '' | '?' | '*' | '+' }
 *   | { kind: 'seq' | 'choice', items: SchemaParticle[], occurrence: '' | '?' | '*' | '+' }
 *   | { kind: 'import', vocabulary: string, entity: string, occurrence: '' | '?' | '*' | '+' }} SchemaParticle
 * Content-model particle. \`import\` marks content declared by an imported vocabulary.
 */

/**
 * @typedef {{ type: 'empty' } | { type: 'any' } | { type: 'mixed', names: string[] }
 *   | { type: 'children', particle: SchemaParticle }} SchemaContentModel
 * Parsed DTD content specification.
 */

/**
 * @typedef {object} SchemaAttribute
 * @property {string} type DTD attribute type (\`CDATA\`, \`ID\`, \`IDREF\`, \`NMTOKEN\`, \`enumeration\`, ...).
 * @property {string[] | null} values Allowed values for enumerated types.
 * @property {'required' | 'implied' | 'fixed' | 'default'} presence Default declaration kind.
 * @property {string | null} defaultValue Declared default or fixed value.
 * @property {string[] | null} targets Element names an IDREF is semantically expected to target, when known.
 */

/**
 * @typedef {object} SchemaElement
 * @property {string} name Element name.
 * @property {SchemaContentModel} content Parsed content model.
 * @property {string} contentSource Normalized content model text.
 * @property {Record<string, SchemaAttribute>} attributes Declared attributes in declaration order.
 * @property {string[]} layers Layers (\`general\` ... \`audio\`, or \`root\`) whose subtree can contain the element.
 * @property {string[]} parents Elements whose content model allows this element.
 * @property {number} line Line of the ELEMENT declaration in the vendored DTD.
 * @property {string | null} documentation URL of the LIM element documentation page, when one exists.
 */

/**
 * @typedef {object} IEEE1599Schema
 * @property {{url: string, sha256: string, version: string | null, lastUpdate: string | null, description: string}} source
 * @property {{entity: string, publicId: string | null, systemId: string, line: number, vocabulary: string | null, title: string | null, namespace: string | null}[]} imports
 * @property {'ieee1599'} root Root element name.
 * @property {readonly ['general', 'logic', 'structural', 'notational', 'performance', 'audio']} layers Layer element names in document order.
 * @property {Record<string, SchemaElement>} elements Every declared element.
 * @property {Record<string, {vocabulary: string, usedBy: string[]}>} importedNames Imported names and entities used by IEEE content models.
 * @property {string[]} unreachable Declared elements no content model can contain.
 * @property {Record<string, {value?: string, external?: {publicId: string | null, systemId: string}, line: number}>} parameterEntities Parameter entities.
 */

/**
 * Recursively freeze plain data.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** @type {IEEE1599Schema} */
export const IEEE1599_SCHEMA = deepFreeze(/** @type {IEEE1599Schema} */ (${JSON.stringify(inventory, null, 2)}));
`;

  const typeLines = [header, `/**
 * Generated JSDoc typedefs for every IEEE 1599 element. Attribute values are
 * the source strings (or DTD defaults); enumerations are narrowed to their
 * declared values. Import with \`import('./ieee1599-types.js')\` in JSDoc.
 * @module ieee1599/types
 */
`];
  for (const element of Object.values(elements)) {
    const type = pascal(element.name);
    typeLines.push('/**');
    typeLines.push(` * Attributes of \`<${element.name}>\`. Content: \`${element.contentSource.replace(/\*\//g, '* /')}\`.`);
    typeLines.push(` * @typedef {object} IEEE1599${type}Attributes`);
    for (const [name, attribute] of Object.entries(element.attributes)) {
      const valueType = attribute.values ? attribute.values.map((value) => `'${value}'`).join(' | ') : 'string';
      const optional = attribute.presence === 'implied';
      const note = attribute.presence === 'required' ? 'Required.'
        : attribute.presence === 'implied' ? 'Optional.'
          : `${attribute.presence === 'fixed' ? 'Fixed' : 'Default'} \`${attribute.defaultValue}\`.`;
      const kind = attribute.type === 'enumeration' ? 'Enumeration' : attribute.type;
      const target = attribute.targets ? ` References \`${attribute.targets.join('`, `')}\`.` : '';
      typeLines.push(` * @property {${valueType}} ${optional ? `[${name}]` : name} ${kind}. ${note}${target}`);
    }
    typeLines.push(' */');
    typeLines.push('');
    typeLines.push('/**');
    typeLines.push(` * \`<${element.name}>\` element node${element.documentation ? ` (${element.documentation})` : ''}.`);
    typeLines.push(` * @typedef {import('../model/node.js').IEEE1599Element & { name: '${element.name}', attributes: IEEE1599${type}Attributes }} IEEE1599${type}Element`);
    typeLines.push(' */');
    typeLines.push('');
  }
  typeLines.push('/**');
  typeLines.push(' * Map from IEEE 1599 element name to its typed node.');
  typeLines.push(' * @typedef {object} IEEE1599ElementMap');
  for (const element of Object.values(elements)) typeLines.push(` * @property {IEEE1599${pascal(element.name)}Element} ${element.name}`);
  typeLines.push(' */');
  typeLines.push('');
  typeLines.push('/** @typedef {keyof IEEE1599ElementMap} IEEE1599ElementName Name of any declared IEEE 1599 element. */');
  typeLines.push('');
  typeLines.push('export {};');
  typeLines.push('');

  const md = [`<!-- Generated by tools/schema/generate.js from schema/ieee1599.dtd. Do not edit by hand. -->

# IEEE 1599 schema reference

This reference is generated from the vendored [IEEE 1599 DTD](../schema/ieee1599.dtd)
(version ${version}, last updated ${lastUpdate}, SHA-256 \`${sha256}\`). It lists
every declared element and attribute; \`npm run schema:check\` fails when the
generated inventory and this page drift from the DTD. See
[schema provenance](../schema/README.md) and the [data model guide](data-model.md).

Each element is represented in JavaScript by an \`IEEE1599Element\` node with the
same name, its attributes as source strings (DTD defaults applied and flagged),
and ordered children. Data coverage does not imply playback, rendering or
synthesis support; see [capabilities](capabilities.md).

## Summary

| Item | Count |
| --- | --- |
| Declared IEEE 1599 elements | ${Object.keys(elements).length} |
| Declared attributes | ${Object.values(elements).reduce((sum, element) => sum + Object.keys(element.attributes).length, 0)} |
| Imported vocabularies (opaque) | ${imports.map((entry) => `${entry.title} (\`%${entry.entity};\`)`).join(', ')} |
| Imported names used by IEEE content models | ${Object.entries(importedUses).map(([name, use]) => `\`${name}\` (${use.vocabulary}, in ${use.usedBy.map((item) => `\`${item}\``).join(', ')})`).join('; ')} |
| Declared but unreachable elements | ${unreachable.length ? unreachable.map((name) => `\`${name}\``).join(', ') : 'none'} |

## Elements by layer
`];
  for (const layer of ['root', ...LAYERS]) {
    const names = Object.values(elements).filter((element) => element.layers.includes(layer)).map((element) => `[\`${element.name}\`](#${element.name})`);
    md.push(`- **${layer}** (${names.length}): ${names.join(', ')}`);
  }
  if (unreachable.length) md.push(`- **unreachable** (${unreachable.length}): ${unreachable.map((name) => `[\`${name}\`](#${name})`).join(', ')}`);
  md.push('', '## Elements', '');
  for (const element of Object.values(elements).sort((a, b) => a.name.localeCompare(b.name))) {
    md.push(`### ${element.name}`, '');
    md.push(`- Layers: ${element.layers.length ? element.layers.join(', ') : 'unreachable'}; DTD line ${element.line}${element.documentation ? `; [LIM documentation](${element.documentation})` : ''}`);
    md.push(`- Content: \`${element.contentSource}\``);
    md.push(`- Parents: ${element.parents.length ? element.parents.map((name) => `[\`${name}\`](#${name})`).join(', ') : 'none'}`);
    md.push(`- JSDoc type: \`IEEE1599${pascal(element.name)}Element\``);
    const attributes = Object.entries(element.attributes);
    if (attributes.length) {
      md.push('', '| Attribute | Type | Values | Presence | Default | References |', '| --- | --- | --- | --- | --- | --- |');
      for (const [name, attribute] of attributes) {
        md.push(`| \`${name}\` | ${attribute.type} | ${attribute.values ? attribute.values.map((value) => `\`${value}\``).join(', ') : ''} | ${attribute.presence} | ${attribute.defaultValue === null ? '' : `\`${attribute.defaultValue}\``} | ${attribute.targets ? attribute.targets.map((target) => `\`${target}\``).join(', ') : ''} |`);
      }
    } else md.push('- Attributes: none');
    md.push('');
  }

  return {
    'src/schema/ieee1599-schema.js': schemaModule,
    'src/schema/ieee1599-types.js': typeLines.join('\n'),
    'docs/schema-reference.md': md.join('\n')
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const outputs = await generate();
  let stale = false;
  for (const [path, content] of Object.entries(outputs)) {
    const url = new URL(path, root);
    if (check) {
      const current = await readFile(url, 'utf8').catch(() => null);
      if (current?.replace(/\r\n/g, '\n') !== content) {
        console.error(`${path} is out of date; run npm run schema:generate`);
        stale = true;
      }
    } else await writeFile(url, content);
  }
  if (stale) process.exitCode = 1;
  else console.log(check ? 'Schema outputs are up to date.' : `Wrote ${Object.keys(outputs).join(', ')}`);
}
