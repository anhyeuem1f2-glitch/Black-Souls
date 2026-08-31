import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('runtime modules are syntactically importable', async () => {
  for (const path of ['data/loader.js', 'map/collision.js', 'map/interpreter.js', 'render/canvas-renderer.js', 'save/indexeddb.js', 'core/game-engine.js', 'core/lifecycle.js']) {
    await import(pathToFileURL(join(root, 'runtime', path)));
  }
});

test('module manifest covers every relative runtime import', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'runtime', 'module-manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'black-souls-runtime-module-tree-v1');
  assert.ok(manifest.modules.includes(manifest.entry));
  const discovered = new Set([manifest.entry]);
  const queue = [manifest.entry];
  while (queue.length) {
    const modulePath = queue.shift();
    const source = await readFile(join(root, 'runtime', ...modulePath.split('/')), 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"](\.[^'\"]+\.js)['\"]/g)) {
      const dependency = posix.normalize(posix.join(posix.dirname(modulePath), match[1]));
      if (!discovered.has(dependency)) {
        discovered.add(dependency);
        queue.push(dependency);
      }
    }
  }
  assert.deepEqual([...manifest.modules].sort(), [...discovered].sort());
});

test('generated card is Chara Card V3 with an enabled TavernHelper script', async () => {
  const card = JSON.parse(await readFile(join(root, 'card', 'Black_Souls_ST.json'), 'utf8'));
  assert.equal(card.spec, 'chara_card_v3');
  assert.equal(card.spec_version, '3.0');
  assert.equal(card.data.extensions.tavern_helper.scripts[0].enabled, true);
  const content = card.data.extensions.tavern_helper.scripts[0].content;
  assert.doesNotMatch(content, /getButtonEvent\(|Open BLACK SOULS|hideFrame\(\)/);
  assert.match(content, /systems-v0\.5\.0/);
  assert.match(content, /function compactFrame\(\)/);
  assert.match(content, /onHostState: handleHostState/);
  assert.match(content, /\nboot\(\);\s*$/);
  assert.match(content, /const RUNTIME_RELEASE/);
  assert.match(content, /const RUNTIME_SOURCES/);
  assert.ok(content.indexOf('https://cdn.jsdelivr.net') < content.indexOf('https://testingcf.jsdelivr.net'));
  assert.ok(content.indexOf('https://testingcf.jsdelivr.net') < content.indexOf('https://raw.githubusercontent.com'));
  for (const state of ['Checking runtime...', 'Loading runtime...', 'Loading game data...']) {
    assert.match(content, new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const host = await readFile(join(root, 'runtime', 'host.js'), 'utf8');
  for (const state of ['Loading game data...', 'Starting BLACK SOULS...', 'Ready']) {
    assert.match(host, new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(host, /Exit to SillyTavern/);
  assert.match(host, /Resume BLACK SOULS/);
  assert.match(host, /fullscreenchange/);
  assert.match(host, /this\.stage\.focus\(\{ preventScroll: true \}\)/);
});

test('asset manifest records LFS delivery and browser-ready RTP references', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'generated', 'asset-manifest.json'), 'utf8'));
  assert.ok(manifest.assets.length > 700);
  assert.equal(manifest.schema, 'black-souls-asset-manifest-v2');
  assert.ok(manifest.assets.some((item) => item.path === 'Graphics/Tilesets/Inside_A1.png' && item.delivery === 'runtime-bundle' && item.sha256));
  assert.ok(manifest.assets.some((item) => item.path === 'Graphics/Tilesets/Inside_C.png' && item.delivery === 'github-media' && item.lfs));
  assert.ok(!manifest.missingDirectReferences.some((item) => item.basePath === 'Graphics/Tilesets/Inside_A1'));
  assert.ok(manifest.directReferences.some((item) => item.basePath === 'Graphics/Titles1/1' && item.present && item.sources.includes('system:title1')));
  assert.ok(manifest.directReferences.some((item) => item.basePath === 'Audio/BGM/タイトル、アリス' && item.present && item.sources.includes('system:title-bgm')));
});
