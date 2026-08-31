# Save Format

Release 0.7.0 uses IndexedDB database `black-souls-sillytavern` version 2. It exposes exactly 16 numbered save slots, matching `DataManager.savefile_max` in the original VX Ace scripts. The stores are `saves`, `metadata`, and `settings`; restricted iframes fall back to session memory without aborting the game.

Save records use schema `black-souls-st-save-v2`. The payload retains map identity and real/tile position, direction and movement route state, switches, variables, self switches, party members, actor identity/class/name/graphics/stats/equipment/states, inventory and gold, timer/playtime/steps, system flags, screen/picture/weather state, interpreter compatibility state, battle return state, and supported plugin data. Slot metadata contains player name, level, map/location, party graphics, playtime, and timestamp.

The title `Tiếp Tục` command opens the load-file scene rather than auto-loading. Save and load show four 108 px file windows at a time and scroll through all 16 slots. Save defaults to the last accessed slot; load defaults to the newest usable slot. The host `Export Save` and `Import Save` controls round-trip a versioned JSON envelope, and import validates the envelope before writing its target slot.

Version-1 records remain readable. Database upgrades are additive and do not rewrite the canonical original game data.
