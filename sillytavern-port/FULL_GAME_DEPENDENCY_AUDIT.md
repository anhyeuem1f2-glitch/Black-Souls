# Full-Game Dependency Audit

Version 0.5.0 indexes the complete normalized BLACK SOULS data set, not only the opening route. The source game remains read-only; all generated output lives under `sillytavern-port/generated/`.

## Indexed scope

| Domain | Indexed total |
|---|---:|
| Maps | 150 |
| Map events | 6,444 |
| Common events | 248 |
| Troops | 355 |
| Event-command instances | 70,425 |
| Distinct event-command codes | 80 |
| Indexed graphic assets | 837 |
| Indexed audio assets | 157 |
| Synthesis recipes | 15 |

The canonical entry point is `generated/dependencies/game-dependency-index.json`. It names the eight specialized indexes:

- `map-dependencies.json`
- `event-dependencies.json`
- `common-event-dependencies.json`
- `combat-dependencies.json`
- `inventory-dependencies.json`
- `ui-dependencies.json`
- `audio-dependencies.json`
- `asset-reverse-index.json`

Every dependency entry records its source owner (map/event/common event/troop/database), domain, path, and criticality where applicable. The reverse index answers why a path is required and is used for failure diagnostics. Common-event expansion is cycle-safe and bounded. Direct map transitions are also represented by the predictive prefetch graph.

## Coverage interpretation

`generated/audit/event-command-coverage.json`, `EVENT_COMMAND_COVERAGE.md`, and `CUSTOM_SCRIPT_COVERAGE.md` are compatibility inventories, not claims of full RGSS3 parity. Each command code is marked `complete`, `partial`, or `none`, and whether an automated regression exercises it. Unsupported embedded Ruby remains recorded by hash and source location in `generated/audit/embedded-ruby.json`.

The asset audit found 212 direct references absent from this repository snapshot. Most are RTP graphics/audio expected by VX Ace; the browser bundle contains only the opening-critical RTP subset. A missing optional visual is diagnostic and non-fatal. A render-critical transfer/page graphic enters a resource wait and offers retry instead of advancing invisibly.

## Reproduction

Run `npm run build:dependencies` after extraction. `npm run build` regenerates the normalized data, audits, asset manifest, prefetch manifest, all dependency indexes, and the card.
