# Test Report

Release 0.7.0 passes **72/72** automated Node tests after card generation. Coverage includes extraction of all 150 maps/database archives, event branching and attached messages, real Map97 class replacement and both opening destinations, exact 60 Hz movement, 16-slot save/export/import, runtime lifecycle/input, LFS/magic-byte/decode safety, prefetch dedupe/cache/priority/barriers, party/inventory/equipment/shop/synthesis, real-data combat, generated manifests, bundle loader/SRI behavior, and Chara Card V3 structure.

One deliberate mock test forces animation 109 to return HTTP 404 and confirms visual failure cannot deadlock opening event logic. The production asset manifest now includes its real `Light6` RTP sheet, so that mock warning is not a production missing asset.

Browser acceptance used the in-app browser against the local runtime. Verified checkpoints: original title; Map 7 `(7,6)` → Map 97 `(12,18)`; name `Grim`; knight selection replacing actor 1 with actor 2/`$主人公`; attached black-tone skip prompt; unskipped transfer to Map98 `(55,5)` with 12/12 critical resources; Event10 completion; VX Ace menu; four-row file window scrolling through 16 slots; slot-16 save; title Continue opening load selection; and full Map98 reload with no unsupported commands.

Release validation confirmed origin fetch/push URLs, remote main at `188bf2be16f87b4e531e9bd7526b0395d5fb6e23`, GitHub availability, primary jsDelivr, testingcf fallback, Fastly fallback, all boot JSON, bundle MIME/body, and SHA-256 `C7366CD06CC3E17930A9B3B1535161D08216D99FD246E3FA8A324176821B971A` before card export.
