import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  bootRuntime,
  preflightBundle,
  requestBytes,
  validateBody,
  validateBuildManifest,
} from '../card/loader-core.js';
import { validateVerification } from '../tools/release-schema.mjs';
import { PrefetchManager } from '../runtime/streaming/prefetch-manager.js';
import { SaveStore } from '../runtime/save/indexeddb.js';

const bundleBytes = new TextEncoder().encode('window.BlackSoulsRuntime={mount(){},unmount(){},getState(){},save(){},loadSave(){}};');
const bundleHash = createHash('sha256').update(bundleBytes).digest('hex').toUpperCase();

test('versioned runtime build manifest validates', () => {
  assert.equal(validateBuildManifest(buildManifest()).runtimeVersion, '0.6.0');
});

test('missing runtime entry is rejected', () => {
  assert.throws(() => validateBuildManifest({ ...buildManifest(), entry: '' }), /entry/i);
});

test('missing tag or ref response is rejected before execution', async () => {
  await assert.rejects(() => preflightBundle(candidate(), { fetchImpl: async () => response('missing', 404, 'text/plain'), cryptoImpl: webcrypto }), /HTTP 404/);
});

test('bad JavaScript Content-Type is rejected', async () => {
  const fixture = releaseFixture({ bundleType: 'text/plain' });
  await assert.rejects(() => preflightBundle(candidate(), { fetchImpl: fixture.fetch, cryptoImpl: webcrypto }), /Content-Type/);
});

test('HTML body instead of JavaScript is rejected', async () => {
  const fixture = releaseFixture({ bundleBody: '<!doctype html><title>missing</title>' });
  await assert.rejects(() => preflightBundle(candidate(), { fetchImpl: fixture.fetch, cryptoImpl: webcrypto }), /HTML/);
});

test('Git LFS pointer body is rejected', () => {
  const pointer = new TextEncoder().encode('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n');
  assert.throws(() => validateBody(pointer, 'bundle.js'), /LFS pointer/);
});

test('runtime integrity mismatch is rejected', async () => {
  const fixture = releaseFixture({ manifest: buildManifest({ entrySha256: '0'.repeat(64) }) });
  await assert.rejects(() => preflightBundle(candidate({ expectedSha256: null }), { fetchImpl: fixture.fetch, cryptoImpl: webcrypto }), /SHA-256 mismatch/);
});

test('primary CDN failure falls through to a working CDN source and mounts', async () => {
  const broken = candidate({ id: 'primary', label: 'primary', manifestUrl: 'https://primary.invalid/runtime/dist/runtime-build.json', baseUrl: 'https://primary.invalid/runtime/' });
  const good = candidate({ id: 'fallback', label: 'fallback' });
  const fixture = releaseFixture();
  let mounted = 0;
  const runtime = runtimeContract(() => { mounted += 1; });
  const result = await bootRuntime({
    candidates: [broken, good], cryptoImpl: webcrypto,
    fetchImpl: async (url, options) => String(url).includes('primary.invalid') ? response('missing', 404, 'text/plain') : fixture.fetch(url, options),
    executeBundle: async () => runtime,
  });
  assert.equal(result.candidate.id, 'fallback');
  assert.equal(mounted, 1);
  assert.equal(result.attempts[0].success, false);
});

test('last-known-good legacy release is used visibly after current release failure', async () => {
  const current = candidate({ id: 'current', manifestUrl: 'https://current.invalid/runtime/dist/runtime-build.json', baseUrl: 'https://current.invalid/runtime/' });
  const legacyBase = 'https://legacy.invalid/runtime/';
  const fallback = { id: 'last-known-good', label: 'last-known-good', role: 'last-known-good', kind: 'legacy-module', ref: 'b'.repeat(40), baseUrl: legacyBase, manifestUrl: `${legacyBase}module-manifest.json`, entryUrl: `${legacyBase}bootstrap.js` };
  const runtime = runtimeContract();
  const fetchImpl = async (url) => {
    if (String(url).includes('current.invalid')) return response('missing', 404, 'text/plain');
    if (String(url).endsWith('module-manifest.json')) return response(JSON.stringify({ schema: 'black-souls-runtime-module-tree-v1', version: '0.4.1', entry: 'bootstrap.js', modules: ['bootstrap.js'] }), 200, 'application/json');
    return response('export const BlackSoulsRuntime={};', 200, 'application/javascript');
  };
  const result = await bootRuntime({ candidates: [current, fallback], fetchImpl, cryptoImpl: webcrypto, importModule: async () => ({ BlackSoulsRuntime: runtime }) });
  assert.equal(result.candidate.role, 'last-known-good');
  assert.equal(result.attempt.fallbackUsed, true);
});

test('classic bundle must expose the runtime global and mount it', async () => {
  const fixture = releaseFixture();
  const runtime = runtimeContract();
  globalThis.window = {};
  try {
    const result = await bootRuntime({
      candidates: [candidate()], fetchImpl: fixture.fetch, cryptoImpl: webcrypto,
      executeBundle: async () => { globalThis.window.BlackSoulsRuntime = runtime; return runtime; },
    });
    assert.equal(result.runtime, globalThis.window.BlackSoulsRuntime);
    assert.equal(runtime.mountCalls, 1);
  } finally { delete globalThis.window; }
});

test('retry performs a fresh source selection after an earlier failure', async () => {
  const fixture = releaseFixture();
  let unavailable = true;
  const fetchImpl = (url, options) => unavailable ? Promise.resolve(response('temporarily unavailable', 503, 'text/plain')) : fixture.fetch(url, options);
  await assert.rejects(() => bootRuntime({ candidates: [candidate()], fetchImpl, cryptoImpl: webcrypto, executeBundle: async () => runtimeContract() }), /Every configured/);
  unavailable = false;
  const result = await bootRuntime({ candidates: [candidate()], fetchImpl, cryptoImpl: webcrypto, executeBundle: async () => runtimeContract() });
  assert.equal(result.attempt.success, true);
});

test('card export verification requires successful primary and fallback sources', () => {
  const valid = {
    schema: 'black-souls-verified-runtime-v1', verified: true, ref: 'c'.repeat(40),
    entrySha256: 'D'.repeat(64), runtimeVersion: '0.6.0',
    sources: [{ role: 'primary', ok: true }, { role: 'fallback', ok: true }],
  };
  assert.equal(validateVerification(valid).ref, 'c'.repeat(40));
  assert.throws(() => validateVerification({ ...valid, sources: [{ role: 'primary', ok: true }] }), /primary and fallback/);
});

test('request diagnostics record status, MIME, length, and body signature', async () => {
  const requests = [];
  await requestBytes('https://example.invalid/a.js', { fetchImpl: async () => response('const ok=true;', 200, 'application/javascript'), requests, expectedType: 'javascript' });
  assert.deepEqual(Object.keys(requests[0]).filter((key) => ['status', 'contentType', 'contentLength', 'bodySignature'].includes(key)).sort(), ['bodySignature', 'contentLength', 'contentType', 'status']);
});

test('opaque-origin cache access degrades to memory instead of aborting boot', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, get() { throw new DOMException('opaque origin', 'SecurityError'); } });
  try {
    const manager = new PrefetchManager();
    assert.equal(manager.cacheStorage, null);
    manager.destroy();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'caches', descriptor);
    else delete globalThis.caches;
  }
});

test('unavailable IndexedDB falls back to session-memory save/load', async () => {
  const saves = new SaveStore();
  await saves.save(99, { mapId: 7 });
  assert.equal(await saves.has(99), true);
  assert.deepEqual(await saves.load(99), { mapId: 7 });
});

function candidate(overrides = {}) {
  const baseUrl = overrides.baseUrl ?? 'https://cdn.example/runtime/';
  return {
    id: 'cdn', label: 'cdn', role: 'current', kind: 'bundle', ref: 'a'.repeat(40), baseUrl,
    manifestUrl: `${baseUrl}dist/runtime-build.json`, expectedSha256: bundleHash,
    ...overrides,
  };
}

function buildManifest(overrides = {}) {
  return {
    schema: 'black-souls-runtime-build-v1', runtimeVersion: '0.6.0', sourceCommit: '1'.repeat(40),
    builtAt: '2026-08-31T00:00:00Z', entry: 'black-souls-runtime.bundle.js', entrySha256: bundleHash,
    entryBytes: bundleBytes.byteLength, runtimeManifest: '../manifest.json',
    dataVersion: 'black-souls-normalized-data-v1', dependencyIndexVersion: 'black-souls-game-dependency-index-v1',
    requiredBootData: ['../../generated/System.json'],
    ...overrides,
  };
}

function releaseFixture({ manifest = buildManifest(), bundleBody = bundleBytes, bundleType = 'application/javascript' } = {}) {
  const manifestUrl = 'https://cdn.example/runtime/dist/runtime-build.json';
  const entryUrl = 'https://cdn.example/runtime/dist/black-souls-runtime.bundle.js';
  const dataUrl = 'https://cdn.example/generated/System.json';
  return {
    fetch: async (url) => {
      const value = String(url);
      if (value === manifestUrl) return response(JSON.stringify(manifest), 200, 'application/json');
      if (value === entryUrl) return response(bundleBody, 200, bundleType);
      if (value === dataUrl) return response('{}', 200, 'application/json');
      return response('missing', 404, 'text/plain');
    },
  };
}

function response(body, status, contentType) {
  return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Not Found', headers: { 'content-type': contentType } });
}

function runtimeContract(onMount = () => {}) {
  return {
    mountCalls: 0,
    async mount() { this.mountCalls += 1; onMount(); },
    async unmount() {}, getState() {}, save() {}, loadSave() {},
  };
}
