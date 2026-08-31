# BLACK SOULS → SillyTavern Port Summary

Release **0.6.0** is delivered as an importable Chara Card V3 at `deliverables/Black_Souls_ST.json`. It requires TavernHelper / JS-Slash-Runner 4.8.19 or a compatible character-script runtime. Gameplay is deterministic and makes no LLM/API generation calls.

## Delivered systems

- Original title and Map 7 → 97 → 10 opening, including name confirmation and Alice blood/corpse transition.
- 150-map extraction plus whole-game map/event/common-event/combat/inventory/UI/audio/reverse-asset dependency indexes.
- Map-scoped predictive streaming, validated LFS/RTP delivery, same-interpreter resource waits, and retryable transfer recovery.
- Persistent party, inventory, item use, eight-slot equipment, status, shop, and synthesis state.
- Real-data AP combat, smart action ratings, skill formulas/scopes/repeats, casting, criticals, drops/rewards, difficulty variable 60, and battle-to-map return.
- IndexedDB save/load, restricted-origin memory fallback, and forensic runtime diagnostics.
- Environment-aware loader with a single browser bundle, generated build manifest, SHA-256/SRI, explicit resource bases, three verified CDN sources, visible last-known-good fallback, and clean Retry.

## Verification

- Runtime bundle build: passed from committed source and produced SHA-256 `E0A4D59609F9AA575C938827C5283EF172C0ED6D5D97872586A8BA6FD8AD2558`.
- `npm test`: 68/68 passed.
- Clean `origin:null` browser: runtime 0.6.0 integrity/global/mount/title/New Game verified; prior title/opening/blood scene/Map 10/menu/item/equipment coverage remains regression-tested.
- Clean browser combat: real troop 1 rendered and reached victory; a dead-target retargeting bug found during the run was fixed and regression-tested.
- Production exact-ref bootstrap reached remote runtime game-data initialization; all runtime and boot-data URLs passed independent Git/CDN validation.
- Original `Game.exe`, `Game.ini`, `System/`, `Data/`, `Graphics/`, and `Audio/` have no Git diff.

## Import

Re-import `Black_Souls_ST.json` as a character card, enable the included TavernHelper character script when prompted, and select the character. The card mounts the game directly and loads verified immutable runtime commit `f0ed57350f8cf47b80d091df39b9b8cb80101a0f` through integrity-checked CDN fallbacks.

## Compatibility boundary

This release materially extends the playable port but is not a complete browser reimplementation of RGSS3 and every bundled Ruby plugin. See `sillytavern-port/PORT_STATUS.md`, `EVENT_COMMAND_COVERAGE.md`, `CUSTOM_SCRIPT_COVERAGE.md`, and the domain compatibility reports for exact implemented/partial/missing behavior. Missing optional RTP visuals remain diagnostic; render-critical resources use recovery barriers.
