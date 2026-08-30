# Known Differences

- VX Ace autotiles are not yet composed from their four quarter tiles; the current fallback selects a source region only for development visibility.
- Standard RPG Maker VX Ace RTP assets are referenced by the game but absent from the Git repository. Missing tiles/audio are visible and reported.
- Player/event sprites are not yet decoded with `$`/`!` sheet layout semantics; the development renderer uses a marker for the player.
- Event interpreter coverage is partial and unsupported codes are logged once rather than silently ignored.
- Fade timing, movement cadence, animation timing, audio pitch, and message window layout are provisional.
- Only a small subset of embedded Ruby calls has a compatibility mapping.
- Battle and all game-specific battle plugins are absent.
- The development card follows mutable `main`. A stable release must pin a published commit/tag and verify integrity.
- Native SillyTavern was intentionally not launched during this session because the forensic investigation treated that installation as read-only. The card bootstrap is tested in a browser harness and its schema is matched to the installed source.
