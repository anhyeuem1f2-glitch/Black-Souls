# Test Report

## Automated Node tests

The v0.4.0 suite passes **43/43** tests.

- `Scripts.rvdata2` parses to exactly 167 entries; all 150 maps and every database file parse.
- Every runtime module imports, and `module-manifest.json` covers the complete static relative import tree.
- The generated Chara Card V3 contains the enabled auto-mount TavernHelper script, no `Open BLACK SOULS` event/button, centralized tagged release config, CDN fallback order, and failure-only recovery controls.
- Interpreter fixtures cover choices, conditions, actor-name conditions, labels, exact-once command 303 continuation, two sequential name modals, focus/modal-stack cleanup, the full Map 97 default opening branch, and the Map 10 Event 38 checkpoint.
- Asset tests cover Git LFS pointer rejection before decode, PNG/Ogg magic bytes, bundled RTP priority, special filenames, regular/`$` VX Ace character frames, and non-fatal optional event sprites during map activation.
- Lifecycle tests cover title creation and Continue availability, New Game map 7, actual engine Esc map→menu→map, fullscreen presentation independence, explicit Shutdown exit request, pause/resume/unmount transitions, keyboard focus ownership, and browser-fullscreen Escape reservation.
- Decode tests cover the exact `IMAGE_DECODE_FAILED` stage and retained per-asset diagnostics.
- Streaming tests cover exact in-flight dedupe, later-session Cache API reuse, version invalidation, primary timeout/retry, fallback source selection, reserved critical capacity, direct/second-hop priority, cycle-safe Common Event expansion, transfer/picture/audio/animation/battle/move-route lookahead, initial-viewport readiness, non-blocking off-screen streaming, and late sheet registration in the active renderer.
- The deterministic transition benchmark measured a reactive cold baseline of approximately 158–225 ms and a warmed transition of approximately 0.26–7.28 ms under different test-process load, with exactly two network fetches total.

## Static audit

- 165 `.rvdata2` files extracted; 150 maps generated.
- 70,425 event command instances / 80 distinct codes inventoried.
- 32 unique embedded Ruby snippets / 38 occurrences inventoried.
- 57 custom/plugin scripts total 667,312 bytes / 16,411 lines.
- 818+ browser asset records include per-path LFS/delivery/status metadata; unresolved references remain listed for later maps.

## Browser smoke test

The direct runtime loaded in the Codex in-app browser at logical 640×480 and scaled to the viewport. Its first meaningful frame was the original title image with the original command window. Title diagnostics recorded `Graphics/Titles1/1.png`, HTTP 200, `image/png`, 376,160 bytes, valid PNG magic, no LFS pointer, successful 560×420 decode, and title BGM waiting for audio unlock.

New Game loaded the original Map 7 at `(7,6)` and ran its autorun transfer to Map 97 `(12,18)`. Visual inspection of Map 97 showed composed library tiles, original `!Flame`, `$c_54b`, and `!Other3` sprites, original fog, and Vietnamese Alice dialogue—no diagnostic-color tiles or mock player art. Continue was then reloaded from IndexedDB and reproduced a previously intermittent black screen: `setMap()` exposed the map before its sheet array existed, `drawAutotile()` read `this.sheets[3]`, and the uncaught frame error killed the RAF loop. Atomic map-bundle activation plus retrying frame errors fixed it; the same Continue save then rendered Map 97 correctly.

Two game Cancel inputs dismissed the restored message and opened the original-style menu over the still-visible map; another Cancel returned to play without hiding the host. Fullscreen enter/exit events changed only `FULLSCREEN/WINDOWED` presentation state and retained `TITLE`/`PLAYING`. The same-origin card iframe harness auto-mounted without a launcher, visually covered the simulated SillyTavern composer, restored the composer only after explicit Exit, displayed a persistent compact `Resume BLACK SOULS` button, and resumed the same title scene.

Runtime Diagnostics reported successful assets from both `runtime-bundle` and `github-media`, zero failed loads, zero LFS pointer bodies reaching a decoder, BGM `タイトル、アリス` playing, `Fire1` SE playing, active fog, and all eight non-empty Map 97 tileset sheets. IndexedDB returned `Saved slot 1.`. The opening command 213 balloon path is implemented with the RTP balloon sheet; command 212 uses the normalized database animation and original animation sheet.

The v0.4.0 regression run retained the v0.3.1 name/interpreter fix. Map 97 Event 1 command 303 at index 11 updates actor 1, keeps the same interpreter alive, clears the `name_input` wait, and advances exactly once. The missing Animation 109 `Graphics/Animations/Light6.png` remains a non-fatal visual diagnostic rather than terminating the autorun.

The browser then executed the original default role/gift/opening path, transferred at index 251, rendered Map 10 `Rừng Thánh` at `(15,16)`, showed the Event 38 translation-credit message, and ended that autorun at index 29 with `running=false` and `waitMode=""`. Missing optional Map 10 event sprite `Damage3` was omitted and reported instead of aborting the transfer. Escape still opened and closed the original-style menu over the Map 10 frame.

The v0.4.0 card is configured for immutable tag `streaming-v0.4.0`. A final no-override CDN smoke test is performed after that tag is pushed; the tag remains necessary because prior `@main` testing demonstrated stale jsDelivr content.

Internal browser instrumentation measured the cold opening route while it streamed behind the title. In the final run, Map 7 reached visibility in 5.5 ms and Map 97 in 8.0 ms, both prefetch hits; average was 6.75 ms and p95 was 8.0 ms. The four-map opening working set used about 25.2 MiB of validated byte cache and 23.9 MiB of decoded-image cache. Diagnostics kept the original Map 97 Event 1 interpreter alive and subsequently displayed the name input, confirming that predictive reads did not reorder or execute event commands.

The authenticated `https://st.proxyvn.top` instance was not available in this workspace. The generated card uses the same URL-based module tree and browser asset endpoints, but final native import confirmation on that deployment remains a user-side acceptance step.

## Remote loader diagnostics

The card loader CORS-preflights `module-manifest.json` and every module in the static import tree before calling dynamic `import()` on a real CDN URL. Each source attempt records requested/final URL, redirects, HTTP status, Content-Type, exposed CORS header, failing stage, nested module errors, and mount cleanup errors. No fetch-to-Blob module conversion is used, so relative imports resolve against the selected CDN base.
