# Movement Fidelity

Movement uses a fixed 60 Hz simulation step and the VX Ace distance formula `2 ** real_move_speed / 256.0` tiles per frame. Rendering interpolates the actor's real coordinates; map collision still resolves on tile coordinates.

- Normal speed 4: 1/16 tile per frame, 16 frames per tile, 0.2667 seconds per tile, 3.75 tiles/second.
- Dash adds one speed level. Speed 5: 1/8 tile per frame, 8 frames per tile, 0.1333 seconds per tile, 7.5 tiles/second.
- Diagonal movement applies the same increment on each axis. It is intentionally not vector-normalized, matching VX Ace's faster diagonal resultant.
- Held directions repeat continuously; duplicate browser key-repeat events are ignored. Shift controls dash.
- Forced move routes implement straight and diagonal steps, waits, speed/frequency changes, direction turns, switches, transparency, through, animation flags, SE, and character-graphic changes used by the original opening.

Regression tests assert exact normal, dash, and diagonal distances at 60 Hz and execute the real Map98 forced-route sequence.
