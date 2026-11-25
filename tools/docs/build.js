import { Application, JSX } from 'typedoc';
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_FILES, renderGuide } from './site.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, '_site');

/** Copy only a named regular file; symlinks are not publication inputs. */
async function copy(path, destination = path) {
  const source = join(root, path);
  if (!(await lstat(source)).isFile()) throw new Error(`Not a regular publication file: ${path}`);
  const target = join(output, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

/** Recursion is restricted to library JavaScript, never examples or assets. */
async function copySource(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not a publication input: ${path}`);
    if (entry.isDirectory()) await copySource(path);
    else if (entry.isFile() && entry.name.endsWith('.js')) await copy(path);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const app = await Application.bootstrapWithPlugins({
  options: join(root, 'typedoc.json')
});
app.renderer.hooks.on('content.begin', (context) =>
  JSX.createElement('p', {}, JSX.createElement('a', { href: context.relativeURL('../index.html') }, 'Documentation home')));
const project = await app.convert();
if (!project) throw new Error('API documentation conversion failed');
app.validate(project);
if (app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('Resolve API documentation warnings before publishing');
await app.generateDocs(project, join(output, 'api'));
if (app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('Resolve API rendering warnings before publishing');

const guides = [
  'README.md', 'AGENTS.md', 'CHANGELOG.md', 'schema/README.md',
  'examples/dmite/README.md', 'examples/la-catedral/README.md',
  ...(await readdir(join(root, 'docs'))).filter((name) => name.endsWith('.md')).map((name) => `docs/${name}`)
];
for (const path of guides) {
  const target = join(output, path.replace(/\.md$/, '.html'));
  await mkdir(dirname(target), { recursive: true });
  const prefix = relative(dirname(target), output).split(sep).join('/') || '.';
  const html = renderGuide(await readFile(join(root, path), 'utf8'), `${prefix}/`);
  await writeFile(target, html);
}
await copyFile(join(output, 'README.html'), join(output, 'index.html'));
await copy('tools/docs/style.css', 'site.css');
await copy('schema/ieee1599.dtd');
await copy('LICENSE');
await copySource('src');
for (const path of EXAMPLE_FILES) await copy(path);
await writeFile(join(output, '.nojekyll'), '');
console.info('Documentation and asset-free examples generated in _site.');
