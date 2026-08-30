# Graphics and Audio Audit

## Confirmed root causes

- The Git object for `Graphics/Tilesets/Inside_C.png` is a Git LFS pointer, while the working-tree file is a real 346,411-byte PNG.
- jsDelivr returned HTTP 200 and `image/png` for that path but the response body was the 131-byte LFS pointer. Passing it directly to an image decoder caused the broken/blank graphics behavior.
- `media.githubusercontent.com/media/.../Inside_C.png` returned the real 346,411-byte PNG with CORS enabled.
- Required standard files including `Inside_A1`, `Inside_A2`, `Inside_A4`, `Inside_A5`, `Inside_B`, `!Flame`, `!Other3`, and `Fire1` were absent from the original Git tree because the game depends on installed VX Ace RTP.

## Boot dependency trace

`System.start_map_id = 7`, position `(7,6)`, party actor 1 (`!Flame`, index 5).

Map 7 uses tileset 1 (`World_A1`, `World_A2`, `World_B`). Its autorun fades out, transfers the player to Map 97 `(12,18)`, plays `Fire1`, restores visibility, fades in, and sets switch 4.

Map 97 (`Thư Viện`) uses tileset 3: `Inside_A1`, `Inside_A2`, `Inside_A4`, `Inside_A5`, `Inside_B`, `Inside_C`, `treesrestaffmar11_soruve`, and `VXTileB`. The active event sprites are `$c_54b` and `!Other3`; the player remains `!Flame`. It loads fog `kurayami01`, autoplays `Audio/BGM/タイトル、アリス.mp3`, and uses the RTP balloon/animation/SE assets on the opening event path.

## Runtime checks

The Diagnostics panel exposes runtime manifest URL, map/tileset/player asset, per-source asset counts, cache state, rejected pointer count, last failing attempt, audio channels, render timing, fog/animation/balloon state, and compatibility-only event codes. Normal player status no longer displays raw compatibility code 212.
