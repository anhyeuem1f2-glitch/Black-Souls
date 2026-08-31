# Test Report

Release 0.8.0 passes **82/82** automated Node tests after card generation. Coverage includes extraction of all 150 maps/database archives, event branching and attached messages, real Map97 class replacement and both opening destinations, exact 60 Hz movement, current-map event page/movement/collision semantics, a real Map98 symbol battle, 16-slot save/export/import, runtime lifecycle/input, LFS/magic-byte/decode safety, prefetch dedupe/cache/priority/barriers, party/inventory/equipment/shop/synthesis, real-data combat, generated manifests, bundle loader/SRI behavior, and Chara Card V3 structure.

One deliberate mock test forces animation 109 to return HTTP 404 and confirms visual failure cannot deadlock opening event logic. The production asset manifest now includes its real `Light6` RTP sheet, so that mock warning is not a production missing asset.

Browser acceptance used the in-app browser against the local runtime. A 35.010-second Map98 movement stress run issued real controller input across horizontal, vertical, diagonal, normal, and dash paths: 560 samples, 1,638 rendered/presented frames, 158 moves, 278 unique camera positions, zero invalid tile lookups, zero missing-tile samples, and zero black-hole frames.

A real hostile fixture then loaded original Map98 Event 16 (`Monster1`, trigger 2, normal priority, `enable_symbol_encount(1)`) at `(4,19)` against the player at `(7,19)`. It detected the player, chased two steps, made contact with condition 2 (surprise), issued HIGH-priority battle prefetch, and entered fixed troop 3 `Lợn Đồ Tể`. The player completed Guard, the enemy completed Attack for 613 damage, and the player completed Attack for 200 damage, finishing the battle in victory.

The generated `deliverables/Black_Souls_ST.json` also passed a production-loader browser smoke. Its embedded TavernHelper script fetched the runtime bundle from the exact jsDelivr URL for `a8395c22f4427e3313f75ed5a5db61e40181a484`, mounted `.black-souls-host`, reported `Ready`, and presented the 640×480 game canvas.

Release validation confirmed both origin URLs as `https://github.com/anhyeuem1f2-glitch/Black-Souls.git`, remote main at `a8395c22f4427e3313f75ed5a5db61e40181a484`, primary jsDelivr, testingcf fallback, Fastly fallback, every boot JSON response, bundle MIME/body, and SHA-256 `1D1FC59EAE6FB1CD5C78A36024296E4A386C0F6D8260513D6D0679C7233DA31C` before card export.
