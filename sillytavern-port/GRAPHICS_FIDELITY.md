# Graphics Fidelity

The canvas renderer preserves the VX Ace 640×480 logical viewport, 32 px tiles, nearest-neighbor scaling, A1–A5 autotiles, upper-tile priority, shadows, bush depth, regular and `$` character sheets, event priority, title layers, battlebacks, battlers, fog, pictures, animations, balloons, tint/flash/weather overlays, and menu/battle windows.

## Alice opening verification

The apparent blood/corpse change in Map 97 is data-driven, not a show-picture command. Map 97 Event 1 page 0 plays SE `gucha004a`, enables switch 14 at command index 230, and flashes red. Switch 14 activates the `14遺体` page on Events 1 and 3–6. The runtime now suspends the same event interpreter until `Graphics/Characters/14遺体.png` has decoded, then renders all five active corpse pages before continuing. This exact behavior has a regression test.

Pictures support origin, position, scale, opacity, blend, timed movement, rotation speed, and a conservative dark-tone overlay. Renderer diagnostics expose active pictures, screen effects, battle layers, missing character sheets, animation failures, map/tileset, and decoded sheet names.

## Known fidelity limits

- The original references RTP animation sheet `Graphics/Animations/Light6.png`, which is absent from the supplied game tree and repository. Animation 109 therefore reports a non-fatal missing visual and lets the opening continue.
- `Graphics/Tilesets/Dungeon_C.png` is also absent; its reverse source is tileset 4.
- Full VX Ace color-tone math, every move-route opcode, viewport wave effects, movie playback, and all third-party RGSS window skins are not pixel-identical.
- Missing optional RTP art is omitted with diagnostics. Render-critical map/page art instead triggers the resource recovery barrier.
