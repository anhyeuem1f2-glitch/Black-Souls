# Graphics Fidelity

The Canvas renderer preserves the VX Ace 640×480 viewport, 32 px tiles, nearest-neighbor scaling, exact A1–A5/B–E tile addressing, autotile quarter composition, passage/star/table/shadow layering, bush depth, regular/`$`/`!` character sheets, event priority, parallax/fog, pictures, animations, balloons, tone/flash/shake/weather, title layers, battlebacks, battlers, Window skin, IconSet, gauges, and face portraits.

Map97’s blood/corpse change remains data-driven: Event1 plays `gucha004a`, turns on switch14, and flashes red; switch14 selects `14遺体` pages for Events1 and3–6. Page setup resets the complete sprite state, so the new corpse graphic cannot inherit old movement or visual overrides. Map98 pig corpses and Map125 bottle props remain fixed because their actual pages have fixed movement, while valid autonomous and symbol events retain motion.

Battle graphics now follow Scripts139 and 152–153: cropped actor face status, source battlebacks/battlers, enemy HP/AP gauges, 1/3 mirror eligibility, y-based perspective, breathing scale, and ten additive mist sprites disabled by switch5.

Assets remain manifest-addressed, magic-byte validated, and decoded before critical use. The game repository’s custom sheets are never replaced by RTP files. `AUTOTILE_COMPATIBILITY.md` and `EVENT_MOBILITY_AUDIT.md` contain the engine-level evidence.
