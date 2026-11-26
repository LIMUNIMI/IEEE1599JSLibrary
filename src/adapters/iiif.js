/**
 * Read-only IIIF Image API 2/3 image information resolution.
 * @module ieee1599/adapters/iiif
 */

/**
 * Resolve a service base URL or `info.json` into a full-image request. No
 * cropping, rotation, resizing, encoding or manifest interpretation is done
 * by the client. Coordinates remain pixels of the underlying full image.
 * @param {string | URL} source Absolute IIIF service or information URL.
 * @param {{signal?: AbortSignal}} [options] Cancels metadata loading.
 * @returns {Promise<{url: string, width: number, height: number, version: 2 | 3}>}
 * @throws {Error} For HTTP failures, unsupported versions or invalid metadata.
 */
export async function loadIIIFImage(source, { signal } = {}) {
  const infoURL = new URL(source);
  if (!/^https?:$/.test(infoURL.protocol)) throw new Error('IIIF requires an HTTP(S) URL');
  if (!infoURL.pathname.endsWith('/info.json')) {
    infoURL.pathname = `${infoURL.pathname.replace(/\/$/, '')}/info.json`;
  }
  const response = await fetch(infoURL, { signal });
  if (!response.ok) throw new Error(`IIIF information fetch failed: HTTP ${response.status}`);
  const info = await response.json();
  const contexts = Array.isArray(info['@context']) ? info['@context'] : [info['@context']];
  const version = contexts.some((value) => typeof value === 'string' && /^https?:\/\/iiif.io\/api\/image\/3\/context.json$/.test(value))
    ? 3 : contexts.some((value) => typeof value === 'string' && /^https?:\/\/iiif.io\/api\/image\/2\/context.json$/.test(value)) ? 2 : null;
  if (!version || !Number.isSafeInteger(info.width) || info.width <= 0
    || !Number.isSafeInteger(info.height) || info.height <= 0) {
    throw new Error('Unsupported or invalid IIIF Image API information');
  }
  const id = version === 3 ? info.id : info['@id'];
  if (typeof id !== 'string' || !id) throw new Error('IIIF information is missing its service ID');
  const imageURL = new URL(id, response.url || infoURL);
  if (!/^https?:$/.test(imageURL.protocol)) throw new Error('IIIF requires an HTTP(S) service ID');
  imageURL.pathname = `${imageURL.pathname.replace(/\/$/, '')}/full/${version === 3 ? 'max' : 'full'}/0/default.jpg`;
  return { url: imageURL.href, width: info.width, height: info.height, version };
}
