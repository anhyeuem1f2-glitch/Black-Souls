# Compatibility Matrix

| Area | Status | Evidence / gap |
|---|---|---|
| Marshal database extraction | Verified | 165/165 files; 150/150 maps; Node tests pass |
| Script extraction | Verified | 167/167 zlib bodies; source index generated |
| Original data IDs/command parameters | Verified at extraction boundary | Generic normalized objects retain fields; broader golden fixtures still needed |
| SillyTavern host contract | Verified in harness / native re-import pending | TavernHelper 4.8.19 script iframe mechanism, `frameElement` fullscreen overlay, auto-mount, Exit/compact/Resume verified in a same-origin card harness; authenticated deployment still needs the user's re-import |
| Canvas/logical resolution | Verified | Browser reports 640×480 canvas |
| Original title | Verified | Real `Titles1/1.png` decoded 560×420 and stretched to 640×480; traced commands and deferred title BGM render before New Game |
| New-game start and map transfer | Verified | Original map 7 `(7,6)` / tileset 1 loads and its autorun transfers to map 97 / tileset 3 in browser smoke test |
| Tile rendering | Partial | Map 7/97 verified with A1–A4 quarter autotiles, A5/B–E, priority/shadows, LFS-aware originals, and isolated RTP; whole-game golden comparison remains |
| Player movement | Partial | Original `$`/`!` sprite sheets, simultaneous Arrow/WASD `dir8`, strict diagonal passability/cardinal fallback, plugin-style cardinal sprite facing and tile flags; event collision incomplete |
| Messages | Partial | 101/401 text and confirm wait; faces/choices/name windows incomplete |
| Switches/variables/self switches | Partial | Basic operations; all operand modes and page semantics incomplete |
| Save/load | Verified for current schema | IndexedDB slot 1 browser smoke test; original save parity/migrations incomplete |
| Escape/menu lifecycle | Verified for vertical slice | Escape/X is game Cancel; map menu opens/closes without unmount; fullscreen state is independent; explicit host Exit leaves Resume |
| Audio | Partial | Map autoplay BGM/BGS and SE resolve by manifest, validate bytes, and play in browser; advanced mixing/fades remain |
| Battle | Not implemented | No compatibility claim |
| Custom scripts 109–165 | Not implemented | Coverage inventory exists; behavior fixtures required |
| Zero LLM calls | Verified by design | Runtime/card bootstrap contains no generation call; only static module/data/assets fetches |
