# BLACK SOULS → SillyTavern 0.7.0

Import `Black_Souls_ST.json` and enable its TavernHelper / JS-Slash-Runner character script. Re-import is required for this release. Gameplay is deterministic and makes no AI generation calls.

Delivered: exact Map 7 `(7,6)` → Map 97 `(12,18)` opening; class actor replacement; skip → Map 10 `(15,16)` and no-skip → Map 98 `(55,5)`; VX Ace Window/IconSet title/menu/status/item/equip/save/load/battle UI; 16 IndexedDB slots with full-state load and export/import; fixed-60 Hz VX Ace movement/dash/diagonal behavior; and decoded-resource prefetch with opening-route warming, pinning, dedupe, and diagnostics.

The card pins verified runtime commit `188bf2be16f87b4e531e9bd7526b0395d5fb6e23`, source commit `6527019cf04d15c77a8b0bfac1d85881b0e5f62a`, runtime 0.7.0, and bundle SHA-256 `C7366CD06CC3E17930A9B3B1535161D08216D99FD246E3FA8A324176821B971A`. GitHub, primary CDN, and fallback CDNs passed the release gate before card generation.

Verification: 72/72 automated tests; full browser unskipped opening; Map98 Event10 completion; 12/12 critical resources; slot-16 save; title Continue → load-file scene; Map98 reload with actor 2/`$主人公`, item 47, and no unsupported commands. Original game files modified: **NONE**.
