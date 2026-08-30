# BLACK SOULS for SillyTavern

This folder is an incremental, deterministic browser port of the RPG Maker VX Ace game in the repository. The original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` are canonical read-only inputs. Gameplay code does not call an LLM.

## Current development milestone

- Reproducible Ruby Marshal 4.8 extraction for all 165 `.rvdata2` files, including 150 maps and 167 decompressed RGSS3 scripts.
- Complete static inventory of event command codes and embedded Ruby event snippets.
- 640×480 Canvas host with VX Ace A1–A4 autotiles, A5/B–E tiles, original player/event sprites, fog, BGM/SE, animations/balloons, keyboard input, a partial event interpreter, transfers, messages, switches/variables/self-switches, fades, and IndexedDB slot persistence.
- LFS-aware `AssetResolver`: real LFS binaries come from GitHub Media, the boot-path RTP subset is shipped as normal Git blobs, and pointer/magic-byte failures are reported before browser decode.
- Importable Chara Card V3 JSON containing a TavernHelper 4.8.19-compatible character script bootstrap.
- Browser smoke test proves the original new-game position and original map-7 autorun transfer to map 97, plus save/load.

This is not yet a complete or whole-game fidelity-qualified port. The Map 7 → Map 97 graphics/audio path is verified; later RTP dependencies, most event commands, battle, and the 57 custom scripts remain incomplete.

## Reproduce

```text
npm run build
npm test
node tools/dev-server.mjs
```

Open `http://127.0.0.1:4173/sillytavern-port/dev.html` for the direct runtime harness or `card-smoke.html` for the card bootstrap harness.

## SillyTavern card

Import `card/Black_Souls_ST.json`, then approve/enable its character script when TavernHelper prompts. No bootstrap URL needs to be pasted during normal use.

The development loader keeps the repository identity, runtime path, and release ref in the single `RUNTIME_RELEASE` configuration in `card/card-entry.js`. It preflights the complete ES-module tree from these bases in order:

1. `https://cdn.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@main/sillytavern-port/runtime/`
2. `https://testingcf.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@main/sillytavern-port/runtime/`
3. `https://raw.githubusercontent.com/anhyeuem1f2-glitch/Black-Souls/main/sillytavern-port/runtime/` (last-resort diagnostics; strict browser MIME checks may reject it)

Relative imports remain normal URL-based ES-module imports, so descendants resolve against the source that supplied `bootstrap.js`. Change only `RUNTIME_RELEASE.ref` from `main` to a tag or commit SHA for a stable card. A developer bootstrap override remains available under the failure screen's collapsed debug section or through `window.BLACK_SOULS_RUNTIME_OVERRIDE`.

Original LFS assets are not decoded from jsDelivr pointer bodies. The runtime manifest centralizes the repository owner/name/ref, and the host Diagnostics panel shows which asset delivery source succeeded.
