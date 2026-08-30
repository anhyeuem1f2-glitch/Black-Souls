# Architecture Decision

## Decision: incremental JavaScript runtime with an explicit compatibility registry

The first runtime is a modular JavaScript implementation of only the RGSS3 contracts BLACK SOULS demonstrably uses. Original Ruby remains extracted as the behavioral source of truth. Embedded event scripts are handled by a strict, enumerated compatibility registry; they are never passed to JavaScript `eval`.

## Evidence

- 167 script entries decompress successfully; 57 custom/plugin scripts contain 16,411 lines / 667,312 bytes.
- Static scanning found zero `Win32API` references.
- All 150 maps plus 248 common events contain 70,425 event command instances across 80 codes.
- Only 32 distinct embedded Ruby event snippets occur 38 times. Most are small calls such as journal activation, self-switch helpers, name copies, step reset, or scene entry.
- The SillyTavern forensic report establishes that TavernHelper 4.8.19 executes character scripts in a same-origin `srcdoc` iframe and exposes a button/event API. The card therefore uses one small character script to reveal its own iframe and import the runtime; it does not depend on a regex-generated application.

## Alternatives considered

### Ruby/WASM plus an RGSS3 shim

This could preserve monkey-patching semantics, but it does not eliminate the hard work: Graphics, Bitmap, Sprite, Viewport, Window, Input, Audio, DataManager, event data, save behavior, and browser integration still require a large RGSS3 shim. It also adds bundle size and a second runtime before a representative battle benchmark exists.

### Blind translation of all 36k Ruby lines

Rejected. A mechanical translation would obscure behavior drift and make regression attribution difficult.

### Hybrid, later

Still open. After the map/event vertical slice, a battle spike should compare a Ruby/WASM execution of the original battle scripts against targeted JavaScript ports. The decision should be revisited if the custom battle monkey patches prove more expensive or less reliable to port than a constrained Ruby shim.

## Consequences

- Browser integration, deterministic tests, lazy assets, and IndexedDB are straightforward.
- Compatibility remains explicit and incomplete rather than silently approximated.
- Each custom script needs behavior-level fixtures before being marked compatible.
