# VX Ace Tile and Autotile Compatibility

The renderer uses VX Ace tile ID boundaries exactly: B 0, C 256, D 512, E 768, A5 1536, A1 2048, A2 2816, A3 4352, A4 5888, maximum 8192. Map data is indexed as `x + y * width + z * width * height`; converter output is kept in that original six-layer order.

A1 uses the VX Ace kind table and separate surface `[0,1,2,1]` and waterfall `[0,1,2]` clocks. A2, A3, and A4 use their family-specific base coordinates and the canonical floor, wall, and waterfall quarter tables. A5 and B–E are direct 32×32 cells. Invalid shape/source combinations are reported by tile telemetry instead of being hidden with modulo fallback.

Composition order is lower z0, lower z1, VX shadow bits, A2 table edges, lower z2, normal-priority sprites, then star-priority tiles and above-character effects. Tileset flags remain independent: low four passage/direction bits, star `0x10`, ladder `0x20`, bush `0x40`, counter/table `0x80`, damage floor `0x100`, and terrain tag high bits.

Automated resolution walks real Maps7, 10, 18, 97, 98, and 101 and covers B–E plus A1–A5 with no invalid source rectangles. The active-frame tile inspector records map x/y/z, tile ID, family, sheet, source/base/quarters, shape, and flags for diagnosis.
