# Test Report

Release 0.8.0 passes **82/82** automated Node tests after card generation. Coverage includes extraction of all 150 maps/database archives, event branching and attached messages, real Map97 class replacement and both opening destinations, exact 60 Hz movement, current-map event page/movement/collision semantics, a real Map98 symbol battle, 16-slot save/export/import, runtime lifecycle/input, LFS/magic-byte/decode safety, prefetch dedupe/cache/priority/barriers, party/inventory/equipment/shop/synthesis, real-data combat, generated manifests, bundle loader/SRI behavior, and Chara Card V3 structure.

One deliberate mock test forces animation 109 to return HTTP 404 and confirms visual failure cannot deadlock opening event logic. The production asset manifest now includes its real `Light6` RTP sheet, so that mock warning is not a production missing asset.

Browser acceptance used the in-app browser against the local runtime. A 35.075-second Map98 movement stress run issued real controller input across horizontal, vertical, diagonal, normal, and dash paths: 443 samples, 1,650 rendered/presented frames, 162 moves, 225 unique camera positions, zero invalid tile lookups, zero missing-tile samples, and zero black-hole frames. The live canvas produced no console error or warning.

A real hostile fixture then loaded original Map98 Event 16 (`Monster1`, trigger 2, normal priority, `enable_symbol_encount(1)`) at `(4,19)` against the player at `(7,19)`. It detected the player, chased two steps, made contact with condition 2 (surprise), issued HIGH-priority battle prefetch, entered fixed troop 3 `Lợn Đồ Tể`, accepted Guard, and let the enemy complete a real Attack action.

Release validation confirms origin fetch/push URLs, the pushed immutable runtime ref, GitHub availability, primary jsDelivr, testingcf fallback, Fastly fallback, all boot JSON, bundle MIME/body, and SHA-256 before card export.
