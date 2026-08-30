# Test Report

## Automated Node tests

- `Scripts.rvdata2` parses to exactly 167 entries; all 150 maps and every database file parse.
- Every runtime module imports, and `module-manifest.json` covers the complete static relative import tree.
- The generated Chara Card V3 contains the enabled TavernHelper script, centralized release config, CDN fallback order, and visible loader states.
- Interpreter fixtures cover choices, conditions, actor-name conditions, labels, and the original Map 97 opening prefix.
- Asset tests cover Git LFS pointer rejection before decode, PNG/Ogg magic bytes, bundled RTP priority, special filenames, and regular/`$` VX Ace character frames.

## Static audit

- 165 `.rvdata2` files extracted; 150 maps generated.
- 70,425 event command instances / 80 distinct codes inventoried.
- 32 unique embedded Ruby snippets / 38 occurrences inventoried.
- 57 custom/plugin scripts total 667,312 bytes / 16,411 lines.
- 818+ browser asset records include per-path LFS/delivery/status metadata; unresolved references remain listed for later maps.

## Browser smoke test

The direct runtime loaded in the Codex in-app browser at 640×480. New Game loaded the original Map 7 at `(7,6)` and ran its autorun transfer to Map 97 `(12,18)`. Visual inspection of Map 97 showed composed library tiles, original `!Flame`, `$c_54b`, and `!Other3` sprites, original fog, and Vietnamese Alice dialogue—no diagnostic-color tiles or mock player art.

Runtime Diagnostics reported successful assets from both `runtime-bundle` and `github-media`, zero failed loads, zero LFS pointer bodies reaching a decoder, BGM `タイトル、アリス` playing, `Fire1` SE playing, active fog, and all eight non-empty Map 97 tileset sheets. IndexedDB returned `Saved slot 1.`. The opening command 213 balloon path is implemented with the RTP balloon sheet; command 212 uses the normalized database animation and original animation sheet.

The authenticated `https://st.proxyvn.top` instance was not available in this workspace. The generated card uses the same URL-based module tree and browser asset endpoints, but final native import confirmation on that deployment remains a user-side acceptance step.

## Remote loader diagnostics

The card loader CORS-preflights `module-manifest.json` and every module in the static import tree before calling dynamic `import()` on a real CDN URL. Each source attempt records requested/final URL, redirects, HTTP status, Content-Type, exposed CORS header, failing stage, nested module errors, and mount cleanup errors. No fetch-to-Blob module conversion is used, so relative imports resolve against the selected CDN base.
