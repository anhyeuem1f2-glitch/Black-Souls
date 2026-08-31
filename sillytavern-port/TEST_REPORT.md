# Test Report

## Automated Node tests

- `Scripts.rvdata2` parses to exactly 167 entries; all 150 maps and every database file parse.
- Every runtime module imports, and `module-manifest.json` covers the complete static relative import tree.
- The generated Chara Card V3 contains the enabled auto-mount TavernHelper script, no `Open BLACK SOULS` event/button, centralized tagged release config, CDN fallback order, and failure-only recovery controls.
- Interpreter fixtures cover choices, conditions, actor-name conditions, labels, exact-once command 303 continuation, two sequential name modals, focus/modal-stack cleanup, the full Map 97 default opening branch, and the Map 10 Event 38 checkpoint.
- Asset tests cover Git LFS pointer rejection before decode, PNG/Ogg magic bytes, bundled RTP priority, special filenames, regular/`$` VX Ace character frames, and non-fatal optional event sprites during map activation.
- Lifecycle tests cover title creation and Continue availability, New Game map 7, actual engine Esc map→menu→map, fullscreen presentation independence, explicit Shutdown exit request, pause/resume/unmount transitions, keyboard focus ownership, and browser-fullscreen Escape reservation.
- Decode tests cover the exact `IMAGE_DECODE_FAILED` stage and retained per-asset diagnostics.

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

The v0.3.1 regression run traced Map 97 Event 1 command 303 at index 11. Confirming `Thien` updated actor 1, kept interpreter instance 1 alive, cleared the `name_input` wait, advanced once to index 12, rendered the confirmation at index 51, and accepted `Đúng` at index 53. The apparent name-confirm hang was the following command 212 at index 60: Animation 109 requested missing RTP `Graphics/Animations/Light6.png`; that rejected Promise previously terminated the autorun. Missing animation sheets now remain visual diagnostics and preserve the original wait/continuation.

The browser then executed the original default role/gift/opening path, transferred at index 251, rendered Map 10 `Rừng Thánh` at `(15,16)`, showed the Event 38 translation-credit message, and ended that autorun at index 29 with `running=false` and `waitMode=""`. Missing optional Map 10 event sprite `Damage3` was omitted and reported instead of aborting the transfer. Escape still opened and closed the original-style menu over the Map 10 frame.

The v0.3.1 card is configured for immutable tag `name-confirm-v0.3.1`. A final no-override CDN smoke test is performed after that tag is pushed; the tag remains necessary because prior `@main` testing demonstrated stale jsDelivr content.

The authenticated `https://st.proxyvn.top` instance was not available in this workspace. The generated card uses the same URL-based module tree and browser asset endpoints, but final native import confirmation on that deployment remains a user-side acceptance step.

## Remote loader diagnostics

The card loader CORS-preflights `module-manifest.json` and every module in the static import tree before calling dynamic `import()` on a real CDN URL. Each source attempt records requested/final URL, redirects, HTTP status, Content-Type, exposed CORS header, failing stage, nested module errors, and mount cleanup errors. No fetch-to-Blob module conversion is used, so relative imports resolve against the selected CDN base.
