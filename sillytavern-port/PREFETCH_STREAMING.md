# Predictive Prefetch and Streaming

BLACK SOULS v0.4.1 uses one `PrefetchManager` for map JSON, repository assets, decoded images, parsed maps, request scheduling, retries, persistent caching, and transition measurements. Runtime code continues to address assets by their original VX Ace paths; the manager owns delivery policy and cache identity.

## Dependency generation

`npm run build:prefetch` reads the extracted database, every one of the 150 maps, Common Events, animations, troops, enemies, and `generated/asset-manifest.json`. It emits `generated/prefetch-manifest.json` rather than maintaining a hand-written list. The generated records contain:

- render-critical tilesets, player graphics, fog, and map data;
- initial event sprites and other map-local warm assets;
- transfer points with source coordinates and a 283-edge direct-transfer graph;
- picture, audio, animation, move-route graphic, actor graphic, battle, and Common Event dependencies;
- the opening route derived from the System start map: Map 7, direct Map 97, then second-hop Maps 10 and 98.

The graph is intentionally bounded to the current map, direct destinations, and second hops. It never warms all 150 maps. Full dependency inventories remain in the manifest for diagnostics, while `warmAssets` restricts eager work to resources useful near the next transition.

## Runtime policy

Priorities are `CRITICAL`, `HIGH`, `NORMAL`, `LOW`, and `IDLE`. The scheduler permits eight concurrent requests and reserves two slots from speculative `LOW`/`IDLE` work, so a map transition cannot be starved by background warming. Requests for the same versioned logical resource share one in-flight Promise; a later critical consumer raises the queued priority instead of downloading it again.

At the title scene the derived opening route warms in depth order. During play, direct exits nearest the player's four-tile position bucket receive `HIGH` priority, their second hops receive `NORMAL`, and additional direct branches receive `LOW`. This same generic rule covers the Holy Forest sections: approaching the transfer on Map 127 warms Map 128 first, and Map 129 as its second hop.

The interpreter scans the next 48 commands at range start, periodically while running, and before fade-out. It recognizes direct transfer, picture, BGM/BGS/ME/SE, animation, battle troop, actor graphic, move-route graphic, and nested Common Event dependencies. Common Event expansion has a depth limit of two and cycle detection. Prefetch never executes an event command or changes game state.

## Transition readiness

A transition begins as soon as `loadMap()` is requested. Map JSON, render-critical assets, and event sprites within the initial ±12 by ±9 tile viewport form the readiness barrier. Images are fetched, validated, and decoded before that barrier is released. Audio bytes are fetched and validated without starting playback. Assets outside the first viewport continue in the background and do not hold the fade indefinitely.

The host exposes `Loading Map NNN · ready/total` while the barrier is active. A transition still loading after 3 seconds emits a warning; after 10 seconds it emits a serious diagnostic containing the exact pending paths, request ages, queue priorities, interpreter state, renderer state, and current game state. Network failure and interpreter waiting are reported separately.

## Cache layers and invalidation

The cache identity includes runtime version, extracted-data version, and asset-manifest version. Changing any one creates a new namespace.

| Layer | Budget / policy | Contents |
|---|---:|---|
| In-flight | exact-key dedupe | Shared pending fetch/decode work |
| Memory bytes | 64 MiB weighted LRU | Validated compressed map/asset bytes |
| Decoded images | 160 MiB weighted LRU | Browser-decoded image objects, size-estimated by width × height × 4 |
| Parsed maps | 24 MiB weighted LRU | Parsed JSON/database objects |
| Persistent | versioned Cache API namespace | Validated HTTP responses reused across sessions |
| HTTP | browser `cache: default` | CDN/media cache validation |

Resources critical to the visible map are pinned; earlier maps are evictable. Persistent caching is disabled for local development overrides to prevent local files from being confused with tagged release content. It is enabled for the pinned remote release. Cache entries are validated again on persistent read, and corrupt or Git LFS pointer bodies are discarded.

## Delivery resilience

Each candidate uses a kind-specific timeout: JSON 10 seconds, images/binary 18 seconds, and audio 30 seconds. The primary candidate is retried once with bounded backoff, then the resolver advances through its existing fallback sources. Optional hedged duplicate requests are deliberately disabled: exact in-flight dedupe plus bounded retry/fallback gives resilience without doubling large game downloads.

## Instrumentation and benchmark

All timing uses browser-native `performance.now()` when available. Fetch wrappers record elapsed time, bytes, retry/fallback/timeout counts, and cache source; image decode records separate decode time. Every map transition records start-to-visible duration and whether it was already warm. Diagnostics expose average and p95 transition duration, prefetch hit rate, memory/decoded/persistent hits, duplicate requests avoided, active/queued requests, oldest request age, and current cache budgets.

The deterministic integration benchmark simulates a cold Map B JSON plus critical image request. The reactive baseline is approximately 158–358 ms on the test runs; after predictive warming the same transition measured approximately 0.26–8.61 ms under different test-process load, with exactly two network fetches total and no duplicate transfer download. In the final v0.4.1 local browser run, cold opening work ran behind the title; the warmed Map 7 transition measured 4.5 ms and the warmed Map 97 transfer 10.8 ms. These are internal regression measurements, not universal network guarantees.

The optimized four-map opening warm set occupied about 25.2 MiB of validated byte cache and 23.9 MiB of decoded-image cache in the browser harness. It does not preload the roughly 600 MiB game tree.

Run `node --test tests/prefetch.test.mjs` for focused policy/cache/benchmark coverage, or `npm test` for the complete port regression suite.
