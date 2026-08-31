# Compatibility Matrix

| Area | Status | Evidence / gap |
|---|---|---|
| Marshal database extraction | Verified | 165/165 files; 150/150 maps; Node tests pass |
| Script extraction | Verified | 167/167 zlib bodies; source index generated |
| Original data IDs/command parameters | Verified at extraction boundary | Generic normalized objects retain fields; broader golden fixtures still needed |
| SillyTavern host contract | Verified in harness / native re-import pending | TavernHelper 4.8.19 script iframe mechanism, `frameElement` fullscreen overlay, auto-mount, Exit/compact/Resume verified in a same-origin card harness; authenticated deployment still needs the user's re-import |
| Canvas/logical resolution | Verified | Browser reports 640×480 canvas |
| Original title | Verified | Real `Titles1/1.png` decoded 560×420 and stretched to 640×480; traced commands and deferred title BGM render before New Game |
| New-game start and map transfer | Verified | Original Map 7 `(7,6)` transfers to Map 97, the opening resumes after name confirmation, and the default skip branch reaches Map 10 `(15,16)` with its autorun completed |
| Tile rendering | Partial | Map 7/97/98 use A1–A4 quarter autotiles, A5/B–E, priority/shadows, LFS-aware originals, and isolated RTP; fractional-camera tile addressing and partial-frame presentation are regression tested; whole-game golden comparison remains |
| Player movement | Verified for current-map core | Original `$`/`!` sprite sheets, simultaneous Arrow/WASD `dir8`, strict diagonal passability/cardinal fallback, plugin-style cardinal sprite facing, event collision, and fixed-60 Hz timing |
| Game_Event pages / movement | Verified for current-map core | Last-valid page conditions, page setup, fixed/random/approach/custom autonomous movement, source stop thresholds, move-route commands, offscreen update, interpolation, priority/through collision, action/player/event touch |
| Symbol encounters | Verified for Script 145 ordinary enemies | Source profile settings, Manhattan detection and hysteresis, moving-player dash radius, chase/flee, stealth/visibility, follower contact, preemptive/surprise, command 301 troop binding; real Map98 Event 16 fixture enters troop 3 |
| Messages | Partial | 101/401 text and confirm wait; faces/choices/name windows incomplete |
| Name Input command 303 | Verified | Map 97 Event 1 index 11 and sequential-modal fixtures preserve actor/max length, same interpreter identity, exact-once next index, cleared wait state, restored focus, and modal stack cleanup |
| Interpreter diagnostics | Verified | `?bsTrace=1` exposes deterministic command/wait/resume trace and a non-skipping developer stall watchdog; production trace is hidden |
| Predictive streaming | Verified for supported command surface | Generated 150-map/283-edge manifest, two-hop ranking, 48-command lookahead, initial-viewport barrier, dedupe/retry/fallback/LRU/Cache API, watchdogs, and deterministic benchmark pass |
| Switches/variables/self switches | Partial | Basic operations plus current-map page-condition refresh; all event-command operand modes remain incomplete |
| Save/load | Verified for current schema | IndexedDB slot 1 browser smoke test; original save parity/migrations incomplete |
| Escape/menu lifecycle | Verified for vertical slice | Escape/X is game Cancel; map menu opens/closes without unmount; fullscreen state is independent; explicit host Exit leaves Resume |
| Audio | Partial | Map autoplay BGM/BGS and SE resolve by manifest, validate bytes, and play in browser; advanced mixing/fades remain |
| Battle | Partial | Real database troops/enemies, AP/casting/actions, victory/escape/lose branch result, and symbol encounter initiative; troop event pages and full RGSS3 feature math remain |
| Custom scripts 109–165 | Partial | Coverage inventory exists; Script 145 symbol encounters and Script 162 enemy scaling are ported, selected equipment/synthesis/battle behavior is partial |
| Zero LLM calls | Verified by design | Runtime/card bootstrap contains no generation call; only static module/data/assets fetches |
