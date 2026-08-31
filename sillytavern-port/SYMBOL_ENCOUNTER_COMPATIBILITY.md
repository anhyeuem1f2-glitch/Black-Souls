# Symbol Encounter Compatibility

Script 145's four `SYMBOL_SETTING_LIST` profiles are ported verbatim. `enable_symbol_encount(id)` is discovered from an event's autonomous custom route and is also accepted by the Ruby-compatibility dispatcher. The runtime implements Manhattan detection, moving-dash distance, the forming hysteresis of `dash_distance + 1`, idle random/stop modes, chase/flee based on the configured party level selector, before/after speed and frequency, Decision1 plus balloon, visibility-distance opacity, stealth suppression/reset, per-profile blocked regions, near-screen update gating, and follower contact.

Contact conditions follow the original direction/positional table. Direct leader contact may be normal, preemptive (1), or surprise (2); contact with the last visible follower is surprise. Command 301 accepts fixed, variable, and random map troop designations. Contact metadata is recorded in diagnostics and propagated into battle start AP state.

When forming begins, all statically discoverable battle assets from the event list/Common Events are requested at HIGH priority. Contact then crosses the normal decoded event-graphic barrier; battle entry promotes the same troop bundle to CRITICAL and waits before changing scene. Diagnostics expose the event/page/runtime movement state, chase trace, last collision/contact, encounter condition, and battle-prefetch state.

The source-backed acceptance fixture is documented in `ENEMY_EVENT_FORENSICS.md`. Map98 event 16 detected at distance 3, took two chase steps, contacted the player, resolved surprise, completed the HIGH troop-3 prefetch, and entered the original `Lợn Đồ Tể` battle.
