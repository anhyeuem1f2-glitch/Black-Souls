# Known Differences

- The port is a deterministic browser compatibility runtime, not the original RGSS3 VM. Unimplemented commands and Ruby-only plugin behavior remain catalogued in `EVENT_COMMAND_COVERAGE.md` and `CUSTOM_SCRIPT_COVERAGE.md`.
- Eight-direction keyboard input is supported in addition to the original cardinal controls. Cardinal/diagonal distance, dash speed, forced-route timing, and current-map event autonomous movement follow the VX Ace formulas.
- Shutdown cannot terminate SillyTavern. The title and in-game exit actions use the explicit pause/Resume host lifecycle or return to title.
- Browser autoplay policy may defer BGM/SE until a trusted user gesture; it never blocks map or UI readiness.
- Cache API may be unavailable in an opaque/restricted iframe. The runtime falls back to memory; IndexedDB save storage separately falls back to session memory when unavailable.
- Full Ruby-plugin parity is not claimed for troop event pages, every conditional operand, vehicles, movies, scrolling, all smart-target features, every element/feature/buff rule, or arbitrary Ruby inside move-route script commands. Script 145 symbol behavior used by ordinary current-map enemies is implemented; exotic project-specific Ruby remains catalogued.
- Some VX Ace rendering edge cases—table terrain, complete tone math, viewport waves, and third-party custom window effects—remain approximate. The requested title/menu/status/item/equip/save/load/battle window geometry and skinning are implemented from the original scripts/assets.
- Final import must use the new 0.9.0 card. Re-import is required because existing SillyTavern cards retain their older embedded loader script and immutable runtime ref.
