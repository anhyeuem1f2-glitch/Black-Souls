# BLACK SOULS SillyTavern Port Status

Release **0.7.0** is pinned to verified runtime commit `188bf2be16f87b4e531e9bd7526b0395d5fb6e23` with bundle SHA-256 `C7366CD06CC3E17930A9B3B1535161D08216D99FD246E3FA8A324176821B971A`.

This release restores the source-defined Map 7 → Map 97 opening and both final branches: skip to Map 10 `(15,16)` and no-skip to Map 98 `(55,5)`. Class choice performs real party replacement (actor 2/3/4), copies the entered name, applies class variables/switches/gifts, and renders the actual party leader.

VX Ace-styled title, menu, item, skill, equipment, status, file, message/choice, and battle windows use the original Window skin/IconSet at 640×480. Save schema v2 provides exactly 16 IndexedDB slots, metadata, title Continue → load selection, full state restore, and JSON export/import. Movement is fixed at 60 Hz with the original `2 ** real_move_speed / 256.0` formula, dash +1 speed, and unnormalized diagonal travel.

Streaming pins global UI/title resources, warms Map 7/97/10/98, deduplicates in-flight fetch/decode work, gates map visibility on decoded critical resources, and instruments queues/caches/transitions. The authoritative RTP subset completes Map98 without replacing custom game assets.

The browser acceptance run completed the unskipped Map98 cutscene, opened the original menu, scrolled to and saved slot 16, returned to title, confirmed Continue opened the load-file scene, and reloaded Map98 with `Grim`, actor 2, item 47, and no unsupported commands. Original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` have no Git diff.

The compatibility boundary remains documented in `KNOWN_DIFFERENCES.md`, `EVENT_COMMAND_COVERAGE.md`, and `CUSTOM_SCRIPT_COVERAGE.md`.
