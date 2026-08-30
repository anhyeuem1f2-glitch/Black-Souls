# Compatibility Matrix

| Area | Status | Evidence / gap |
|---|---|---|
| Marshal database extraction | Verified | 165/165 files; 150/150 maps; Node tests pass |
| Script extraction | Verified | 167/167 zlib bodies; source index generated |
| Original data IDs/command parameters | Verified at extraction boundary | Generic normalized objects retain fields; broader golden fixtures still needed |
| SillyTavern host contract | Partial | TavernHelper 4.8.19 schema/source verified; native ST launch/import not performed |
| Canvas/logical resolution | Verified | Browser reports 640×480 canvas |
| New-game start and map transfer | Verified | Original map 7 autorun transfers to map 97 in browser smoke test |
| Tile rendering | Partial | Map 7/97 verified with A1–A4 quarter autotiles, A5/B–E, priority/shadows, LFS-aware originals, and isolated RTP; whole-game golden comparison remains |
| Player movement | Partial | Original `$`/`!` sprite sheets, Arrow/WASD + plugin-style diagonal facing and tile flags; event collision incomplete |
| Messages | Partial | 101/401 text and confirm wait; faces/choices/name windows incomplete |
| Switches/variables/self switches | Partial | Basic operations; all operand modes and page semantics incomplete |
| Save/load | Verified for current schema | IndexedDB slot 1 browser smoke test; original save parity/migrations incomplete |
| Audio | Partial | Map autoplay BGM/BGS and SE resolve by manifest, validate bytes, and play in browser; advanced mixing/fades remain |
| Battle | Not implemented | No compatibility claim |
| Custom scripts 109–165 | Not implemented | Coverage inventory exists; behavior fixtures required |
| Zero LLM calls | Verified by design | Runtime/card bootstrap contains no generation call; only static module/data/assets fetches |
