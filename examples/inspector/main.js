import { parseIEEE1599Document, serializeIEEE1599Document } from '../../src/model/document.js';

/** @typedef {import('../../src/model/document.js').IEEE1599Document} IEEE1599Document */
/** @typedef {import('../../src/model/node.js').IEEE1599Element} IEEE1599Element */

const LAYERS = /** @type {const} */ (['general', 'logic', 'structural', 'notational', 'performance', 'audio']);
const MAX_SPINE_ROWS = 500;

/** @template {HTMLElement} T @param {string} id @param {{new(): T}} type */
function element(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing inspector element: ${id}`);
  return found;
}
const fileInput = element('file', HTMLInputElement);
const sample = element('sample', HTMLButtonElement);
const errorOutput = element('error', HTMLElement);
const summary = element('summary', HTMLElement);
const issues = element('issues', HTMLElement);
const layers = element('layers', HTMLElement);
const spine = element('spine', HTMLElement);
const linksTitle = element('links-title', HTMLElement);
const links = element('links', HTMLElement);

/** @param {string} tag @param {...(string | Node)} content */
function node(tag, ...content) {
  const created = document.createElement(tag);
  created.append(...content);
  return created;
}

/** @param {IEEE1599Element} item */
const label = (item) => {
  const id = item.attributes.id ?? item.attributes.event_ref;
  return `${item.path}${id ? ` [${id}]` : ''}`;
};

/** @param {IEEE1599Document} doc @param {string} id */
function showLinks(doc, id) {
  linksTitle.textContent = `Elements referencing Spine event ${id}:`;
  const grouped = doc.eventLinks(id);
  links.replaceChildren(...LAYERS.filter((layer) => grouped[layer].length).map((layer) =>
    node('li', `${layer}: `, grouped[layer].map(label).join(', '))));
}

/**
 * Render every panel for a parsed document.
 * @param {IEEE1599Document} doc
 * @param {string} xml Source text, used to report round-trip size.
 */
function show(doc, xml) {
  const errors = doc.issues.filter((issue) => issue.severity === 'error').length;
  const title = doc.general?.descendants('main_title')[0]?.text.trim() ?? 'Untitled';
  const serialized = serializeIEEE1599Document(doc);
  summary.textContent = `${title}: ${doc.valid ? 'valid' : 'invalid'} against IEEE 1599 DTD 1.0 (${errors} error(s), `
    + `${doc.issues.length - errors} warning(s)). ${doc.spine.length} Spine events, ${doc.los.staves.length} staves, `
    + `${doc.los.parts.length} parts, ${doc.ids.size} IDs. Serialized ${serialized.length} characters from ${xml.length}.`;
  issues.replaceChildren(...doc.issues.slice(0, 50).map((issue) => {
    const item = node('li', `${issue.code} at ${issue.path}: ${issue.message}`);
    item.className = issue.severity;
    return item;
  }));
  if (doc.issues.length > 50) issues.append(node('li', `… ${doc.issues.length - 50} more (see console)`));
  layers.replaceChildren(...LAYERS.map((name) => {
    const layer = doc.layer(name);
    const all = layer ? [layer, ...layer.descendants()] : [];
    const own = all.filter((item) => item.vocabulary === 'ieee1599').length;
    return node('tr', node('th', name), node('td', layer ? 'yes' : 'no'), node('td', String(own)), node('td', String(all.length - own)));
  }));
  spine.replaceChildren(...doc.spine.events.slice(0, MAX_SPINE_ROWS).map((event) => {
    const button = node('button', event.id);
    button.addEventListener('click', () => showLinks(doc, event.id));
    const symbols = doc.los.forEvent(event.id).map((symbol) => symbol.name).join(', ');
    return node('tr', node('td', button), node('td', event.timingSource ?? '(default)'), node('td', event.hposSource ?? '(default)'),
      node('td', String(event.vtu ?? '?')), node('td', String(event.vpx ?? '?')), node('td', String(event.group)), node('td', symbols));
  }));
  links.replaceChildren();
  linksTitle.textContent = 'Choose a Spine event to list the elements that reference it in each layer.';
  console.info('[inspector] %s: %d findings', title, doc.issues.length, doc.issues);
}

/** @param {string} xml @param {string} baseURL */
function inspect(xml, baseURL) {
  errorOutput.textContent = '';
  try {
    // Lenient so invalid files can still be inspected; findings are listed instead of thrown.
    show(parseIEEE1599Document(xml, { strict: false, baseURL }), xml);
  } catch (reason) {
    errorOutput.textContent = reason instanceof Error ? reason.message : String(reason);
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (file) inspect(await file.text(), location.href);
});
sample.addEventListener('click', async () => {
  try {
    const response = await fetch('../../tests/fixtures/all-layers.xml');
    if (!response.ok) throw new Error(`Sample fetch failed: HTTP ${response.status}`);
    inspect(await response.text(), response.url);
  } catch (reason) {
    errorOutput.textContent = reason instanceof Error ? reason.message : String(reason);
  }
});
