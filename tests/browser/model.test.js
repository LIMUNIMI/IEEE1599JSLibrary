import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { startBrowserHarness } from './harness.js';

let harness;
let browser;
let base;
let xml;
let page;

before(async () => {
  xml = await readFile(new URL('../fixtures/all-layers.xml', import.meta.url), 'utf8');
  harness = await startBrowserHarness();
  ({ browser, base } = harness);
  page = await browser.newPage();
  await page.goto(base);
});

after(async () => {
  await harness?.close();
});

/**
 * Run a function in the page with the library loaded as `lib`.
 * @template T
 * @param {(lib: any, source: string) => T} fn
 * @param {string} [source]
 */
const run = (fn, source = xml) => page.evaluate(async ([body, text]) => {
  const lib = await import('/src/index.js');
  return new Function('lib', 'source', `return (${body})(lib, source);`)(lib, text);
}, [fn.toString(), source]);

test('all six layers are exposed with exact text, mixed content and metadata', async () => {
  const result = await run(async (lib) => {
    const doc = await lib.loadIEEE1599Document('/tests/fixtures/all-layers.xml');
    const layers = ['general', 'logic', 'structural', 'notational', 'performance', 'audio'];
    const description = doc.general.element('description');
    return {
      valid: doc.valid,
      issues: doc.issues.length,
      layers: layers.map((name) => doc[name]?.name ?? null),
      layerOf: layers.map((name) => doc.layer(name).descendants()[0]?.layer),
      title: description.element('main_title').text,
      workTitle: description.element('work_title').text,
      authors: description.elements('author').map((author) => [author.text, author.attributes.type]),
      notes: doc.general.element('notes').text,
      notesChildren: doc.general.element('notes').children.map((child) => child.type),
      resolved: doc.resolveURL(doc.general.descendants('related_file')[0].attributes.file_name),
      doctype: [doc.doctype.name, doc.doctype.systemId, doc.doctype.internalSubset],
      prolog: doc.prolog.map((node) => node.type),
      epilog: doc.epilog.map((node) => node.value),
      declaration: doc.xmlDeclaration
    };
  });
  assert.equal(result.valid, true);
  assert.equal(result.issues, 0);
  assert.deepEqual(result.layers, ['general', 'logic', 'structural', 'notational', 'performance', 'audio']);
  assert.deepEqual(result.layerOf, ['general', 'logic', 'structural', 'notational', 'performance', 'audio']);
  assert.equal(result.title, 'Six Layers');
  assert.equal(result.workTitle, 'Study & Variations');
  assert.deepEqual(result.authors, [['A. Composer', 'composer'], ['B. Poet', 'lyricist']]);
  assert.equal(result.notes, 'Mixed <raw> & text content');
  assert.deepEqual(result.notesChildren, ['text', 'cdata', 'text']);
  assert.equal(result.resolved, `${base}tests/fixtures/notes/preface.pdf`);
  assert.deepEqual(result.doctype, ['ieee1599', 'https://www.lim.di.unimi.it/IEEE/ieee1599.dtd', null]);
  assert.deepEqual(result.prolog, ['comment', 'processing-instruction']);
  assert.deepEqual(result.epilog, [' trailing comment ']);
  assert.equal(result.declaration, '<?xml version="1.0" encoding="UTF-8"?>');
});

test('Spine decodes VTU/VPX offsets, null values and simultaneity groups', async () => {
  const spine = await run((lib, source) => {
    const { spine } = lib.parseIEEE1599Document(source);
    const e5 = spine.get('e5');
    return {
      ids: spine.events.map((event) => event.id),
      vtu: spine.events.map((event) => event.vtu),
      vpx: spine.events.map((event) => event.vpx),
      timing: spine.events.map((event) => event.timing),
      groups: spine.groups.map((group) => group.map((event) => event.id)),
      simultaneous: spine.simultaneous('e2').map((event) => event.id),
      e5: [e5.timingSource, e5.element.attributes.timing, e5.element.isSpecified('timing')],
      index: [spine.indexOf('e4'), spine.indexOf('missing'), spine.has('e6'), spine.length],
      iterated: [...spine].length
    };
  });
  assert.deepEqual(spine.ids, ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  assert.deepEqual(spine.vtu, [0, 0, 1024, 1536, null, null]);
  assert.deepEqual(spine.vpx, [0, 0, 40, 60, null, null]);
  assert.deepEqual(spine.timing, [0, 0, 1024, 512, null, 256]);
  assert.deepEqual(spine.groups, [['e1', 'e2'], ['e3'], ['e4'], ['e5'], ['e6']]);
  assert.deepEqual(spine.simultaneous, ['e1', 'e2']);
  assert.deepEqual(spine.e5, [null, 'null', false]);
  assert.deepEqual(spine.index, [3, -1, true, 6]);
  assert.equal(spine.iterated, 6);
});

test('LOS indexes symbols by event, staff, part and measure', async () => {
  const los = await run((lib, source) => {
    const doc = lib.parseIEEE1599Document(source);
    const { los } = doc;
    const symbol = (id, name) => los.forEvent(id).find((element) => element.name === name);
    return {
      staves: los.staves.map((staff) => staff.attributes.id),
      parts: los.parts.map((part) => part.attributes.id),
      voiceItems: los.voiceItems.map((item) => item.attributes.id),
      e1: los.forEvent('e1').map((element) => element.name),
      staffOf: [symbol('e1', 'chord'), symbol('e2', 'rest'), symbol('e4', 'chord')].map((element) => los.staffOf(element).attributes.id),
      part: los.partOf(symbol('e5', 'chord')).attributes.id,
      measure: los.measureOf(symbol('e5', 'chord')).attributes.number,
      none: los.forEvent('missing').length,
      pitches: symbol('e3', 'chord').descendants('pitch').map((pitch) => `${pitch.attributes.step}${pitch.attributes.octave}`)
    };
  });
  assert.deepEqual(los.staves, ['s1', 's2']);
  assert.deepEqual(los.parts, ['p1']);
  assert.deepEqual(los.voiceItems, ['v1', 'v2']);
  assert.deepEqual(los.e1, ['clef', 'chord']);
  assert.deepEqual(los.staffOf, ['s1', 's2', 's2']);
  assert.equal(los.part, 'p1');
  assert.equal(los.measure, '2');
  assert.equal(los.none, 0);
  assert.deepEqual(los.pitches, ['E5', 'G5']);
});

test('ID and reference indexes link every layer to Spine events', async () => {
  const links = await run((lib, source) => {
    const doc = lib.parseIEEE1599Document(source);
    const grouped = doc.eventLinks('e1');
    return {
      byId: [doc.byId('v1').name, doc.byId('seg1').name, doc.byId('nope')],
      references: doc.referencesTo('e1').map(({ element, attribute }) => `${element.name}@${attribute}`),
      grouped: Object.fromEntries(Object.entries(grouped).map(([layer, elements]) => [layer, elements.map((element) => element.name)])),
      staffRefs: doc.referencesTo('s2').map(({ element }) => element.name)
    };
  });
  assert.deepEqual(links.byId, ['voice_item', 'segment', null]);
  assert.deepEqual(links.references, [
    'clef@event_ref', 'chord@event_ref', 'slur@start_event_ref', 'syllable@start_event_ref', 'segment_event@event_ref',
    'graphic_event@event_ref', 'notation_event@event_ref', 'midi_event@event_ref', 'track_event@event_ref'
  ]);
  assert.deepEqual(links.grouped, {
    general: [], logic: ['clef', 'chord', 'slur', 'syllable'], structural: ['segment_event'],
    notational: ['graphic_event', 'notation_event'], performance: ['midi_event'], audio: ['track_event']
  });
  assert.deepEqual(links.staffRefs, ['voice_item', 'rest']);
});

test('defaults are applied without being marked specified; imports stay opaque', async () => {
  const result = await run((lib, source) => {
    const doc = lib.parseIEEE1599Document(source.replace('stem_direction="up"', 'stem_direction=" up "'));
    const chord = doc.los.forEvent('e1').find((element) => element.name === 'chord');
    const svg = doc.logic.descendants('svg')[0];
    const note = doc.performance.descendants('NoteOn')[0];
    return {
      chord: [chord.attributes.beam_before, chord.isSpecified('beam_before'), chord.attributes.stem_direction, chord.rawAttributes.find(([name]) => name === 'stem_direction')[1]],
      staves: doc.los.staves.map((staff) => [staff.attributes.line_number, staff.isSpecified('line_number')]),
      svg: [svg.vocabulary, svg.namespaceURI, svg.declaration, svg.elements()[0].vocabulary, svg.layer],
      note: [note.vocabulary, note.attributes.Note, note.path],
      declaration: chord.declaration.contentSource,
      unknownAttribute: chord.attribute('nope')
    };
  });
  assert.deepEqual(result.chord, ['no', false, 'up', ' up ']);
  assert.deepEqual(result.staves, [['5', false], ['5', true]]);
  assert.deepEqual(result.svg, ['svg', 'http://www.w3.org/2000/svg', null, 'svg', 'logic']);
  assert.deepEqual(result.note, ['midi', '72', '/ieee1599[1]/performance[1]/midi_instance[1]/midi_mapping[1]/midi_event_sequence[1]/midi_event[1]/NoteOn[1]']);
  assert.equal(result.declaration, '(duration, augmentation_dots?, (notehead+ | repetition), articulation?)');
  assert.equal(result.unknownAttribute, null);
});

test('imported SVG/MIDI subtrees are typed boundaries with traversal and ID access', async () => {
  const result = await run((lib, source) => {
    const doc = lib.parseIEEE1599Document(source.replace('<svg xmlns=', '<svg id="curve" xmlns=').replace('<path d=', '<path id="curve" d='));
    const record = (item) => [item.vocabulary, item.element.name, item.host.name, item.entryPoint, item.entity, item.title, item.publicId, item.expectedNamespace, item.element.namespaceURI];
    const path = doc.logic.descendants('path')[0];
    return {
      valid: doc.valid,
      all: doc.imports().map(record),
      svgOnly: doc.imports('svg').length,
      midiOnly: doc.imports('midi').map((item) => item.host.path),
      nested: [path.vocabulary, path.importRoot.name, lib.describeImport(path), lib.isImportedElement(path)],
      ieeeRoot: doc.byId('e1').importRoot,
      ids: doc.importedById('curve').map((element) => element.name),
      separateFromIeeeIds: doc.byId('curve'),
      missing: doc.importedById('nope').length
    };
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.all, [
    ['svg', 'svg', 'slur', 'svg', 'svg', 'SVG 1.1', '-//W3C//DTD SVG 1.1//EN', 'http://www.w3.org/2000/svg', 'http://www.w3.org/2000/svg'],
    ['midi', 'NoteOn', 'midi_event', '%MIDIChannelMessage;', 'mididtd', 'MIDIEvents 1.0', '-//MIDI Manufacturers Association//DTD MIDIEvents 1.0//EN', null, null]
  ]);
  assert.equal(result.svgOnly, 1);
  assert.deepEqual(result.midiOnly, ['/ieee1599[1]/performance[1]/midi_instance[1]/midi_mapping[1]/midi_event_sequence[1]/midi_event[1]']);
  assert.deepEqual(result.nested, ['svg', 'svg', null, true]);
  assert.equal(result.ieeeRoot, null);
  assert.deepEqual(result.ids, ['svg', 'path']);
  assert.equal(result.separateFromIeeeIds, null);
  assert.equal(result.missing, 0);
});

test('serialization round-trips data, keeps unspecified defaults implicit and is idempotent', async () => {
  const result = await run((lib, source) => {
    const dump = (node) => node.type === 'element'
      ? [node.name, node.vocabulary, node.rawAttributes, node.children.map(dump)]
      : [node.type, node.value ?? `${node.target} ${node.data}`];
    const first = lib.parseIEEE1599Document(source);
    const text = lib.serializeIEEE1599Document(first);
    const second = lib.parseIEEE1599Document(text);
    const special = lib.parseIEEE1599Document(source.replace('Preface', 'a&quot;b&#9;c&lt;d&#10;e').replace('Op. 1', 'x]]&gt;y'));
    const specialAgain = lib.parseIEEE1599Document(lib.serializeIEEE1599Document(special));
    return {
      same: JSON.stringify(dump(first.root)) === JSON.stringify(dump(second.root)),
      idempotent: lib.serializeIEEE1599Document(second) === text,
      prolog: JSON.stringify([second.prolog, second.epilog, second.doctype.source]) === JSON.stringify([first.prolog, first.epilog, first.doctype.source]),
      noDefaults: !text.includes('beam_before="no"') && !text.includes('timing="null"'),
      special: [specialAgain.general.descendants('related_file')[0].attributes.description, specialAgain.general.descendants('work_number')[0].text],
      start: text.split('\n').slice(0, 4).join('\n')
    };
  });
  assert.equal(result.same, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.prolog, true);
  assert.equal(result.noDefaults, true);
  assert.deepEqual(result.special, ['a"b\tc<d\ne', 'x]]>y']);
  assert.match(result.start, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!-- Synthetic IEEE 1599.* -->\n<\?app-hint mode="test"\?>\n<!DOCTYPE ieee1599 SYSTEM/);
});

test('strict mode throws every DTD validity error; lenient mode reports them', async () => {
  const cases = await run((lib, source) => {
    const variants = {
      'attribute-required': source.replace('<ieee1599 version="1.0"', '<ieee1599'),
      'attribute-enumeration': source.replace('stem_direction="up"', 'stem_direction="sideways"'),
      'attribute-undeclared': source.replace('<event id="e6"', '<event foo="1" id="e6"'),
      'attribute-syntax': source.replace('<segment_event event_ref="e3"/>', '<segment_event event_ref="3 e"/>'),
      'id-duplicate': source.replace('id="e2"', 'id="e1"'),
      'idref-unresolved': source.replace('<track_event start_time="0.75" event_ref="e4"/>', '<track_event start_time="0.75" event_ref="e9"/>'),
      'content-not-empty': source.replace('<augmentation_dots/>', '<augmentation_dots>x</augmentation_dots>'),
      'content-invalid': source.replace('<duration num="1" den="2"/><notehead><pitch step="C" octave="5"/></notehead>', '<notehead><pitch step="C" octave="5"/></notehead><duration num="1" den="2"/>'),
      'text-not-allowed': source.replace('<spine>', '<spine>stray'),
      'element-undeclared': source.replace('<genres>', '<bogus><inner/></bogus><genres>'),
      'internal-subset': source.replace('ieee1599.dtd">', 'ieee1599.dtd" [<!ATTLIST event extra CDATA #IMPLIED>]>'),
      'doctype-mismatch': source.replace('<!DOCTYPE ieee1599', '<!DOCTYPE other')
    };
    return Object.entries(variants).map(([code, text]) => {
      let strict;
      try { lib.parseIEEE1599Document(text); strict = 'no error'; } catch (error) {
        strict = [error.name, error instanceof lib.IEEE1599ValidationError, error.issues?.some((issue) => issue.code === code) ?? error.message];
      }
      const lenient = lib.parseIEEE1599Document(text, { strict: false });
      const issue = lenient.issues.find((item) => item.code === code);
      return { code, strict, lenient: [lenient.valid, issue?.severity, typeof issue?.message, issue ? 'path' in issue : false], elementIssues: lenient.issues.filter((item) => item.code === 'element-undeclared').length };
    });
  });
  for (const item of cases) {
    assert.deepEqual(item.strict, ['IEEE1599ValidationError', true, true], item.code);
    assert.deepEqual(item.lenient, [false, 'error', 'string', true], item.code);
  }
  assert.equal(cases.find((item) => item.code === 'element-undeclared').elementIssues, 1, 'unknown subtree reported once');
});

test('semantic findings are warnings that do not fail strict parsing', async () => {
  const result = await run((lib, source) => {
    const text = source
      .replace('voice_ref="v1"', 'voice_ref="p1"')
      .replace('<event id="e6" timing="256"', '<event id="e6" timing="1.5"')
      .replace('<!DOCTYPE ieee1599 SYSTEM "https://www.lim.di.unimi.it/IEEE/ieee1599.dtd">', '');
    const doc = lib.parseIEEE1599Document(text);
    return { valid: doc.valid, codes: doc.issues.map((issue) => `${issue.code}:${issue.severity}`), vtu: doc.spine.get('e6').vtu };
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.codes.sort(), ['doctype-missing:warning', 'reference-target:warning', 'spine-timing:warning']);
  assert.equal(result.vtu, null);
});

test('rejects entities, malformed XML, wrong roots and failed requests', async () => {
  const errors = await run(async (lib) => {
    const cases = [
      () => lib.parseIEEE1599Document('<!DOCTYPE ieee1599 [<!ENTITY x "x">]><ieee1599/>'),
      () => lib.parseIEEE1599Document('<ieee1599>'),
      () => lib.parseIEEE1599Document('<score version="1.0"/>'),
      () => lib.loadIEEE1599Document('/tests/fixtures/missing.xml')
    ];
    return Promise.all(cases.map(async (fn) => {
      try { await fn(); return null; } catch (error) { return error.message; }
    }));
  });
  assert.match(errors[0], /entity declarations/);
  assert.match(errors[1], /Malformed/);
  assert.match(errors[2], /invalid root/);
  assert.match(errors[3], /HTTP 404/);
});

test('legacy minimal fixture is reported, not silently accepted, by the full model', async () => {
  const result = await run(async (lib) => {
    const doc = await lib.loadIEEE1599Document('/tests/fixtures/minimal.xml', { strict: false });
    const projection = await lib.loadIEEE1599('/tests/fixtures/minimal.xml');
    return { valid: doc.valid, codes: [...new Set(doc.issues.map((issue) => issue.code))].sort(), spine: projection.spine.length };
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.codes, ['attribute-required', 'content-invalid', 'doctype-system-id', 'element-undeclared', 'idref-unresolved']);
  assert.equal(result.spine, 2);
});

const catedral = new URL('../../examples/la-catedral/local/catedral.xml', import.meta.url);
test('La Catedral real fixture validates strictly against the vendored DTD', { skip: !existsSync(catedral) && 'Prepare the local La Catedral fixture first' }, async () => {
  const result = await run(async (lib) => {
    const doc = await lib.loadIEEE1599Document('/examples/la-catedral/local/catedral.xml');
    const projection = await lib.loadIEEE1599('/examples/la-catedral/local/catedral.xml');
    const roundTrip = lib.parseIEEE1599Document(lib.serializeIEEE1599Document(doc));
    return {
      codes: doc.issues.map((issue) => `${issue.code}:${issue.severity}`),
      events: doc.spine.length,
      projectionEvents: projection.spine.length,
      groups: doc.spine.groups.length,
      layers: ['general', 'logic', 'structural', 'notational', 'performance', 'audio'].filter((name) => doc[name]),
      tracks: doc.audio.elements('track').length,
      roundTrip: roundTrip.spine.length === doc.spine.length && roundTrip.root.descendants().length === doc.root.descendants().length
    };
  });
  assert.deepEqual(result.codes, ['doctype-system-id:warning']);
  assert.equal(result.events, result.projectionEvents);
  assert.ok(result.groups > 0 && result.groups <= result.events);
  assert.deepEqual(result.layers, ['general', 'logic', 'notational', 'audio']);
  assert.equal(result.tracks, 3);
  assert.equal(result.roundTrip, true);
});
