# Combat Compatibility

The browser battle scene now consumes the original Troops, Enemies, Skills, States, Actors, Classes, Weapons, Armors, battleback, battler, animation, and audio data.

Implemented mechanics include:

- ATB/AP configuration from the original scripts: `MAX_AP = 4000`, `FRAME_AP_GAIN = 10`, actor start 30%, enemy start 40%;
- actor commands for attack, skills, usable inventory items, defend, and escape;
- original weapon attack-ID note overrides, MP/TP costs and gains, repeats, major target scopes, HP/MP damage/recovery/drain types, formulas, success/evasion, variance, guarding, and critical ×3;
- rating-10/rating-1 smart-enemy action priority with database conditions, plus normal rating order;
- casting metadata, delayed resolution, and damage interruption;
- state add/remove effects and automatic-resurrection note handling;
- victory/escape/lose/game-over branches, gold, EXP, drops, battle-end recovery tags, and return to the map interpreter;
- enemy HP bars, battler images, battlebacks, party HP/MP/AP display, and combat log.
- symbol-contact preemptive/surprise metadata, with the advantaged side receiving the original opening-initiative adjustment.

Difficulty uses original variable 60 and the exact ten-entry parameter/reward matrices from `162-周回敵の強さ.rb`, including Ruby-compatible parameter flooring, reward rounding, note-tag exemptions, zero normal EXP multipliers, unchanged drop multipliers, and critical multiplier 3.

Automated acceptance builds real troop 1 (`Ám Hồn*3`), loads enemy battler `3`, selects original skill 157 over skill 1 by rating, advances AP, executes damage, reaches victory, applies gold/EXP/drop logic, and preserves party state. Live acceptance additionally enters real Map98 troop 3 through event 16, records the source-defined surprise condition, advances the ATB for 71 frames, accepts player guard input, and records `Lợn Đồ Tể` using Attack for 613 damage.

Known limits: the full 600-line smart-target plugin, all buffs/debuffs/elements/features, every ATB state note tag, battle troop event pages, forced actions, enemy transforms, substitute/counter/reflect, and exact RGSS animation/SE choreography remain partial. `generated/dependencies/combat-dependencies.json` indexes all 355 troops so missing resources can be diagnosed even where mechanics are incomplete.
