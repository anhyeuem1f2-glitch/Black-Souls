# Asset Pipeline

`tools/build-assets.mjs` generates `generated/asset-manifest.json` schema v2. Every entry records the original path, category, extension, known size, Git LFS state, delivery mode, and—when bundled—SHA-256. Direct references are extracted from System title graphics/title BGM, tilesets, actors, maps, events, fog notes, animation sheets, and audio/picture commands.

## Browser delivery

`runtime/assets/asset-resolver.js` is the only asset URL policy:

1. `runtime-bundle` for the isolated VX Ace RTP subset under `sillytavern-port/assets/rtp/`;
2. `media.githubusercontent.com/media/...` for original Git LFS assets;
3. GitHub's `/raw/` redirect endpoint as an LFS-aware fallback;
4. repository-relative CDN URLs only for non-LFS Git blobs.

The resolver fetches bytes before creating `Image` or `Audio` objects. It rejects Git LFS pointer text even when a CDN labels it `image/png`, validates PNG/JPEG/Ogg/WAV/MP3 magic bytes, reports every attempted source/status/content type/stage, caches successful binaries and decoded images, and revokes generated Blob URLs during unmount. Paths are encoded segment-by-segment so Unicode, spaces, punctuation, `$`, and `!` names keep their original identity.

For every decoded image, diagnostics retain the original repository path, requested and final URL, HTTP status, Content-Type, exposed Content-Length, received byte length, magic-byte prefix, LFS-pointer result, decoder result, and decoded dimensions. Decode failures are recorded separately as `lastDecodeError`; a required title image failure aborts mount and reaches the card's Retry UI rather than silently drawing black.

## Verified title chain

`System.json` selects `Graphics/Titles1/1.png`; no `Titles2` image is configured and `opt_draw_title` is false. The browser smoke test resolved the original LFS binary through the media endpoint with HTTP 200, `image/png`, Content-Length 376,160, PNG magic `89 50 4e 47 0d 0a 1a 0a`, no pointer body, and decoded dimensions 560×420. The traced game script sets title stretch mode 1, so the renderer draws that exact image at the original 640×480 logical resolution. The manifest also explicitly records `Audio/BGM/タイトル、アリス` from System data.

## RTP subset

The repository's `Game.ini` declares `RPGVXAce` RTP but the original Git tree does not contain every standard sheet/sound required by the boot path. The browser bundle contains only the files used by Map 7, Map 97, their first event visuals, and command 212/213 effects. `.gitattributes` explicitly disables LFS for this directory, so CDN delivery returns real files rather than pointer records.

The source package was the official `RPGVXAce_RTP.zip` download, SHA-256 `7E93D0EAD93A686218B7C671BF099EF42F09F536083BD0B2F0FA6423A39FC19B`. It was extracted without modifying the canonical `Graphics/` or `Audio/` trees. Redistribution remains subject to the RPG Maker VX Ace/RTP license; a production publisher must confirm their applicable license before release.

## Loading boundary

Loading remains map-scoped, but v0.4.1 adds generated predictive warming through the single `PrefetchManager`. `tools/build-prefetch.mjs` derives the transfer graph and map/Common Event/picture/audio/animation/battle dependencies from extracted data. The runtime warms only the current map, likely direct destinations, and their second hops; it never preloads the whole repository. Event-command lookahead requests future picture, audio, animation, battle, graphic, Common Event, and transfer resources through the same resolver rather than constructing URLs directly.

The readiness barrier contains map JSON, non-empty render-critical tileset sheets, player/fog resources, and event sprites in the initial viewport. Those images are decoded before the new scene becomes visible. Off-screen sprites and lower-priority branches continue streaming after the barrier. Validated bytes use a 64 MiB LRU, decoded images a 160 MiB LRU, parsed objects a 24 MiB LRU, and release builds use a versioned Cache API namespace. See `PREFETCH_STREAMING.md` for scheduling, retry, invalidation, and instrumentation policy.

Map activation is atomic: the renderer first resolves and decodes every required sheet/sprite/fog image into local values, then swaps the complete map bundle into the draw state. This fixes the real Continue race where `scene=PLAYING` allowed one frame to access `this.sheets[3]` before `setMap()` had assigned `this.sheets`; that exception previously stopped the RAF loop and left a black canvas even though all network requests later succeeded.
