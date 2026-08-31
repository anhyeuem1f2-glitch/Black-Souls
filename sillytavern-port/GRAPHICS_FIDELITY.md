# Graphics Fidelity

The Canvas renderer preserves the VX Ace 640×480 viewport, 32 px tiles, nearest-neighbor scaling, A1–A5 autotiles, B–E upper tiles and priority, shadows, bush depth, regular/`$`/`!` character sheets, event priority, parallax/fog, pictures, animations, balloons, tone/flash/shake/weather, title layers, battlebacks, battlers, Window skin, IconSet, gauges, and face portraits.

Map 97's blood/corpse change remains data-driven: Event 1 plays `gucha004a`, turns on switch 14, and flashes red; switch 14 selects the `14遺体` pages for Events 1 and 3–6. The interpreter waits for newly active graphics before continuing. The original black tone is composited below the message/choice layer, preserving the skip prompt.

The official VX Ace RTP subset now includes the opening's missing standard assets, including `Light6`, `Damage3`, `Monster1`, Dungeon A1/A2/A4/A5/C, and Map98 SE. The game repository's custom `Dungeon_B.png` is never replaced. All files are manifest-addressed, magic-byte validated, and decoded before critical use.

Remaining pixel-level differences are limited to compatibility areas such as complete VX Ace tone math, terrain table edge cases, viewport wave effects, movie playback, and third-party Ruby-only window behavior. They are not used to substitute a web-style UI for the restored title/menu/status/item/equip/save/load/battle scenes.
