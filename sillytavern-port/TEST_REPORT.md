# Test Report

## Automated Node tests

- `Scripts.rvdata2` parses to exactly 167 entries.
- Every `Map001.rvdata2` through `Map150.rvdata2` parses as `RPG::Map`.
- Runtime modules import without syntax errors.
- Generated card is Chara Card V3 and contains an enabled TavernHelper character script/button.
- Runtime module-tree manifest covers every static relative ES-module import.
- Card loader source order and all five visible loader states are regression-tested.

## Extraction/audit run

- 165 `.rvdata2` files extracted.
- 150 maps generated.
- 70,425 event command instances / 80 distinct codes inventoried.
- 32 unique embedded Ruby snippets / 38 occurrences inventoried.
- 57 custom/plugin scripts total 667,312 bytes / 16,411 lines.
- `Win32API` static matches: zero.

## Browser smoke test

Direct runtime and card-bootstrap harnesses loaded successfully in the in-app browser. Canvas dimensions were 640×480. Clicking New Game used the original `System.rvdata2` start (`map 7`, `x 7`, `y 6`) and ran the original autorun command list through fade, direct transfer to map 97, player transparency update, fade-in, and switch 4. The map-97 autorun then displayed the original Vietnamese Alice dialogue. Three confirmations reached the original name-input command; a normal test name expanded `\\N[1]` in the original confirmation text. The next original two-option choice rendered and accepted keyboard selection. A regression test executes this exact original command prefix and verifies the two choices `Đúng` / `Không đúng`; a separate branch fixture verifies label/choice selection behavior. Saving and loading slot 1 produced `Saved slot 1.` and `Loaded slot 1.`

The only captured console warning was the expected missing RTP sound `Fire1`. Visual inspection showed diagnostic tiles plus an original custom sheet tile after the graphics sparse checkout; this is not considered a visual-fidelity pass.

## Remote loader diagnostics

The card loader performs a CORS fetch preflight for `module-manifest.json` and every module in the static import tree before calling dynamic `import()` on the real CDN URL. Each source attempt records requested and final URL, redirect state, HTTP status, Content-Type, exposed CORS header, failing stage, error stack, and mount cleanup errors. The actual import remains URL-based; no Blob conversion is used, so relative imports resolve against the selected CDN base.
