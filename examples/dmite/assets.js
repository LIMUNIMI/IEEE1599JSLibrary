/**
 * Resolve private example assets from a browser folder selection or the
 * same-origin assets directory. Folder selections never make network requests.
 * @module examples/dmite/assets
 */
import { decodeXML } from '../../src/model/document.js';

const defaultRoot = new URL('./assets/', import.meta.url);

/**
 * Open a private asset source. URLs under the virtual assets directory are
 * also used as the IEEE 1599 document's base for relative references.
 * @param {Iterable<File>} [files] Native directory-picker files; omit for HTTP.
 * @param {{baseURL?: string, documentName?: string}} [options] Virtual folder
 *   URL and document path for another client-side example.
 */
export function createAssetSource(files, { baseURL = defaultRoot.href, documentName = 'variationsserieuses.xml' } = {}) {
  const root = new URL(baseURL);
  if (!root.pathname.endsWith('/') || root.search || root.hash) throw new Error('Asset base must be a folder URL');
  /** @type {Map<string, File> | undefined} */
  const local = files ? new Map() : undefined;
  /** @type {Map<string, string>} */
  const urls = new Map();
  let folder;
  if (local && files) {
    for (const file of files) {
      const [selected, ...parts] = file.webkitRelativePath.split('/');
      const path = parts.join('/');
      folder ??= selected;
      if (!path || selected !== folder || local.has(path)) throw new Error('Select a single folder containing the assets');
      local.set(path, file);
    }
  }

  /**
   * Resolve a path within the selected or served assets directory.
   * @param {string} path
   * @returns {{url: URL, file: File | undefined}}
   */
  function resolve(path) {
    const url = new URL(path, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || url.search || url.hash) {
      throw new Error('Assets must be inside the selected assets folder');
    }
    const key = decodeURIComponent(url.pathname.slice(root.pathname.length));
    const file = local?.get(key);
    if (local && !file) throw new Error(`Missing asset: ${key}`);
    return { url, file };
  }

  /**
   * @template T
   * @param {string} path Relative asset path or absolute projected asset URL.
   * @param {(url: string) => Promise<T>} read Operation that finishes using the URL.
   * @returns {Promise<T>}
   */
  async function use(path, read) {
    const { url, file } = resolve(path);
    if (!file) return read(url.href);
    const objectURL = URL.createObjectURL(file);
    try {
      return await read(objectURL);
    } finally {
      URL.revokeObjectURL(objectURL);
    }
  }

  /**
   * Open long-lived media from its File or URL without creating an object URL.
   * @template T
   * @param {string} path
   * @param {(source: File | string) => Promise<T>} open
   * @returns {Promise<T>}
   */
  function media(path, open) {
    const { url, file } = resolve(path);
    return open(file ?? url.href);
  }

  return {
    documentURL: new URL(documentName.split('/').map(encodeURIComponent).join('/'), root).href,
    use,
    media,
    /**
     * Keep an image URL alive until the source is disposed.
     * @param {string} path Relative path or projected asset URL.
     * @returns {string} Local Blob URL, or a served URL in HTTP mode.
     */
    imageURL(path) {
      const { url, file } = resolve(path);
      if (!file) return url.href;
      let objectURL = urls.get(url.href);
      if (!objectURL) {
        objectURL = URL.createObjectURL(file);
        urls.set(url.href, objectURL);
      }
      return objectURL;
    },
    /** Revoke all persistent image URLs; no files are stored outside memory. */
    dispose() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
    /**
     * Read one XML file and report HTTP errors with the asset name.
     * @param {string} name
     * @param {AbortSignal} signal
     * @returns {Promise<string>}
     */
    text(name, signal) {
      return media(name, async (input) => {
        signal.throwIfAborted();
        if (typeof input !== 'string') {
          const bytes = await input.arrayBuffer();
          signal.throwIfAborted();
          return decodeXML(bytes);
        }
        const response = await fetch(input, { signal, redirect: 'error' });
        if (!response.ok) throw new Error(`Could not load ${name}: HTTP ${response.status}`);
        return decodeXML(await response.arrayBuffer(), response.headers.get('Content-Type'));
      });
    }
  };
}
