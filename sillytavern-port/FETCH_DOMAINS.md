# Fetch Domains and Resource Barriers

The runtime classifies data by semantic domain: `CORE`, `TITLE`, `OPENING`, `MAP_DATA`, `MAP_TILESET`, `MAP_EVENTS`, `MAP_EFFECTS`, `PICTURES`, `AUDIO`, `MENU_UI`, `INVENTORY`, `EQUIPMENT`, `COMBAT_DATA`, `COMBAT_GRAPHICS`, `COMBAT_AUDIO`, `ANIMATIONS`, `COMMON_EVENTS`, and `PLUGIN_RUNTIME`.

All runtime paths pass through the same asset resolver and prefetch manager. The card tries the immutable `systems-v0.5.0` runtime from jsDelivr, testingcf jsDelivr, then GitHub Raw. Repository LFS media use GitHub media delivery; the isolated RTP subset is served with the runtime. Magic bytes are validated before image/audio decode, and a Git LFS pointer is never sent to a decoder.

## Wait contract

The event interpreter uses one explicit `resource` wait for:

- player transfers and their map, tileset, initial viewport, player, active-event, and map-audio dependencies;
- switch/self-switch page changes that activate a new event graphic;
- move-route or actor graphic changes;
- pictures and looped audio that must resolve before the next event command.

The same interpreter instance remains suspended. On success it resumes at the next command exactly once. A failed transfer rolls state back, records the failing path/source/stage, and presents Retry/Cancel. Retry re-enters the same barrier; it does not create a replacement interpreter or silently skip the event.

Best-effort off-screen streaming never blocks map visibility and remembers unavailable optional sprites so it does not issue a failed request every frame.
