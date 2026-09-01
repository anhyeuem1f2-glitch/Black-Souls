# Event Mobility Audit

Release 0.9.0 derives movement from each active VX Ace `RPG::Event::Page`; it does not infer mobility from an event name, sprite, screenshot, or visual resemblance to an enemy. `generated/event-mobility-index.json` records the classification and evidence for all 6,444 pages across all 150 original maps.

The authoritative classes are fixed prop, fixed decoration, interactable fixed event, random autonomous mover (`move_type = 1`), approach autonomous mover (`move_type = 2`), custom route (`move_type = 3`), symbol enemy, cutscene actor, and other. Symbol eligibility additionally requires an exact `enable_symbol_encount(id)` script in the active custom route; merely having a monster graphic never enables chase or contact battle.

Every page refresh re-applies direction, original direction, pattern, original pattern, route speed/frequency, priority, through, animation flags, and the page graphic. It clears stale forced-route motion and snaps real coordinates to logical event coordinates. Autonomous updates run only for the movement-capable classifications.

Regression fixtures use original data: Map97 Event1 Alice blood/corpse and Events3–6 `14遺体`, Map98 Events13–14 `Damage3` pig corpses, and Map125 Event22 `!Other3` bottle remain unchanged for 300 frames. Map53 Event6 still performs its real random route. Map98 Event16 alone qualifies as the tested hostile symbol, chases, collides without overlapping, and starts troop3 through its original event-touch command301.
