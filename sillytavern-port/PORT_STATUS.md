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

## In progress / partial

- [~] Tiles: B–E and A5 direct tiles are drawn from original sheets; autotile composition is currently approximate.
- [~] Collision: VX Ace directional tile flags are honored; event collision, counter tiles, boats, regions, and plugin rules remain.
- [~] Events: 28 of 80 command codes have some implementation; several are only partial.
- [~] Ruby event compatibility: 3 simple patterns are mapped; the complete 32-snippet registry remains.
- [~] Audio: lazy SE path exists, but extension fallback and RTP assets remain.

## Not implemented

- [ ] Title/menu/name-input fidelity.
- [ ] Full message/choice/branch/loop interpreter behavior.
- [ ] Pictures, weather, animation, complete move routes, shops, battles, common-event scheduling.
- [ ] ATB/AP, casting, smart enemy AI, battle UI, difficulty variable 60, and other custom battle systems.
- [ ] Full 8-direction plugin semantics, symbol encounters, fog/parallax, footsteps, journal UI, synthesis, world map.
- [ ] Complete save schema parity and migrations.
- [ ] Native SillyTavern import test (direct browser and card-bootstrap harness are tested; the installed SillyTavern tree was kept read-only and not launched).
