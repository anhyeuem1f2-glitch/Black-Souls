# Known Differences

- VX Ace A1–A4 autotiles now use quarter-tile composition, animated water/waterfalls, A5/B–E sheets, star priority, and map shadows. Edge cases such as terrain-specific table rendering still need broader golden-map comparison.
- Player and active event sprites use original `$`/`!` sheet semantics and cardinal rows during eight-direction movement. Full move-route animation cadence and event collision remain incomplete.
- Boot-map fog, BGM, SE, database animations (command 212), and balloons (command 213) are implemented. Pictures, weather, screen flashes/shakes, and full animation timing SE/flash behavior remain incomplete.
- The isolated RTP bundle covers the verified Map 7 → Map 97 path, not every RTP dependency in all 150 maps. Missing later assets fail with diagnostics instead of placeholder art.
- Event interpreter and embedded Ruby compatibility remain partial; battle and game-specific battle plugins are absent.
- The development card follows mutable `main`. A stable release must pin a published commit/tag and refresh integrity metadata.
- The browser harness is verified; the authenticated `st.proxyvn.top` session was not available in this workspace, so final import confirmation there remains a user-side check.
