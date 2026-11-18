const supported = new Set([
  'ieee1599', 'general', 'description', 'main_title', 'work_title', 'work_number',
  'author', 'related_file', 'logic', 'spine', 'event', 'los', 'staff_list',
  'staff', 'part', 'voice_list', 'voice_item', 'measure', 'voice', 'chord',
  'rest', 'duration', 'notehead', 'pitch', 'notational', 'graphic_instance_group',
  'graphic_instance', 'graphic_event', 'audio', 'track', 'track_indexing',
  'track_event'
]);

/** @param {Element} element @param {string} name */
function required(element, name) {
  const value = element.getAttribute(name);
  if (value === null || value.trim() === '') throw new Error(`Missing ${name} on ${element.tagName}`);
  return value;
}

/** @param {Element} element @param {string} name */
function numberAttribute(element, name) {
  const value = Number(required(element, name));
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name} on ${element.tagName}`);
  return value;
}

/** @param {Element} element @param {string} name */
function optionalNumber(element, name) {
  return element.hasAttribute(name) ? numberAttribute(element, name) : null;
}

/** @param {Element} element @param {string} name */
function text(element, name) {
  return element.getElementsByTagName(name)[0]?.textContent?.trim() ?? null;
}

/** @param {string} path @param {string | undefined} baseURL */
function resolve(path, baseURL) {
  try {
    return new URL(path, baseURL).href;
  } catch {
    throw new Error(`Cannot resolve media path ${path}; provide an absolute baseURL`);
  }
}

/**
 * Parse the player-relevant IEEE 1599 subset using the browser's DOMParser.
 * Unsupported element names are reported once in `warnings`. This is not a DTD
 * validator. XML entity declarations are rejected rather than expanded.
 * @param {string} xml
 * @param {{baseURL?: string}} [options]
 */
export function parseIEEE1599(xml, options = {}) {
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser is not available');
  if (/<!ENTITY\b/i.test(xml)) throw new Error('XML entity declarations are not supported');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.documentElement?.tagName !== 'ieee1599') {
    throw new Error('Malformed IEEE 1599 XML or invalid root element');
  }
  const root = document.documentElement;
  const spine = Array.from(root.querySelectorAll('logic > spine > event'), (element) => ({
    id: required(element, 'id'),
    timing: optionalNumber(element, 'timing'),
    hpos: optionalNumber(element, 'hpos')
  }));
  const ids = new Set(spine.map((event) => event.id));
  if (ids.size !== spine.length) throw new Error('Duplicate spine event id');
  /** @param {Element} element */
  const ref = (element) => {
    const id = required(element, 'event_ref');
    if (!ids.has(id)) throw new Error(`Unknown spine event: ${id}`);
    return id;
  };
  const general = root.querySelector('general');
  const metadata = {
    mainTitle: general ? text(general, 'main_title') : null,
    workTitle: general ? text(general, 'work_title') : null,
    workNumber: general ? text(general, 'work_number') : null,
    authors: general ? Array.from(general.getElementsByTagName('author'), (author) => ({
      name: author.textContent?.trim() ?? '', type: author.getAttribute('type')
    })) : [],
    relatedFiles: general ? Array.from(general.getElementsByTagName('related_file'), (file) => ({
      url: resolve(required(file, 'file_name'), options.baseURL),
      description: file.getAttribute('description')
    })) : []
  };
  const logicalEvents = Array.from(root.querySelectorAll('logic los chord, logic los rest'), (element) => {
    const duration = element.querySelector('duration');
    const denominator = duration ? numberAttribute(duration, 'den') : null;
    if (denominator !== null && denominator <= 0) throw new Error('Invalid duration denominator');
    return {
      eventRef: ref(element),
      kind: element.tagName,
      voice: element.parentElement?.getAttribute('voice_item_ref') ?? null,
      duration: duration ? { numerator: numberAttribute(duration, 'num'), denominator } : null,
      pitches: Array.from(element.querySelectorAll('notehead > pitch'), (pitch) => ({
        step: required(pitch, 'step'),
        octave: numberAttribute(pitch, 'octave'),
        accidental: pitch.getAttribute('actual_accidental')
      }))
    };
  });
  const graphicInstances = Array.from(root.querySelectorAll('notational graphic_instance_group'), (group) => ({
    description: group.getAttribute('description'),
    pages: Array.from(group.querySelectorAll('graphic_instance'), (page) => ({
      position: numberAttribute(page, 'position_in_group'),
      url: resolve(required(page, 'file_name'), options.baseURL),
      events: Array.from(page.querySelectorAll('graphic_event'), (event) => {
        const x1 = numberAttribute(event, 'upper_left_x');
        const y1 = numberAttribute(event, 'upper_left_y');
        const x2 = numberAttribute(event, 'lower_right_x');
        const y2 = numberAttribute(event, 'lower_right_y');
        if (x2 < x1 || y2 < y1) throw new Error('Invalid graphic event rectangle');
        return { eventRef: ref(event), x1, y1, x2, y2 };
      })
    })).sort((a, b) => a.position - b.position)
  }));
  const audioTracks = Array.from(root.querySelectorAll('audio track'), (track) => ({
    url: resolve(required(track, 'file_name'), options.baseURL),
    format: track.getAttribute('file_format'),
    encoding: track.getAttribute('encoding_format'),
    events: Array.from(track.querySelectorAll('track_indexing'), (index) => {
      if (required(index, 'timing_type') !== 'seconds') throw new Error('Unsupported track timing type');
      return Array.from(index.querySelectorAll('track_event'), (event) => {
        const time = numberAttribute(event, 'start_time');
        if (time < 0) throw new Error('Negative track event time');
        return { eventRef: ref(event), time };
      });
    }).flat()
  }));
  const warnings = [...new Set(Array.from(root.querySelectorAll('*'), (element) => element.tagName)
    .filter((name) => !supported.has(name)))].map((name) => `Unsupported XML element: ${name}`);
  return { metadata, spine, logicalEvents, graphicInstances, audioTracks, warnings };
}

/**
 * Fetch and parse an IEEE 1599 document, resolving asset URLs against the final
 * response URL, including redirects.
 * @param {string} url
 * @param {{signal?: AbortSignal}} [options]
 */
export async function loadIEEE1599(url, options = {}) {
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`IEEE 1599 fetch failed: HTTP ${response.status}`);
  return parseIEEE1599(await response.text(), { baseURL: response.url });
}
