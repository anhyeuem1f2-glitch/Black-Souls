# Test Report

Release 0.5.0 passes **53/53** automated tests after a clean full build.

## Automated coverage

- All 150 maps and every rvdata2 database parse without archive-boundary loss.
- Every runtime ES module imports and the module manifest covers every relative import.
- Chara Card V3 structure, enabled TavernHelper script, immutable release pin, asset manifest, MIME/signature validation, LFS-pointer rejection, and RTP-first resolution.
- Request deduplication, timeout/retry/fallback, Cache API reuse, priority reservation, lookahead, Common Event cycle safety, transition barriers, and benchmark behavior.
- Original title/new-game/Cancel lifecycle, Map 97 name modal, same-interpreter resume, choice branches, missing Animation 109 continuation, Map 10 checkpoint, and host exit separation.
- Inventory stacks/use/save normalization; eight-slot equipment restrictions/stat changes; shop and original synthesis recipes.
- Real troop 1 AP battle, smart rating selection, fixed-target retargeting, hit/damage/victory/rewards, casting metadata, and exact variable-60 difficulty matrices.
- Map 97 switch-14 resource barrier and all five active `14遺体` pages.
- Transfer resource barrier resumes the same interpreter and does not execute the following switch command early.
- All nine whole-game dependency indexes and reverse-source evidence.

Expected test diagnostics: the original database references missing RTP animation sheet `Light6`; visual command 212 reports this and continues. This does not fail the suite.

## Clean browser run

The in-app browser loaded a clean local server at runtime 0.5.0. Verified checkpoints:

- Original title art/menu rendered; New Game entered Map 7 and Map 97.
- Name input accepted `Alice`, returned focus, and resumed Event 1 once.
- The blood sequence played `gucha004a`; `14遺体` decoded and appeared with no active-character failure; diagnostics showed the switch-change resource barrier completed.
- Opening reached Map 10 `(15,16)`, scene `PLAYING`, Event 38 index 29, `running=false`, `waitMode=""`.
- Item and eight-slot Equip scenes rendered real state.
- Real troop 1 battle rendered battlers, repository battleback, enemy HP bars, and AP UI. Browser testing exposed and then verified a fix for dead-slot retargeting. Victory cleared battle graphics and restored Map 10/audio.
- `card-smoke.html` logged `Ready runtime 0.5.0` through the same card entry used in the JSON.

## Commands

```text
npm run build
npm test
```
