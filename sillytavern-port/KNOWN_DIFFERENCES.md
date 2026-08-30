# Known Differences

- VX Ace A1–A4 autotiles now use quarter-tile composition, animated water/waterfalls, A5/B–E sheets, star priority, and map shadows. Edge cases such as terrain-specific table rendering still need broader golden-map comparison.
- Player and active event sprites use original `$`/`!` sheet semantics and cardinal rows during eight-direction movement. Full move-route animation cadence and event collision remain incomplete.
- Boot-map fog, BGM, SE, database animations (command 212), and balloons (command 213) are implemented. Pictures, weather, screen flashes/shakes, and full animation timing SE/flash behavior remain incomplete.
- The original title background, title BGM, title command window placement, New Game, Continue availability, and Shutdown intent are implemented. Shutdown maps to the safe SillyTavern-specific explicit pause/Resume lifecycle instead of terminating the whole browser page.
- The map menu shows the original Vietnamese Item/Skill/Equip/Status/Save/Exit labels. Save, Exit submenu, return-to-title, explicit host exit, and Cancel work; the unported Item/Skill/Equip/Status scenes are visibly disabled rather than replaced by fake web screens.
- Browser audio autoplay can leave title BGM in `blocked` state until the first game interaction. This never blocks the title graphic; the original BGM begins after unlock.
- The isolated RTP bundle covers the verified Map 7 → Map 97 path, not every RTP dependency in all 150 maps. Missing later assets fail with diagnostics instead of placeholder art.
- Event interpreter and embedded Ruby compatibility remain partial; battle and game-specific battle plugins are absent.
- The importable v0.3.0 card is pinned to release tag `direct-boot-v0.3.0`; later releases update the centralized `RUNTIME_RELEASE.ref` and asset repository ref.
- Direct runtime and a same-origin TavernHelper-style card iframe harness are verified, including composer coverage and compact Resume recovery. Final import confirmation on the user's authenticated `st.proxyvn.top` session remains a user-side check after re-import.
