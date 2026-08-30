import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('runtime modules are syntactically importable', async () => {
  for (const path of ['data/loader.js', 'map/collision.js', 'map/interpreter.js', 'render/canvas-renderer.js', 'save/indexeddb.js', 'core/game-engine.js']) {
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
  assert.match(content, /getButtonEvent\('Open BLACK SOULS'\)/);
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
});

test('asset manifest records repository assets and unresolved RTP references', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'generated', 'asset-manifest.json'), 'utf8'));
  assert.ok(manifest.assets.length > 700);
  assert.ok(manifest.missingDirectReferences.some((item) => item.basePath === 'Graphics/Tilesets/Inside_A1'));
});
