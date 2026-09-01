# Map Rendering Compatibility

Release 0.9.0 retains the atomic 640×480 backbuffer and integer logical camera that removed movement black flashes, then replaces the prior approximate tile selection and composition with VX Ace rules.

`state.displayX/displayY` is authoritative. The renderer uses VX Ace centers (9.5 tiles horizontally, 7 vertically), clamps to map bounds, rounds once to logical pixels, and samples only integer map coordinates with a two-tile margin. A failed frame retains the last complete visible frame.

Tile decoding now uses the exact B–E/A5/A1–A4 boundaries, family-specific kind/base formulas, canonical quarter tables, independent A1 water/waterfall clocks, and the source six-layer converter layout. Rendering order is z0, z1, shadows, table edges, z2, normal-priority sprites, then star-priority tiles. Star, passage, ladder, bush, counter/table, damage, and terrain flags are decoded independently.

Real-data regression walks Maps7, 10, 18, 97, 98, and 101. Every sampled tile resolves to a valid source rectangle, and the samples collectively cover all A1–A5 and B–E families. Active-frame telemetry exposes the exact mapping and flag interpretation for tile inspection.

See `AUTOTILE_COMPATIBILITY.md` for formulas, layer order, and the test matrix.
