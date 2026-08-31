# Original Opening Trace

Authority: normalized data extracted from the repository's read-only `Data/System.rvdata2`, `Data/Map007.rvdata2`, `Data/Map097.rvdata2`, and `Data/Map098.rvdata2`.

1. System start is Map 7 at `(7,6)`.
2. Map 7 Event 1 autorun fades and transfers to Map 97 at `(12,18)`, facing right, with the temporary actor transparent.
3. Map 97 Event 1 page 0 requests actor-1 name input with a six-character limit, confirms with `Đúng / Không đúng`, then offers `Hiệp sĩ / Kẻ trộm / Pháp sư`.
4. Knight sets variable 6 to 1, variable 14 to 2, switch 1, and replaces actor 1 with actor 2. Thief uses variable 6 = 2, variable 14 = 3, switch 2, actor 3, and 1000 gold. Mage uses variable 6 = 3, variable 14 = 4, switch 3, and actor 4. The chosen actor inherits the entered name.
5. The gift branches grant item 47, armor 79, item 49, or item 8. Subsequent adult-content and blood/corpse commands execute in the same interpreter.
6. The final attached prompt asks whether to skip the approximately five-minute opening. `Bỏ qua` enables switches 25 and 70, transfers to Map 10 at `(15,16)`, and runs Common Event 2. `Không bỏ qua` transfers to Map 98 at `(55,5)`.
7. Map 98 Event 10 page 0 is a parallel process. Its 105 commands, forced routes, waits, speed/frequency changes, messages, switches, graphics, and sound effects execute before the opening settles.

Actor identity is data-driven: actor 1 is class 13 with `!Flame` index 5; Knight actor 2 is class 1 with `$主人公` index 0; Thief actor 3 is class 2 with `Evil` index 2; Mage actor 4 is class 3 with `Evil` index 5. The renderer always follows the actual party leader, so choosing a class replaces the flame graphic without a special-case `Grim` branch.

Automated tests execute the real Map 97 command list through both destination branches. The live browser acceptance run reached Map 98 `(55,5)` with actor 2, `$主人公`, item 47, 12/12 critical resources ready, and no unsupported commands.
