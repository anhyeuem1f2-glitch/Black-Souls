# Battle System Reverse Engineering

Release 0.9.0 rebuilds combat from original Scripts122–162 and normalized original Actors, Classes, Equipment, States, Skills, Enemies, and Troops.

ATB uses `MAX_AP = 4000`, `FRAME_AP_GAIN = 10`, refresh cadence 3, minimum agility contribution 5, exact normal/preemptive/surprise/failed-escape start ranges, feature note modifiers, chant types and timing, chant cancellation/AP control states, and action-end AP tags. Ready battlers are resolved in combined party/troop order, with completed chants taking priority.

Actor commands are generated from feature codes 41/42 in the source order Attack, every added unsealed skill type, Defend, Item, Escape, using the original localized System terms and the original 4–8 row layout. Weapon attack replacement scans every feature object and applies `<攻撃ID優先度変更>` before the highest skill-ID tiebreak.

Enemy decisions preserve rating10 smart rules, rating1 exclusions, HP/MP/state target filters, optional smart randomization, VX Ace action conditions, usable-cost checks, and weighted normal ratings. Damage covers formulas, costs/gain, repeats/scopes, hit/evasion, variance, guard, drain, critical ×3, states, guts state59, recovery null/reversal, feature-based probabilistic auto-resurrection/breakage, `<使用者効果>`, and battle-end HP/MP/TP/state expressions. Difficulty is the original variable60 ten-row matrix.

Battle presentation uses original battlebacks, battlers and actor faces; shows enemy HP and translucent AP/chant bars; uses the original face strip/AP percentage layout; applies Script152 mirror, perspective and breathing rules; and loads ten additive `Graphics/System/mist.png` sprites unless switch5 disables them.

The real early-game fixture is Map98 Event16 → troop3 `Lợn Đồ Tể`, retaining its map/event encounter context. Acceptance uses a real inventory item and real actor skill163, reaches victory, awards original rewards, and returns through the map-owned battle continuation.
