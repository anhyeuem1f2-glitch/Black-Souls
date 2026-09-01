# BLACK SOULS SillyTavern Port Status

Release **0.9.0** is pinned to verified runtime commit `4fb2b2b62433f9ff53cecc9c71e6873e9360e7c3` with bundle SHA-256 `FFAF2468F726FCCBA47930E50AB4A46EFA1FC6A4E3DB62BC484718E8DE692E03`. The runtime was built from source commit `26efb7d872ba0c35f3d68bb96ec2676d03f8161f`.

This release keeps the original Map7 → Map97 opening, both Map10/Map98 branches, class replacement, 16-slot saves, original-style menus, resource barriers, and atomic black-flash-free frame presentation. It adds an evidence index for every one of the 6,444 event pages, prevents fixed corpses/props from inheriting mobility, preserves real autonomous/symbol movement, and starts battles only from eligible original symbol events.

Map graphics now use VX Ace B–E/A5/A1–A4 IDs, quarter tables, independent A1 animation clocks, six-layer indexing, shadows, table edges, normal/star priority, and distinct tileset flags. Real Maps7, 10, 18, 97, 98, and 101 resolve without invalid tile sources.

Battle is rebuilt from Scripts122–162: exact ATB/AP cadence and ranges, chants/AP states, dynamic commands, attack replacement priority, smart enemy AI, original formulas/effects and custom note mechanics, difficulty, rewards, source UI, battler mirror/perspective/breath, and battle mist.

Live in-app acceptance presented 654/654 Map98 stress frames across 133 camera positions with 109 moves and 71 dash moves: zero invalid tile lookups, missing samples, black-hole frames, or retained fallbacks. Original Event16 detected, chased two steps, contacted under condition2, entered surprise troop3 `Lợn Đồ Tể`, completed guard/enemy/player actions, and finished in victory. Original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` have no Git diff.
