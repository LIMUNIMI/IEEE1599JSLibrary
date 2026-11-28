import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
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
    assert.equal((await globalThis.fetch(`${host.url}IEEE1599JSLibrary/examples/assets/`)).status, 404);
    const materials = join(root, 'private-materials');
    await mkdir(materials);
    await writeFile(join(materials, 'piece.xml'), `<ieee1599 version="1.0">
      <general><description><main_title>Local published player</main_title></description></general>
      <logic><spine><event id="a"/></spine></logic>
      <notational><graphic_instance_group><graphic_instance file_name="score.svg" position_in_group="1">
        <graphic_event event_ref="a" upper_left_x="0" upper_left_y="0" lower_right_x="10" lower_right_y="10"/>
      </graphic_instance></graphic_instance_group></notational>
      <audio><track file_name="sound.wav" file_format="audio_wav"><track_indexing timing_type="seconds">
        <track_event event_ref="a" start_time="0"/>
      </track_indexing></track></audio></ieee1599>`);
    await writeFile(join(materials, 'score.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"/>');
    const wave = Buffer.alloc(44 + 16000);
    wave.write('RIFF');
    wave.writeUInt32LE(wave.length - 8, 4);
    wave.write('WAVEfmt ', 8);
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(8000, 24);
    wave.writeUInt32LE(16000, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write('data', 36);
    wave.writeUInt32LE(16000, 40);
    await writeFile(join(materials, 'sound.wav'), wave);
    await page.goto(`${host.url}IEEE1599JSLibrary/examples/starter/`);
    const mediaRequests = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && !request.url().endsWith('.js')) mediaRequests.push(request.url());
    });
    await page.getByLabel('Materials folder', { exact: true }).setInputFiles(materials);
    await page.getByRole('button', { name: 'Open selected XML' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await page.waitForFunction(() => globalThis.document.querySelector('#score img')?.naturalWidth === 100);
    assert.equal(await page.locator('#title').textContent(), 'Local published player');
    assert.deepEqual(mediaRequests, []);
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
    assert.ok(entries.includes('package/examples/dmite/assets.js'));
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
