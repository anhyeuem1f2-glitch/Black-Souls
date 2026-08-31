# BLACK SOULS for SillyTavern

This directory contains a deterministic browser port of the repository's RPG Maker VX Ace game. The original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` are read-only authorities. Gameplay makes no LLM/API generation calls.

Release 0.8.0 adds source-faithful current-map `Game_Event` page setup, autonomous movement, priority/through collision, Script 145 symbol detection/chase/contact, and command 301 battle entry. The renderer now presents complete offscreen frames atomically and derives integer tile windows from fractional camera coordinates, eliminating the movement black flash. See `ENEMY_EVENT_FORENSICS.md`, `EVENT_MOVEMENT_COMPATIBILITY.md`, `SYMBOL_ENCOUNTER_COMPATIBILITY.md`, and `MAP_RENDERING_COMPATIBILITY.md`.

The production card is pinned by `release/verified-runtime.json`. The embedded loader preflights the immutable build manifest and required data, verifies SHA-256/SRI, and tries jsDelivr, testingcf, then Fastly before the visible last-known-good fallback.

## Import

Import `../deliverables/Black_Souls_ST.json` as a SillyTavern character card and approve its TavernHelper / JS-Slash-Runner character script. Re-import is required for 0.8.0 because an existing card keeps its older embedded loader and runtime ref.

## Local verification

```text
npm test
node tools/dev-server.mjs
```

Open `http://127.0.0.1:4173/sillytavern-port/dev.html`. Production export remains guarded by `npm run validate:release -- --ref <pushed-commit>` followed by `npm run build:card`.

This remains an incremental RGSS3 compatibility port. Exact unsupported/partial behavior is documented in `KNOWN_DIFFERENCES.md`, `EVENT_COMMAND_COVERAGE.md`, and `CUSTOM_SCRIPT_COVERAGE.md`.
