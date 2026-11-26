/**
 * Static guide renderer and publication allowlist. Never scan asset folders.
 * @module tools/docs/site
 */
import { Marked } from 'marked';

/** Public example files, enumerated so local files cannot enter the site. */
export const EXAMPLE_FILES = [
  'examples/index.html', 'examples/main.js', 'examples/score.svg',
  'examples/inspector/index.html', 'examples/inspector/main.js',
  'examples/starter/index.html', 'examples/starter/main.js',
  'examples/embed/index.html', 'examples/embed/main.js',
  'examples/streaming/index.html', 'examples/streaming/main.js',
  'examples/shared/score.js', 'examples/shared/video.js',
  'examples/dmite/index.html', 'examples/dmite/style.css',
  'examples/dmite/main.js', 'examples/dmite/assets.js', 'examples/dmite/model.js'
];

/**
 * Convert source-document links without changing fragments or external URLs.
 * @param {string} href Markdown link.
 * @returns {string} Link in the generated site.
 */
export function siteLink(href) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return href;
  return href.replace(/\.md(?=[?#]|$)/i, '.html');
}

/** @param {string} text @returns {string} Escaped text for HTML attributes. */
function escape(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

/**
 * Render one repository guide with relative navigation and stable heading IDs.
 * @param {string} markdown Source Markdown.
 * @param {string} root Relative link to the site root, such as `../`.
 * @returns {string} Complete HTML page, with no remote scripts/fonts/styles.
 */
export function renderGuide(markdown, root) {
  const headings = new Set();
  const parser = new Marked({
    renderer: {
      link(token) {
        return `<a href="${escape(siteLink(token.href))}"${token.title ? ` title="${escape(token.title)}"` : ''}>${this.parser.parseInline(token.tokens)}</a>`;
      },
      heading(token) {
        const text = this.parser.parseInline(token.tokens, this.parser.textRenderer);
        const base = text.toLowerCase().replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, '')
          .replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');
        let id = base;
        for (let count = 1; headings.has(id); count++) id = `${base}-${count}`;
        headings.add(id);
        return `<h${token.depth} id="${escape(id)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>`;
      }
    }
  });
  const title = markdown.match(/^# (.+)$/m)?.[1] ?? 'IEEE1599JSLibrary';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(title)}</title><link rel="stylesheet" href="${root}site.css"></head>
<body><nav aria-label="Documentation"><a href="${root}index.html">IEEE1599JSLibrary</a>
<a href="${root}api/index.html">API reference</a><a href="${root}docs/build-your-player.html">Build your player</a><a href="${root}docs/getting-started.html">Getting started</a>
<a href="${root}examples/dmite/index.html">DmITE</a><a href="${root}CHANGELOG.html">Changes</a></nav>
<main>${parser.parse(markdown)}</main><footer>Generated from maintained Markdown and JSDoc. Local media is not published.</footer></body></html>`;
}
