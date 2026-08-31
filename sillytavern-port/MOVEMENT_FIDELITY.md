# Movement Fidelity

Movement uses a fixed 60 Hz simulation step and the VX Ace distance formula `2 ** real_move_speed / 256.0` tiles per frame. Rendering interpolates the actor and event real coordinates; collision resolves on integer tile coordinates.

- Normal speed 4: 1/16 tile per frame, 16 frames per tile, 0.2667 seconds per tile, 3.75 tiles/second.
- Dash adds one speed level. Speed 5: 1/8 tile per frame, 8 frames per tile, 0.1333 seconds per tile, 7.5 tiles/second.
- Diagonal movement applies the same increment on each axis. It is intentionally not vector-normalized, matching VX Ace's faster diagonal resultant.
- Held directions repeat continuously; duplicate browser key-repeat events are ignored. Shift controls dash.
- Forced move routes implement straight and diagonal steps, waits, speed/frequency changes, direction turns, switches, transparency, through, animation flags, SE, and character-graphic changes used by the original opening.
- Current-map events refresh to the last page whose switch/variable/self-switch/item/actor conditions pass, copy the original page movement/priority/trigger fields, and run fixed, random, approach, or custom autonomous movement at the source frequency threshold.
- Player, event, and follower contacts honor normal-priority, `through`, passability, follower-contact Script 145 behavior, action-button triggers, player-touch triggers, and event-touch triggers.
- The camera follows the player with the original 9.5/7 tile center and permits fractional display coordinates; renderer tile lookup always uses integer map coordinates.

Regression tests assert exact normal, dash, and diagonal distances at 60 Hz, execute the real Map98 forced-route sequence, and drive Map98 Event 16 from detection through contact into troop 3.
