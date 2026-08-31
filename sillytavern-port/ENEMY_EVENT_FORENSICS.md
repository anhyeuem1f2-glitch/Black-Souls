# Enemy Event Forensics

The live acceptance enemy is the original Map 98 (`Ngục Tối`) event 16, named `敵`, at `(4,19)`. This is not a test-only event: it comes unchanged from `generated/maps/098.json`, which is a normalized read-only extraction of `Data/Map098.rvdata2`.

Page 1 has `Monster1` index 2, normal priority, `through=false`, event-touch trigger 2, move type 3, speed 3, frequency 5, and a repeating custom route containing `enable_symbol_encount(1)`. Script 145 (`145-シンボル.rb`) changes profile 1 to idle-stop speed/frequency 0, detection distance 3 (4 while a moving player dashes), chase speed 4/frequency 5, balloon 1, and no blocked-region IDs. The page executes battle command 301 with fixed troop 3, escape allowed, lose allowed. Troop 3 is `Lợn Đồ Tể`, containing original enemy 2.

Victory sets self switch D and selects page 3; escape sets self switch B and selects page 2. Both later pages are normal-priority, through, parallel cleanup pages. VX Ace last-valid-page precedence means D wins if both switches are set.

Acceptance positions the player at `(7,19)`, three Manhattan tiles from the enemy on passable Map98 tiles. Event 16 detects, emits Decision1/balloon 1, moves through `(5,19)` and `(6,19)`, attempts contact at `(7,19)`, starts its trigger-2 list, and reaches command 301. With the player and event both facing right, script 145's positional table resolves contact condition 2 (surprise), which is carried into the real troop-3 battle.

Source authorities: `generated/maps/098.json`, `generated/database/Troops.json`, `generated/scripts/035-Game_Event.rb`, `generated/scripts/029-Game_CharacterBase.rb`, `generated/scripts/030-Game_Character.rb`, `generated/scripts/116-画面外自律移動.rb`, and `generated/scripts/145-シンボル.rb`.
