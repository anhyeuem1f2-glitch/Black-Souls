# BLACK SOULS for SillyTavern

This directory contains a deterministic browser port of the repository's RPG Maker VX Ace game. The original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` are read-only authorities. Gameplay makes no LLM/API generation calls.

Release 0.9.0 classifies every original event page from VX Ace page data, renders the exact B–E/A1–A5 tile families and layer priorities, and ports the original ATB/AP, dynamic commands, smart enemy AI, note-tag mechanics, and battle presentation. See `EVENT_MOBILITY_AUDIT.md`, `AUTOTILE_COMPATIBILITY.md`, and `BATTLE_SYSTEM_REVERSE_ENGINEERING.md`.

The production card is pinned to verified runtime commit `a8395c22f4427e3313f75ed5a5db61e40181a484`. Its 306,294-byte classic bundle has SHA-256 `1D1FC59EAE6FB1CD5C78A36024296E4A386C0F6D8260513D6D0679C7233DA31C`. The embedded loader preflights the immutable build manifest and required data, verifies SHA-256/SRI, and tries jsDelivr, testingcf, then Fastly before the visible last-known-good fallback.

## Import

Import `../deliverables/Black_Souls_ST.json` as a SillyTavern character card and approve its TavernHelper / JS-Slash-Runner character script. Re-import is required for 0.9.0 because an existing card keeps its older embedded loader and runtime ref.

## Local verification

```text
npm test
node tools/dev-server.mjs
```

Open `http://127.0.0.1:4173/sillytavern-port/dev.html`. Production export remains guarded by `npm run validate:release -- --ref <pushed-commit>` followed by `npm run build:card`.

This remains an incremental RGSS3 compatibility port. Exact unsupported/partial behavior is documented in `KNOWN_DIFFERENCES.md`, `EVENT_COMMAND_COVERAGE.md`, and `CUSTOM_SCRIPT_COVERAGE.md`.
