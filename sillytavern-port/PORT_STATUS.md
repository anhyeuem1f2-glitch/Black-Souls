# BLACK SOULS SillyTavern Port Status

Release: **0.5.0** (`systems-v0.5.0`)

The importable Chara Card V3 boots a deterministic browser game in a TavernHelper iframe and makes no model/API gameplay calls. It starts at the original title, executes the Map 7 → Map 97 → Map 10 opening, and keeps game Cancel/Menu separate from the explicit SillyTavern exit control.

## Implemented in this release

- Complete extraction/audit of 150 maps, 6,444 events, 248 common events, 355 troops, 70,425 event commands, database content, and 167 Ruby script entries.
- Nine required whole-game dependency/reverse indexes across map, event, common event, combat, inventory, UI, audio, and assets.
- Predictive bounded streaming plus a generic same-interpreter resource barrier with transfer rollback and Retry/Cancel recovery.
- Exact Map 97 name-input continuation and switch-14 `14遺体` blood/corpse page transition.
- VX Ace map/tile/character/fog/picture/screen-effect rendering and real title/audio paths.
- Persistent party, stack inventory, item use, eight-slot equipment, status, shop, and 15-recipe synthesis systems.
- Real troop/enemy/skill battle state with MAX_AP 4000, deterministic hit/variance/critical rolls, smart action ratings, casting/interruption, rewards/drops, difficulty variable 60, and map return.
- IndexedDB saves containing party, actor, inventory, equipment, recipes, event state, and pictures.
- Immutable card release pin with runtime preflight and CDN fallback diagnostics.

## Browser-verified vertical slices

1. Clean 0.5.0 title → New Game → name modal → `Alice. XÁC NHẬN?` → accepted branch.
2. Map 97 switch 14 loaded and displayed `14遺体`; diagnostics showed the graphic decoded, no missing active character, and the same interpreter continuing at index 238.
3. Opening completed at Map 10 `(15,16)` with interpreter stopped cleanly at Event 38 index 29 and no wait mode.
4. Cancel opened the original menu; Item showed real opening inventory; Equip showed all eight actor slots.
5. The battle harness loaded real troop 1, three battlers, a repository battleback, AP/HP UI, accepted keyboard attacks, retargeted living enemies, reached victory, cleared the battle renderer, restored Map 10 BGM, and returned to `PLAYING`.
6. The card bootstrap path loaded local modules and logged `Ready runtime 0.5.0`.

## Explicit remaining gaps

This is not full RGSS3/plugin parity. The authoritative gaps are in `EVENT_COMMAND_COVERAGE.md`, `CUSTOM_SCRIPT_COVERAGE.md`, `KNOWN_DIFFERENCES.md`, and the domain reports. Important partial areas include move-route breadth, all conditional operand types, battle troop event pages, the complete smart-target plugin, elements/features/buffs, key-item/number-input UI, movie/vehicle/scroll commands, and numerous custom Ruby systems. The supplied game/repository also lacks 212 referenced RTP resources; opening-critical RTP is bundled, optional missing visuals are diagnostic, and critical missing resources block with recovery.

## Artifacts

- Runtime: `sillytavern-port/runtime/`
- Generated data/indexes: `sillytavern-port/generated/`
- Source card build: `sillytavern-port/card/Black_Souls_ST.json`
- Final deliverable: `deliverables/Black_Souls_ST.json`
