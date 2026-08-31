# Known Differences

- VX Ace A1–A4 autotiles now use quarter-tile composition, animated water/waterfalls, A5/B–E sheets, star priority, and map shadows. Edge cases such as terrain-specific table rendering still need broader golden-map comparison.
- Player and active event sprites use original `$`/`!` sheet semantics and cardinal rows during eight-direction movement. Full move-route animation cadence and event collision remain incomplete.
- Boot-map fog, BGM, SE, database animations (command 212), and balloons (command 213) are implemented. Pictures, weather, screen flashes/shakes, and full animation timing SE/flash behavior remain incomplete.
- The original title background, title BGM, title command window placement, New Game, Continue availability, and Shutdown intent are implemented. Shutdown maps to the safe SillyTavern-specific explicit pause/Resume lifecycle instead of terminating the whole browser page.
- The map menu shows the original Vietnamese Item/Skill/Equip/Status/Save/Exit labels. Save, Exit submenu, return-to-title, explicit host exit, and Cancel work; the unported Item/Skill/Equip/Status scenes are visibly disabled rather than replaced by fake web screens.
- Browser audio autoplay can leave title BGM in `blocked` state until the first game interaction. This never blocks the title graphic; the original BGM begins after unlock.
- The isolated RTP bundle does not contain Animation `Light6` or Map 10 event sprite `Damage3`. Missing visual-only animation/event sprite assets are omitted with diagnostics and cannot terminate event logic; required tilesets/map data still fail loudly and transfers roll back.
- Event interpreter and embedded Ruby compatibility remain partial; battle and game-specific battle plugins are absent.
- Predictive dependencies are generated for supported VX Ace commands and bounded to two transfer hops. Dynamic filenames/targets produced only by unported Ruby scripts cannot be predicted yet; a cold CDN miss can still expose normal network latency, but it now reports the exact pending resource and stage.
- The remote release uses a versioned persistent Cache API plus bounded in-memory LRUs. Local development overrides intentionally skip persistent storage so edited local assets cannot be shadowed by an older response.
- Command 303 suspension/resume semantics are implemented and the default opening reaches Map 10, but role party changes, gifts/inventory, journal scripts, common event 2 operands, screen tints/flashes, and several other opening-side effects remain compatibility gaps.
- The importable v0.4.1 card is pinned to release tag `streaming-v0.4.1`; later releases update the centralized `RUNTIME_RELEASE.ref` and asset repository ref.
- Direct runtime and a same-origin TavernHelper-style card iframe harness are verified, including composer coverage and compact Resume recovery. Final import confirmation on the user's authenticated `st.proxyvn.top` session remains a user-side check after re-import.
