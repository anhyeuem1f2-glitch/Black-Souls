import assert from 'node:assert/strict';
import test from 'node:test';
import { PrefetchManager, PREFETCH_PRIORITY } from '../runtime/streaming/prefetch-manager.js';

const bytes = new TextEncoder().encode('payload');

test('deduplicates in-flight requests and reuses the successful memory entry', async () => {
  let fetches = 0;
  const manager = createManager({ fetchImpl: async () => { fetches += 1; await delay(15); return response(bytes); } });
  const [left, right] = await Promise.all([
    manager.fetchBytes('same', ['https://assets.test/same.bin']),
    manager.fetchBytes('same', ['https://assets.test/same.bin']),
  ]);
  const third = await manager.fetchBytes('same', ['https://assets.test/same.bin']);
  assert.equal(fetches, 1);
  assert.equal(left, right);
  assert.equal(third, left);
  assert.equal(manager.getStatus().metrics.duplicateRequestsAvoided, 1);
  assert.equal(manager.getStatus().metrics.memoryCacheHits, 1);
});

test('reuses a valid persistent Cache API response in a later manager instance', async () => {
  const cacheStorage = new FakeCacheStorage();
  let fetches = 0;
  const first = createManager({ cacheStorage, fetchImpl: async () => { fetches += 1; return response(bytes); } });
  await first.fetchBytes('persistent', ['https://assets.test/persistent.bin']);
  const second = createManager({ cacheStorage, fetchImpl: async () => { fetches += 1; return response(bytes); } });
  const result = await second.fetchBytes('persistent', ['https://assets.test/persistent.bin']);
  assert.equal(new TextDecoder().decode(result.bytes), 'payload');
  assert.equal(fetches, 1);
  assert.equal(second.getStatus().metrics.persistentCacheHits, 1);
});

test('times out, retries the primary once, then succeeds', async () => {
  let fetches = 0;
  const manager = createManager({
    timeouts: { binary: 8 }, backoffMs: 0,
    fetchImpl: async () => { fetches += 1; if (fetches === 1) return new Promise(() => {}); return response(bytes); },
  });
  await manager.fetchBytes('timeout', ['https://assets.test/timeout.bin'], { timeoutMs: 8, retries: 1 });
  assert.equal(fetches, 2);
  assert.equal(manager.getStatus().metrics.timeouts, 1);
  assert.equal(manager.getStatus().metrics.retries, 1);
});

test('falls back to the secondary source after a bounded primary failure', async () => {
  const urls = [];
  const manager = createManager({ fetchImpl: async (url) => { urls.push(url); return url.includes('primary') ? response(bytes, 503) : response(bytes); } });
  const result = await manager.fetchBytes('fallback', [
    { source: 'primary', url: 'https://primary.test/item.bin' },
    { source: 'fallback', url: 'https://fallback.test/item.bin' },
  ], { retries: 0 });
  assert.equal(result.source, 'fallback');
  assert.deepEqual(urls, ['https://primary.test/item.bin', 'https://fallback.test/item.bin']);
  assert.equal(manager.getStatus().metrics.fallbacks, 1);
});

test('prefetches direct destinations at HIGH and second hops at NORMAL', async () => {
  const calls = [];
  const manager = graphManager(calls);
  manager.prefetchLikelyDestinations(1, { x: 0, y: 0 });
  await tick();
  assert.ok(calls.some((call) => call.mapId === 2 && call.priority === PREFETCH_PRIORITY.HIGH));
  assert.ok(calls.some((call) => call.mapId === 3 && call.priority === PREFETCH_PRIORITY.NORMAL));
});

test('event lookahead discovers transfer, picture, audio, move-route graphic and Common Event dependencies', async () => {
  const calls = [];
  const manager = graphManager(calls);
  const actions = manager.scanUpcoming([
    { code: 201, parameters: [0, 2, 1, 1] },
    { code: 101, parameters: ['AliceFace', 0, 0, 2] },
    { code: 212, parameters: [-1, 5] },
    { code: 231, parameters: [1, 'Cutscene'] },
    { code: 241, parameters: [{ name: 'Theme' }] },
    { code: 205, parameters: [-1, { list: [{ code: 41, parameters: ['Hero', 0] }] }] },
    { code: 117, parameters: [9] },
    { code: 301, parameters: [0, 6] },
  ]);
  await tick();
  assert.ok(actions.some((action) => action.type === 'map' && action.mapId === 2));
  assert.ok(actions.some((action) => action.path === 'Graphics/Faces/AliceFace.png'));
  assert.ok(actions.some((action) => action.path === 'Graphics/Pictures/Cutscene.png'));
  assert.ok(actions.some((action) => action.path === 'Audio/BGM/Theme.ogg'));
  assert.ok(actions.some((action) => action.path === 'Graphics/Characters/Hero.png'));
  assert.ok(actions.some((action) => action.path === 'Graphics/Animations/Flash.png'));
  assert.ok(actions.some((action) => action.path === 'Graphics/Battlers/Enemy.png'));
  assert.ok(actions.some((action) => action.path === 'Graphics/Pictures/Common.png'));
  assert.ok(actions.some((action) => action.type === 'map' && action.mapId === 4));
});

test('Common Event dependency expansion is bounded and cycle-safe', () => {
  const calls = [];
  const manager = graphManager(calls);
  const actions = manager.commonActions(9, 4);
  assert.equal(actions.filter((action) => action.path === 'Graphics/Pictures/Common.png').length, 1);
  assert.equal(actions.filter((action) => action.mapId === 4).length, 1);
});

test('picture and audio lookahead prefetch without executing their event commands', async () => {
  const calls = [];
  const manager = graphManager(calls);
  manager.scanUpcoming([{ code: 231, parameters: [1, 'Cutscene'] }, { code: 245, parameters: [{ name: 'Wind' }] }]);
  await tick();
  assert.ok(calls.some((call) => call.path === 'Graphics/Pictures/Cutscene.png'));
  assert.ok(calls.some((call) => call.path === 'Audio/BGS/Wind.ogg'));
  assert.equal(calls.some((call) => call.executed), false);
});

test('transition barrier waits for map, render-critical and initial-viewport assets but not off-screen streaming', async () => {
  const events = [];
  const manager = createManager();
  manager.setManifest({ maps: { 2: {
    mapId: 2, criticalAssets: ['Graphics/Tilesets/A.png'], assets: ['Graphics/Tilesets/A.png', 'Graphics/Characters/Near.png', 'Graphics/Characters/Far.png'],
    eventAssets: [{ x: 2, y: 2, path: 'Graphics/Characters/Near.png' }, { x: 80, y: 80, path: 'Graphics/Characters/Far.png' }], transfers: [],
  } }, transferGraph: {} });
  manager.bindLoader({
    map: async () => { await delay(8); events.push('map'); return {}; },
    prefetchAsset: async (path) => { await delay(path.includes('Far') ? 250 : 12); events.push(path); return {}; },
  });
  const began = performance.now();
  await manager.prepareMap(2, { x: 1, y: 1 });
  const elapsed = performance.now() - began;
  assert.ok(events.includes('map'));
  assert.ok(events.includes('Graphics/Tilesets/A.png'));
  assert.ok(events.includes('Graphics/Characters/Near.png'));
  assert.equal(events.includes('Graphics/Characters/Far.png'), false, `barrier awaited off-screen streaming for ${elapsed} ms`);
});

test('LOW work cannot occupy the reserved CRITICAL slot', async () => {
  const started = [];
  const releases = new Map();
  const manager = createManager({ maxConcurrent: 2, reservedCritical: 1, fetchImpl: (url) => {
    started.push(url);
    if (url.includes('critical')) return Promise.resolve(response(bytes));
    return new Promise((resolve) => releases.set(url, () => resolve(response(bytes))));
  } });
  const low1 = manager.fetchBytes('low-1', ['https://assets.test/low-1'], { priority: PREFETCH_PRIORITY.LOW, retries: 0 });
  const low2 = manager.fetchBytes('low-2', ['https://assets.test/low-2'], { priority: PREFETCH_PRIORITY.LOW, retries: 0 });
  await tick();
  const critical = manager.fetchBytes('critical', ['https://assets.test/critical'], { priority: PREFETCH_PRIORITY.CRITICAL, retries: 0 });
  await tick();
  assert.deepEqual(started.slice(0, 2), ['https://assets.test/low-1', 'https://assets.test/critical']);
  releases.get('https://assets.test/low-1')();
  await tick();
  releases.get('https://assets.test/low-2')();
  await Promise.all([low1, low2, critical]);
});

test('versioned persistent cache keys do not mix releases', async () => {
  const cacheStorage = new FakeCacheStorage();
  let fetches = 0;
  const first = createManager({ version: 'one', cacheStorage, fetchImpl: async () => { fetches += 1; return response(bytes); } });
  const second = createManager({ version: 'two', cacheStorage, fetchImpl: async () => { fetches += 1; return response(bytes); } });
  await first.fetchBytes('versioned', ['https://assets.test/versioned.bin']);
  await second.fetchBytes('versioned', ['https://assets.test/versioned.bin']);
  assert.equal(fetches, 2);
  assert.notEqual(first.cacheName, second.cacheName);
});

test('integration benchmark: prefetched Map B transfers warm with no duplicate network fetch', async () => {
  let networkFetches = 0;
  const manager = createManager({ fetchImpl: async (url) => {
    networkFetches += 1;
    await delay(url.includes('map') ? 60 : 85);
    return response(url.includes('map') ? new TextEncoder().encode('{}') : bytes, 200, url.includes('map') ? 'application/json' : 'image/png');
  } });
  manager.setManifest({ maps: { 2: { mapId: 2, criticalAssets: ['Graphics/Tilesets/B.png'], assets: ['Graphics/Tilesets/B.png'], eventAssets: [], transfers: [] } }, transferGraph: {} });
  manager.bindLoader({
    map: () => manager.fetchBytes('map:2', ['https://assets.test/map-2.json'], { kind: 'json', purpose: 'prefetch' }),
    prefetchAsset: (path, options) => manager.fetchBytes(`asset:${path}`, ['https://assets.test/B.png'], { kind: 'image', purpose: options.purpose, priority: options.priority }),
  });
  const baselineBegan = performance.now(); await delay(60); await delay(85); const baselineMs = performance.now() - baselineBegan;
  await manager.prefetchMap(2, { priority: PREFETCH_PRIORITY.HIGH, awaitOptional: true });
  const warmBegan = performance.now(); await manager.prepareMap(2); const warmMs = performance.now() - warmBegan;
  console.log(`[BLACK SOULS benchmark] ${JSON.stringify({ reactiveBaselineMs: Math.round(baselineMs * 100) / 100, prefetchedTransitionMs: Math.round(warmMs * 100) / 100, networkFetches })}`);
  assert.equal(networkFetches, 2);
  assert.ok(warmMs < baselineMs / 4, `warm ${warmMs} ms vs baseline ${baselineMs} ms`);
});

function createManager(overrides = {}) {
  return new PrefetchManager({ version: 'test', dataVersion: 'data', assetVersion: 'assets', cacheStorage: null, backoffMs: 0, ...overrides });
}

function graphManager(calls) {
  const manager = createManager();
  manager.setManifest({
    policy: { eventLookahead: 48 },
    maps: {
      1: { mapId: 1, criticalAssets: [], assets: [], eventAssets: [], transfers: [2], transferPoints: [{ x: 1, y: 1, mapId: 2 }] },
      2: { mapId: 2, criticalAssets: [], assets: [], eventAssets: [], transfers: [3] },
      3: { mapId: 3, criticalAssets: [], assets: [], eventAssets: [], transfers: [] },
      4: { mapId: 4, criticalAssets: [], assets: [], eventAssets: [], transfers: [] },
    },
    transferGraph: { 1: [2], 2: [3], 3: [], 4: [] },
    commonEvents: {
      9: { assets: ['Graphics/Pictures/Common.png'], transfers: [4], commonEvents: [10] },
      10: { assets: [], transfers: [], commonEvents: [9] },
    },
    animations: { 5: { assets: ['Graphics/Animations/Flash.png'] } },
    battles: { 6: { assets: ['Graphics/Battlers/Enemy.png', 'Audio/BGM/Battle.ogg'] } },
  });
  const entries = new Map([
    ['graphics/faces/aliceface', 'Graphics/Faces/AliceFace.png'],
    ['graphics/pictures/cutscene', 'Graphics/Pictures/Cutscene.png'],
    ['graphics/characters/hero', 'Graphics/Characters/Hero.png'],
    ['audio/bgm/theme', 'Audio/BGM/Theme.ogg'],
    ['audio/bgs/wind', 'Audio/BGS/Wind.ogg'],
  ]);
  manager.bindLoader({
    map: async (mapId, options) => { calls.push({ mapId, ...options }); return {}; },
    prefetchAsset: async (path, options) => { calls.push({ path, ...options }); return {}; },
    resolveEntry: (path) => { const key = String(path).replace(/\.[^.\/]+$/, '').toLocaleLowerCase(); const resolved = entries.get(key); return resolved ? { path: resolved } : null; },
  });
  return manager;
}

function response(body, status = 200, contentType = 'application/octet-stream') {
  return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Unavailable', headers: { 'content-type': contentType, 'content-length': String(body.byteLength) } });
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }

class FakeCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache()); return this.caches.get(name); }
}
class FakeCache {
  constructor() { this.entries = new Map(); }
  async match(url) { return this.entries.get(String(url))?.clone() ?? null; }
  async put(url, value) { this.entries.set(String(url), value.clone()); }
  async delete(url) { return this.entries.delete(String(url)); }
}
