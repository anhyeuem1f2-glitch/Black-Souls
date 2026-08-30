import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetResolver, parseLfsPointer, validateMagic } from '../runtime/assets/asset-resolver.js';
import { characterFrame } from '../runtime/render/canvas-renderer.js';

test('detects and rejects Git LFS pointer bytes before image decode', async () => {
  const pointer = new TextEncoder().encode('version https://git-lfs.github.com/spec/v1\noid sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nsize 346411\n');
  assert.deepEqual(parseLfsPointer(pointer), { oid: 'a'.repeat(64), size: 346411 });
  const resolver = new AssetResolver({
    manifest: { assets: [{ path: 'Graphics/Tilesets/Test.png', extension: 'png', lfs: true }] },
    runtimeBaseUrl: 'https://cdn.example.test/sillytavern-port/runtime/',
    repository: { owner: 'owner', name: 'repo', ref: 'main' },
    fetchImpl: async () => new Response(pointer, { status: 200, headers: { 'content-type': 'image/png' } }),
  });
  await assert.rejects(() => resolver.binary('Graphics/Tilesets/Test.png'), (error) => {
    assert.equal(error.code, 'ASSET_UNAVAILABLE');
    assert.equal(error.diagnostics.attempts[0].code, 'LFS_POINTER_RECEIVED');
    return true;
  });
  assert.equal(resolver.diagnostics().lfsPointersRejected, resolver.candidates('Graphics/Tilesets/Test.png').length);
});

test('accepts real PNG and Ogg signatures', () => {
  assert.doesNotThrow(() => validateMagic(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'png'));
  assert.doesNotThrow(() => validateMagic(new TextEncoder().encode('OggS'), 'ogg'));
  assert.throws(() => validateMagic(new TextEncoder().encode('version '), 'png'), /Invalid png signature/);
});

test('uses bundled RTP first while preserving encoded filenames', () => {
  const resolver = new AssetResolver({
    manifest: { assets: [{ path: 'Graphics/Characters/!Flame.png', extension: 'png', deliveryPath: '../assets/rtp/Graphics/Characters/!Flame.png' }] },
    runtimeBaseUrl: 'https://cdn.jsdelivr.net/gh/o/r@main/sillytavern-port/runtime/',
    repository: { owner: 'o', name: 'r', ref: 'main' },
  });
  const candidates = resolver.candidates('Graphics/Characters/!Flame.png');
  assert.equal(candidates[0].source, 'runtime-bundle');
  assert.match(candidates[0].url, /Characters\/!Flame\.png$/);
});

test('VX Ace character frame supports regular and single-character sheets', () => {
  assert.deepEqual(characterFrame({ width: 384, height: 256 }, '!Flame', 5, 6, 2), { sx: 160, sy: 192, width: 32, height: 32 });
  assert.deepEqual(characterFrame({ width: 96, height: 128 }, '$c_54b', 0, 4, 1), { sx: 32, sy: 32, width: 32, height: 32 });
});
