# BLACK SOULS SillyTavern Port Status

Release **0.8.0** is pinned to verified runtime commit `a8395c22f4427e3313f75ed5a5db61e40181a484` with bundle SHA-256 `1D1FC59EAE6FB1CD5C78A36024296E4A386C0F6D8260513D6D0679C7233DA31C`. The runtime was built from source commit `7a810cc47ec820116c0700210729377126184a69`.

This release restores the source-defined Map 7 → Map 97 opening and both final branches: skip to Map 10 `(15,16)` and no-skip to Map 98 `(55,5)`. Class choice performs real party replacement (actor 2/3/4), copies the entered name, applies class variables/switches/gifts, and renders the actual party leader.

VX Ace-styled title, menu, item, skill, equipment, status, file, message/choice, and battle windows use the original Window skin/IconSet at 640×480. Save schema v2 provides exactly 16 IndexedDB slots, metadata, title Continue → load selection, full state restore, and JSON export/import. Player and current-map event movement is fixed at 60 Hz with source page setup, autonomous movement, priority/through collision, and Script 145 symbol encounters.

Streaming pins global UI/title resources, warms Map 7/97/10/98, deduplicates in-flight fetch/decode work, gates map visibility on decoded critical resources, and instruments queues/caches/transitions. Active symbol chase issues HIGH-priority battle resource prefetch. The renderer uses an offscreen frame buffer and integer tile windows, so fractional camera motion cannot expose the dark clear color.

Browser acceptance exercised 35 seconds of real input over Map98 with horizontal, vertical, diagonal, normal, and dash movement: 1,650 presented frames, 225 camera positions, zero invalid tile lookups, zero missing-tile samples, and zero black-hole frames. A separate real-data fixture placed the player at `(7,19)` and hostile Event 16 at `(4,19)`; the enemy detected, chased two tiles, contacted the player, and entered troop 3 `Lợn Đồ Tể`, whose enemy completed a real attack after Guard. Original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` have no Git diff.

The compatibility boundary remains documented in `KNOWN_DIFFERENCES.md`, `EVENT_COMMAND_COVERAGE.md`, `CUSTOM_SCRIPT_COVERAGE.md`, and the release 0.8 compatibility notes.
