# Test Report

Release 0.6.0 passes **68/68** automated tests. The release bundle and card are exported only after pushed-commit/CDN validation.

## Automated coverage

- All 150 maps and every rvdata2 database parse without archive-boundary loss.
- Every runtime ES module imports and the legacy module manifest covers every relative import; the code-only production IIFE bundle parses without unresolved imports and exposes the required runtime global.
- Chara Card V3 structure, enabled TavernHelper script, exact pushed commit pin, generated release manifest, asset manifest, MIME/signature validation, LFS-pointer rejection, and RTP-first resolution.
- Missing ref/entry, bad Content-Type, HTML/error body, LFS pointer, entry integrity mismatch, primary failure/fallback success, visible last-known-good fallback, runtime global/contract, mount, clean retry, versioned build manifest, and production card export guard.
- `origin:null` cache-access `SecurityError` degrades to memory, and unavailable IndexedDB degrades to session-memory save/load rather than aborting boot.
- Request deduplication, timeout/retry/fallback, Cache API reuse, priority reservation, lookahead, Common Event cycle safety, transition barriers, and benchmark behavior.
- Original title/new-game/Cancel lifecycle, Map 97 name modal, same-interpreter resume, choice branches, missing Animation 109 continuation, Map 10 checkpoint, and host exit separation.
- Inventory stacks/use/save normalization; eight-slot equipment restrictions/stat changes; shop and original synthesis recipes.
- Real troop 1 AP battle, smart rating selection, fixed-target retargeting, hit/damage/victory/rewards, casting metadata, and exact variable-60 difficulty matrices.
- Map 97 switch-14 resource barrier and all five active `14遺体` pages.
- Transfer resource barrier resumes the same interpreter and does not execute the following switch command early.
- All nine whole-game dependency indexes and reverse-source evidence.

Expected test diagnostics: the original database references missing RTP animation sheet `Light6`; visual command 212 reports this and continues. This does not fail the suite.

## Clean browser run

The in-app browser loaded a clean local server at runtime 0.6.0. A sandboxed `srcdoc` iframe reported `origin:null`; its CORS preflight fetched the generated manifest, bundle, and all required boot JSON, verified SHA-256, executed the classic bundle, exposed `window.BlackSoulsRuntime`, and mounted successfully. Verified checkpoints:

- Original title art/menu rendered; New Game entered Map 7 and Map 97.
- Name input accepted `Alice`, returned focus, and resumed Event 1 once.
- The blood sequence played `gucha004a`; `14遺体` decoded and appeared with no active-character failure; diagnostics showed the switch-change resource barrier completed.
- Opening reached Map 10 `(15,16)`, scene `PLAYING`, Event 38 index 29, `running=false`, `waitMode=""`.
- Item and eight-slot Equip scenes rendered real state.
- Real troop 1 battle rendered battlers, repository battleback, enemy HP bars, and AP UI. Browser testing exposed and then verified a fix for dead-slot retargeting. Victory cleared battle graphics and restored Map 10/audio.
- The dedicated `loader-smoke.html` path rendered the original title and New Game opening through the same bundled loader architecture used by the JSON card.

## Remote release verification

- GitHub `origin/main` exposed exact runtime commit `f0ed57350f8cf47b80d091df39b9b8cb80101a0f` before card export.
- jsDelivr primary, testingcf fallback, and Fastly fallback all returned HTTP 200 with JavaScript MIME and the same decoded bundle bytes.
- Runtime SHA-256: `E0A4D59609F9AA575C938827C5283EF172C0ED6D5D97872586A8BA6FD8AD2558`.
- Every build-manifest `requiredBootData` URL passed status, MIME, body-signature, and JSON validation.

## Commands

```text
npm run build
npm test
npm run validate:release -- --ref <pushed-commit>
npm run build:card
```
