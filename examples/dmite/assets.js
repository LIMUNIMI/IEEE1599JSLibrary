/**
 * Resolve private example assets from a browser folder selection or the
 * same-origin assets directory. Folder selections never make network requests.
 * @module examples/dmite/assets
 */
const root = new URL('./assets/', import.meta.url);

/**
 * Open a private asset source. URLs under the virtual assets directory are
 * also used as the IEEE 1599 document's base for relative references.
 * @param {Iterable<File>} [files] Native directory-picker files; omit for HTTP.
 */
export function createAssetSource(files) {
  /** @type {Map<string, File> | undefined} */
  const local = files ? new Map() : undefined;
  if (local && files) {
    for (const file of files) {
      const path = file.webkitRelativePath.split('/').slice(1).join('/');
      if (!path || local.has(path)) throw new Error('Select a single folder containing the DmITE assets');
      local.set(path, file);
    }
  }

  /**
   * @template T
   * @param {string} path Relative asset path or absolute projected asset URL.
   * @param {(url: string) => Promise<T>} read Operation that finishes using the URL.
   * @returns {Promise<T>}
   */
  async function use(path, read) {
    const url = new URL(path, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || url.search || url.hash) {
      throw new Error('DmITE assets must be inside the selected assets folder');
    }
    const key = decodeURIComponent(url.pathname.slice(root.pathname.length));
    const file = local?.get(key);
    if (local && !file) throw new Error(`Missing asset: ${key}`);
    if (!file) return read(url.href);
    const objectURL = URL.createObjectURL(file);
    try {
      return await read(objectURL);
    } finally {
      URL.revokeObjectURL(objectURL);
    }
  }

  return {
    documentURL: new URL('variationsserieuses.xml', root).href,
    use,
    /**
     * Read one DmITE XML file and report HTTP errors with the asset name.
     * @param {string} name
     * @param {AbortSignal} signal
     * @returns {Promise<string>}
     */
    text(name, signal) {
      return use(name, async (url) => {
        const response = await fetch(url, { signal, redirect: 'error' });
        if (!response.ok) throw new Error(`Could not load ${name}: HTTP ${response.status}`);
        return response.text();
      });
    }
  };
}
