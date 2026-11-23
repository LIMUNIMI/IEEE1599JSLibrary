import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parseContentModel, parseDTD } from '../tools/schema/dtd.js';
import { IEEE1599_SCHEMA } from '../src/schema/ieee1599-schema.js';
import { ContentMatcher } from '../src/model/content-model.js';
import { effectiveAttributes, normalizeAttribute, vocabularyOf, XML_NAME, XML_NMTOKEN } from '../src/model/validate.js';
import { IEEE1599Element } from '../src/model/node.js';

const dtd = await readFile(new URL('../schema/ieee1599.dtd', import.meta.url), 'utf8');

test('generated schema outputs match the vendored DTD (coverage gate)', () => {
  const output = execFileSync(process.execPath, ['tools/schema/generate.js', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(output, /up to date/);
});

test('independent regex inventory matches every declared element and attribute', () => {
  const text = dtd.replace(/<!--[\s\S]*?-->/g, '');
  const entities = new Map();
  for (const [, name, value] of text.matchAll(/<!ENTITY\s+%\s+(\S+)\s+(?:"([^"]*)"|'([^']*)')/g)) {
    if (!entities.has(name)) entities.set(name, value ?? '');
  }
  const expand = (value) => {
    for (let pass = 0; pass < 10 && /%[\w.-]+;/.test(value); pass += 1) {
      value = value.replace(/%([\w.-]+);/g, (whole, name) => entities.get(name) ?? whole);
    }
    return value;
  };
  const elements = [...text.matchAll(/<!ELEMENT\s+([^\s%]+)/g)].map((match) => match[1]);
  assert.equal(new Set(elements).size, elements.length, 'no duplicate ELEMENT declarations');
  assert.deepEqual([...elements].sort(), Object.keys(IEEE1599_SCHEMA.elements).sort());
  assert.equal(elements.length, 200);

  const attributes = new Map();
  for (const [, element, body] of text.matchAll(/<!ATTLIST\s+(\S+)([^>]*)>/g)) {
    const declared = attributes.get(element) ?? [];
    const pattern = /(?:^|\s)([A-Za-z_:][\w.:-]*)\s+(?:CDATA|IDREFS|IDREF|ID|NMTOKENS|NMTOKEN|ENTITIES|ENTITY|NOTATION|\()/g;
    for (const [, name] of expand(body).matchAll(pattern)) if (!declared.includes(name)) declared.push(name);
    attributes.set(element, declared);
  }
  let total = 0;
  for (const [name, element] of Object.entries(IEEE1599_SCHEMA.elements)) {
    assert.deepEqual(Object.keys(element.attributes), attributes.get(name) ?? [], `attributes of ${name}`);
    total += Object.keys(element.attributes).length;
  }
  assert.equal(total, 424);
});

test('schema records imports, unreachable declarations and DTD quirks', () => {
  assert.deepEqual(IEEE1599_SCHEMA.imports.map((item) => item.vocabulary), ['svg', 'midi']);
  assert.deepEqual(Object.keys(IEEE1599_SCHEMA.importedNames).sort(), ['%MIDIChannelMessage;', 'SysEx', 'font', 'svg']);
  assert.deepEqual([...IEEE1599_SCHEMA.unreachable].sort(), ['mpeg4_spine_event', 'multiple_endings']);
  const event = IEEE1599_SCHEMA.elements.event;
  assert.equal(event.attributes.timing.defaultValue, 'null');
  assert.equal(event.attributes.id.type, 'ID');
  assert.equal(IEEE1599_SCHEMA.elements.rest.attributes.id.type, 'CDATA');
  assert.deepEqual(IEEE1599_SCHEMA.elements.chord.attributes.event_ref.targets, ['event']);
  assert.ok(IEEE1599_SCHEMA.elements.chord.layers.includes('logic'));
  assert.ok(Object.isFrozen(IEEE1599_SCHEMA.elements.chord.attributes));
});

test('DTD reader rejects unsupported or inconsistent declarations', () => {
  const imports = { entities: {}, elements: {} };
  assert.throws(() => parseDTD('<![INCLUDE[<!ELEMENT a EMPTY>]]>', imports), /onditional/);
  assert.throws(() => parseDTD('<!ELEMENT a (b)>', imports), /b/);
  const parsed = parseContentModel('(a, (b | c)*, d?)', imports);
  assert.equal(parsed.type, 'children');
});

/** @param {string} spec */
const matcher = (spec) => {
  const model = parseContentModel(spec, { entities: { M: 'midi' }, elements: {} });
  assert.equal(model.type, 'children');
  return new ContentMatcher(model.particle);
};
const symbols = (...names) => names.map((name) => ({ name, vocabulary: name.startsWith('midi:') ? 'midi' : 'ieee1599' }));

test('content-model NFA handles sequences, choices and occurrences', () => {
  const ieee = matcher('(general, logic, structural?, notational?, performance?, audio?)');
  assert.equal(ieee.match(symbols('general', 'logic')).valid, true);
  assert.equal(ieee.match(symbols('general', 'logic', 'audio')).valid, true);
  const missing = ieee.match(symbols('general'));
  assert.deepEqual([missing.valid, missing.failedAt, missing.expected], [false, 1, ['logic']]);
  const order = ieee.match(symbols('general', 'logic', 'audio', 'notational'));
  assert.equal(order.failedAt, 3);
  assert.deepEqual(order.expected, ['#end']);

  const measure = matcher('(voice+ | multiple_rest | measure_repeat?)');
  for (const content of [[], ['voice'], ['voice', 'voice'], ['multiple_rest'], ['measure_repeat']]) {
    assert.equal(measure.match(symbols(...content)).valid, true, content.join());
  }
  assert.equal(measure.match(symbols('voice', 'multiple_rest')).valid, false);

  const imported = matcher('(%M;)*');
  assert.equal(imported.match(symbols('midi:NoteOn', 'midi:NoteOff')).valid, true);
  assert.equal(imported.match(symbols('chord')).valid, false);
});

test('content-model matching stays linear for very long spines', () => {
  const spine = matcher('(event)+');
  const events = Array.from({ length: 200_000 }, () => ({ name: 'event', vocabulary: 'ieee1599' }));
  const started = performance.now();
  assert.equal(spine.match(events).valid, true);
  assert.ok(performance.now() - started < 2000);
});

test('attribute normalization, defaults, names and vocabulary boundaries', () => {
  assert.equal(normalizeAttribute('CDATA', ' a  b '), ' a  b ');
  assert.equal(normalizeAttribute('IDREFS', ' a  b '), 'a b');
  const attributes = effectiveAttributes('chord', 'ieee1599', [['event_ref', ' e1 '], ['stem_direction', 'up']]);
  assert.equal(attributes.event_ref, 'e1');
  assert.equal(attributes.beam_before, 'no');
  assert.equal('id' in attributes, false);
  assert.ok(XML_NAME.test('e_1.a-b') && !XML_NAME.test('1e') && XML_NMTOKEN.test('1e'));

  const element = (name, parent) => new IEEE1599Element({
    name, namespaceURI: null, vocabulary: vocabularyOf(name, parent), rawAttributes: [], attributes: {}, parent
  });
  const slur = element('slur', element('horizontal_symbols', null));
  assert.equal(vocabularyOf('svg', slur), 'svg');
  assert.equal(vocabularyOf('svg', element('chord', null)), 'unknown');
  const midiEvent = element('midi_event', null);
  assert.equal(vocabularyOf('NoteOn', midiEvent), 'midi');
  const svg = element('svg', slur);
  assert.equal(vocabularyOf('event', svg), 'svg');
  assert.equal(vocabularyOf('bogus', element('general', null)), 'unknown');
});
