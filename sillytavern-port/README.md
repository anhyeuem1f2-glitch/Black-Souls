# BLACK SOULS for SillyTavern

This directory contains a deterministic browser port of the repository's RPG Maker VX Ace game. The original `Data/`, `Graphics/`, `Audio/`, `System/`, `Game.exe`, and `Game.ini` are read-only authorities. Gameplay makes no LLM/API generation calls.

Release 0.7.0 restores the exact opening branch topology and actor/class replacement, VX Ace-styled title/menu/status/item/equip/save/load/battle UI, 16-slot persistent saves plus export/import, fixed-60 Hz VX Ace movement, and decoded-resource prefetch/barriers. See `ORIGINAL_OPENING_TRACE.md`, `UI_FIDELITY.md`, `MOVEMENT_FIDELITY.md`, `SAVE_FORMAT.md`, and `PREFETCH_STREAMING.md`.

The production card is pinned to runtime commit `188bf2be16f87b4e531e9bd7526b0395d5fb6e23`. Its classic bundle is 267,347 bytes with SHA-256 `C7366CD06CC3E17930A9B3B1535161D08216D99FD246E3FA8A324176821B971A`. The embedded loader preflights the immutable build manifest and required data, verifies SHA-256/SRI, and tries jsDelivr, testingcf, then Fastly before the visible last-known-good fallback.

## Import

Import `../deliverables/Black_Souls_ST.json` as a SillyTavern character card and approve its TavernHelper / JS-Slash-Runner character script. Re-import is required for 0.7.0 because an existing card keeps its older embedded loader and runtime ref.

## Local verification

```text
npm test
node tools/dev-server.mjs
```

Open `http://127.0.0.1:4173/sillytavern-port/dev.html`. Production export remains guarded by `npm run validate:release -- --ref <pushed-commit>` followed by `npm run build:card`.

This remains an incremental RGSS3 compatibility port. Exact unsupported/partial behavior is documented in `KNOWN_DIFFERENCES.md`, `EVENT_COMMAND_COVERAGE.md`, and `CUSTOM_SCRIPT_COVERAGE.md`.
