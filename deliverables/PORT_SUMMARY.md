# BLACK SOULS → SillyTavern Port Summary

Release **0.5.0** is delivered as an importable Chara Card V3 at `deliverables/Black_Souls_ST.json`. It requires TavernHelper / JS-Slash-Runner 4.8.19 or a compatible character-script runtime. Gameplay is deterministic and makes no LLM/API generation calls.

## Delivered systems

- Original title and Map 7 → 97 → 10 opening, including name confirmation and Alice blood/corpse transition.
- 150-map extraction plus whole-game map/event/common-event/combat/inventory/UI/audio/reverse-asset dependency indexes.
- Map-scoped predictive streaming, validated LFS/RTP delivery, same-interpreter resource waits, and retryable transfer recovery.
- Persistent party, inventory, item use, eight-slot equipment, status, shop, and synthesis state.
- Real-data AP combat, smart action ratings, skill formulas/scopes/repeats, casting, criticals, drops/rewards, difficulty variable 60, and battle-to-map return.
- IndexedDB save/load and forensic runtime diagnostics.

## Verification

- `npm run build`: passed; regenerated 165 rvdata2 files, audits, manifests, nine dependency artifacts, and the card.
- `npm test`: 53/53 passed.
- Clean browser: runtime 0.5.0 title/opening/blood scene/Map 10/menu/item/equipment verified.
- Clean browser combat: real troop 1 rendered and reached victory; a dead-target retargeting bug found during the run was fixed and regression-tested.
- Card bootstrap: logged `Ready runtime 0.5.0`.
- Original `Game.exe`, `Game.ini`, `System/`, `Data/`, `Graphics/`, and `Audio/` have no Git diff.

## Import

Import `Black_Souls_ST.json` as a character card, enable the included TavernHelper character script when prompted, and select the character. The card mounts the game directly and loads immutable runtime tag `systems-v0.5.0` through CDN fallbacks.

## Compatibility boundary

This release materially extends the playable port but is not a complete browser reimplementation of RGSS3 and every bundled Ruby plugin. See `sillytavern-port/PORT_STATUS.md`, `EVENT_COMMAND_COVERAGE.md`, `CUSTOM_SCRIPT_COVERAGE.md`, and the domain compatibility reports for exact implemented/partial/missing behavior. Missing optional RTP visuals remain diagnostic; render-critical resources use recovery barriers.
