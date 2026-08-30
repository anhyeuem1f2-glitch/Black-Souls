# Port Status

## Implemented foundation

- [x] Original files isolated from all port writes.
- [x] Ruby Marshal 4.8 decoder with object/symbol links, strings, RPG objects, `Table`, `Color`, and `Tone` normalization.
- [x] All 165 `.rvdata2` files extract reproducibly; all 167 scripts inflate.
- [x] All 150 map JSON files retain four table layers, events, pages, conditions, move routes, and exact event command codes/parameters.
- [x] 80-code command coverage and 32-snippet embedded Ruby inventories.
- [x] Canvas host at logical 640×480.
- [x] Original System start map/coordinates loaded (`7`, `7`, `6`).
- [x] Partial interpreter executes the original map-7 autorun transfer to map 97.
- [x] IndexedDB save slot 1 survives load within the browser profile.
- [x] Chara Card V3 JSON with `data.extensions.tavern_helper` script schema verified against installed TavernHelper source.
- [x] LFS-pointer detection, magic-byte validation, centralized asset resolver, and isolated browser-ready RTP subset.
- [x] Verified Map 7 → Map 97 tile/sprite/fog/BGM/SE rendering with original assets.
- [x] Command 212 animation and command 213 balloon rendering; compatibility diagnostics stay out of player status.
- [x] Direct card boot: the TavernHelper iframe auto-mounts without a normal `Open BLACK SOULS` launcher and covers the SillyTavern interaction surface while active.
- [x] Original `Scene_Title`: `Graphics/Titles1/1.png` is stretched to the script-declared 640×480 surface, the original Vietnamese command labels are used, Continue reflects IndexedDB slot 1, and title BGM is deferred until browser audio unlock.
- [x] Explicit host states and recovery: `LOADING`, `TITLE`, `PLAYING`, `MENU`, `PAUSED`, `ERROR`, and `UNMOUNTED`; explicit Exit compacts the iframe into a persistent Resume control.
- [x] VX Ace Cancel lifecycle: Escape/X opens or closes the in-game menu and never hides/unmounts the iframe; fullscreen changes preserve game scene/state.
- [x] Map renderer commits map, sheets, sprites, and fog atomically and retries after a frame error instead of permanently killing the animation loop.

## In progress / partial

- [~] Tiles: A1–A4 quarter composition, animation, A5/B–E, star priority, and shadows are implemented; broader map golden comparisons remain.
- [~] Collision: VX Ace directional tile flags and the original 8-direction script's strict two-route diagonal check/cardinal fallback are honored; event collision, counter tiles, boats, regions, and other plugin rules remain.
- [~] Events: 28 of 80 command codes have some implementation; several are only partial.
- [~] Ruby event compatibility: 3 simple patterns are mapped; the complete 32-snippet registry remains.
- [~] Audio: map BGM/BGS and SE use manifest-resolved real binaries; fades, ME, pan, and full event coverage remain.

## Not implemented

- [~] Menu fidelity: original menu and game-end command labels/cancel structure render; Item/Skill/Equip/Status scenes and full actor/status windows are intentionally disabled pending their real implementations.
- [ ] Full name-input window fidelity (the current browser input remains functional but is not the original grid).
- [ ] Full message/choice/branch/loop interpreter behavior.
- [ ] Pictures, weather, complete move routes, shops, battles, common-event scheduling.
- [ ] ATB/AP, casting, smart enemy AI, battle UI, difficulty variable 60, and other custom battle systems.
- [ ] Remaining 8-direction integrations (event collision/move routes), symbol encounters, footsteps, journal UI, synthesis, world map.
- [ ] Complete save schema parity and migrations.
- [ ] User-side re-import and final native confirmation on the authenticated `st.proxyvn.top` deployment (direct browser and same-origin TavernHelper-style iframe harness are verified).

## Traced boot facts

- Title asset: `Graphics/Titles1/1.png`, original binary 376,160 bytes, decoded 560×420, then stretched by `RGSSLAB::XP_Display_Size::TITLE_TYPE = 1` to 640×480. `Titles2` is unused and `opt_draw_title` is false.
- Title BGM: `Audio/BGM/タイトル、アリス.mp3`.
- New Game: map 7 at `(7,6)`, tileset ID 1 `フィールド`, sheets `World_A1`, `World_A2`, `World_B`.
- Original map-7 autorun transfers to map 97 `Thư Viện`, tileset ID 3 `内装`, using `Inside_A1`, `Inside_A2`, `Inside_A4`, `Inside_A5`, `Inside_B`, `Inside_C`, `treesrestaffmar11_soruve`, and `VXTileB` plus fog `kurayami01`.
- Player: actor 1 graphic `!Flame`, character index 5. The verified map-97 path also renders `$c_54b` and `!Other3` event sprites.
