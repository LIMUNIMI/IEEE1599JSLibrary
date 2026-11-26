import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';
import { startStaticServer } from '../tools/serve.js';
import { launchTestBrowser } from './browser/harness.js';

test('the published documentation serves its bundled inspector example under a repository prefix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ieee1599-site-'));
  let host, browser;
  try {
    await cp('_site', join(root, 'IEEE1599JSLibrary'), { recursive: true });
    host = await startStaticServer({ root, port: 0 });
    browser = await launchTestBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${host.url}IEEE1599JSLibrary/examples/inspector/`);
    await page.getByRole('button', { name: 'all-layers sample' }).click();
    await page.locator('#summary').getByText(/^Six Layers: valid against/).waitFor();
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal((await globalThis.fetch(`${host.url}IEEE1599JSLibrary/examples/dmite/assets/params.xml`)).status, 404);
    assert.equal((await globalThis.fetch(`${host.url}IEEE1599JSLibrary/tests/fixtures/synthetic-av.mp4`)).status, 404);
  } finally {
    await browser?.close();
    await host?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('the actual archive resolves exports without the optional peer and loads its streaming worklet', async () => {
  const { name, version, exports } = JSON.parse(await readFile('package.json', 'utf8'));
  const archive = resolve('dist', `${name}-${version}.tgz`);
  const root = await mkdtemp(join(tmpdir(), 'ieee1599-package-'));
  let host, browser;
  try {
    const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/);
    assert.ok(entries.includes('package/src/media/streaming-worklet.js'));
    assert.ok(entries.includes('package/src/media/pcm-queue.js'));
    assert.ok(!entries.some((path) => /(?:^|\/)(?:node_modules|_site|assets|local|materials|tests)(?:\/|$)/.test(path)));
    for (const entry of Object.values(exports)) {
      for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
        assert.ok(entries.includes(`package/${target.slice(2)}`), target);
      }
    }
    execFileSync('tar', ['-xf', archive, '-C', root]);
    const imports = Object.entries(exports).filter(([, value]) => typeof value !== 'string')
      .map(([subpath]) => `${name}${subpath.slice(1)}`);
    execFileSync(globalThis.process.execPath, ['--input-type=module', '-e',
      `await Promise.all(${JSON.stringify(imports)}.map((specifier) => import(specifier)))`],
    { cwd: join(root, 'package') });
    host = await startStaticServer({ root, port: 0 });
    browser = await launchTestBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${host.url}package/examples/streaming/index.html`);
    await page.getByRole('button', { name: 'Initialize streaming' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.getByRole('status').getByText(/^playing: (?!0\.00 s)/).waitFor();
  } finally {
    await browser?.close();
    await host?.close();
    await rm(root, { recursive: true, force: true });
  }
});
