# Combat Compatibility

The browser battle scene consumes the original Troops, Enemies, Skills, States, Actors, Classes, Weapons, Armors, battlebacks, battlers, faces, animations, audio, and Script153 mist asset.

Implemented original-script systems include exact 4000-point ATB/AP timing and opening ranges, 3-frame refresh, typed chants and cancellation/AP states, dynamic actor commands/skill types, feature-wide weapon attack-ID priority, rating10/rating1 smart enemy AI and VX weighted actions, formula/cost/scope/repeat/guard/drain/critical handling, guts, healing null/reversal, auto-resurrection/breakage, user reaction skills, battle-end expression recovery, victory/escape/lose/game-over, rewards, and variable60 difficulty.

The battle UI uses the source 640×480 arrangement: 4–8 row command window, original localized terms, actor face strip, HP/MP and percentage AP/chant gauges, enemy HP and translucent AP/chant bars. Original Script152 mirror/perspective/breath behavior and ten-sprite additive mist are applied.

Automated acceptance builds real troop1 for smart-AI/reward coverage and runs real Map98 Event16 → troop3 `Lợn Đồ Tể` for symbol-contact battle entry, inventory/skill use, victory, rewards, and retained map encounter context.

The remaining general RGSS boundary is documented in `KNOWN_DIFFERENCES.md`; it does not replace the original battle loop with a generic turn-based approximation. See `BATTLE_SYSTEM_REVERSE_ENGINEERING.md` for the script-level mapping.
