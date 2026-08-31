# BLACK SOULS for SillyTavern

This folder is an incremental, deterministic browser port of the RPG Maker VX Ace game in the repository. The original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` are canonical read-only inputs. Gameplay code does not call an LLM.

## Current development milestone

- Reproducible Ruby Marshal 4.8 extraction for all 165 `.rvdata2` files, including 150 maps and 167 decompressed RGSS3 scripts.
- Complete static inventory of event command codes and embedded Ruby event snippets.
- Direct-boot 640×480 Canvas host with the original title image/commands/BGM, VX Ace A1–A4 autotiles, A5/B–E tiles, original player/event sprites, fog, BGM/SE, animations/balloons, 8-direction keyboard input, an in-game Cancel menu, a partial event interpreter, transfers, messages, switches/variables/self-switches, fades, and IndexedDB slot persistence.
- LFS-aware `AssetResolver`: real LFS binaries come from GitHub Media, the boot-path RTP subset is shipped as normal Git blobs, and pointer/magic-byte failures are reported before browser decode.
- Generated predictive streaming: a bounded two-hop transfer graph, 48-command interpreter lookahead, initial-viewport decode barrier, priority reservation, in-flight dedupe, versioned Cache API storage, weighted LRUs, and transition/fetch/decode metrics.
- Importable Chara Card V3 JSON containing a TavernHelper 4.8.19-compatible, environment-aware character script loader.
- A code-only browser bundle exposes `window.BlackSoulsRuntime`; its generated build manifest records the committed source, entry SHA-256, schemas, and boot data. The production card is pinned to an exact pushed commit and verifies the bundle before classic-script execution.
- Browser smoke tests prove `origin:null` preflight/integrity/global/mount, original title decode, New Game, original new-game position, map-7 autorun transfer to map 97, Continue, game Esc/menu, fullscreen state separation, and explicit Exit/Resume recovery in a TavernHelper-style iframe.

This remains an incremental RGSS3 compatibility port rather than a complete reimplementation of every custom script. The Map 7 → Map 97 → Map 10 opening, persistent inventory/equipment/shop/synthesis systems, real-data MAX_AP combat loop, and predictive warm path are verified. See `PORT_STATUS.md`, `COMBAT_COMPATIBILITY.md`, and `PREFETCH_STREAMING.md` for exact coverage and remaining gaps.

## Reproduce

```text
npm run build
npm test
node tools/dev-server.mjs
```

Open `http://127.0.0.1:4173/sillytavern-port/dev.html` for the direct runtime harness. Run `npm run build:loader-smoke` and open `loader-smoke.html` for the sandboxed `origin:null` loader harness.

## SillyTavern card

Import `../deliverables/Black_Souls_ST.json`, then approve/enable its character script when TavernHelper prompts. No bootstrap URL needs to be pasted during normal use.

The v0.6 production card is pinned to verified commit `f0ed57350f8cf47b80d091df39b9b8cb80101a0f`. It preflights the generated build manifest, one browser-ready runtime bundle, and required boot data from these bases in order:

1. `https://cdn.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@f0ed57350f8cf47b80d091df39b9b8cb80101a0f/sillytavern-port/runtime/`
2. `https://testingcf.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@f0ed57350f8cf47b80d091df39b9b8cb80101a0f/sillytavern-port/runtime/`
3. `https://fastly.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@f0ed57350f8cf47b80d091df39b9b8cb80101a0f/sillytavern-port/runtime/`

The bundle is fetched and SHA-256 checked, then loaded as a classic script with SRI. Code, data, asset, and manifest bases are passed explicitly and never inferred from the `origin:null` iframe URL. If every current source fails, diagnostics visibly attempt exact last-known-good commit `5ac55ae9b4b983e5aa3d9f107447f975e60e059b`. A developer runtime-base override remains available under the failure screen's collapsed debug section or through `window.BLACK_SOULS_RUNTIME_OVERRIDE`.

Production export is deliberately two-phase:

```text
npm run validate:release -- --ref <pushed-40-character-commit>
npm run build:card
```

The second command refuses to emit a card unless the first command verified GitHub, a primary CDN, a fallback CDN, bundle integrity, and required boot data.

Original LFS assets are not decoded from jsDelivr pointer bodies. The runtime manifest centralizes the repository owner/name/ref, and the host Diagnostics panel shows which asset delivery source succeeded.
