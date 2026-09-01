# Test Report

Release 0.9.0 passes **91/91** automated Node tests after runtime and card generation. Coverage includes all 150 original maps/database archives, all 6,444 page mobility classifications, real fixed and autonomous event fixtures, exact 60 Hz movement/collision/symbol contact, VX Ace tile-family/quarter/layer/flag mapping, opening flow, saves/UI, asset validation and streaming, party systems, original-script ATB/AP and custom battle tags, real troops, module completeness, loader integrity/fallback behavior, and Chara Card V3 structure.

One deliberate mock forces animation109 to return HTTP404 and proves visual failure cannot deadlock opening event logic. Production contains the real `Light6` RTP sheet, so those logged warnings are test-only.

Live in-app browser acceptance ran Map98 for 35.281 seconds: 226 samples, 654 rendered/presented frames, 109 moves, 71 dash moves, and 133 unique camera positions. It observed zero invalid tile lookups, missing tile samples, black-hole frames, and retained fallbacks.

The real hostile fixture used original Map98 Event16 (`Monster1`, trigger2, normal priority, `enable_symbol_encount(1)`) at `(4,19)` against the player at `(7,19)`. It detected the player, chased two steps, contacted under condition2 (surprise), completed HIGH-priority troop prefetch, and entered troop3 `Lợn Đồ Tể`. Player guard, enemy Attack for 588, and player Attack for 200 completed a real victory in 42 battle frames. Browser error/warning logs were empty.

Release validation confirmed fetch/push origin URLs, remote main `4fb2b2b62433f9ff53cecc9c71e6873e9360e7c3`, primary jsDelivr and testingcf/Fastly fallbacks, every required boot JSON response, bundle MIME/body, and SHA-256 `FFAF2468F726FCCBA47930E50AB4A46EFA1FC6A4E3DB62BC484718E8DE692E03` before exporting `deliverables/Black_Souls_ST.json`.
