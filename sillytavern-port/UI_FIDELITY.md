# VX Ace UI Fidelity

The runtime renders at the original 640×480 logical resolution with the repository `Graphics/System/Window.png`, `IconSet.png`, face sheets, and character sheets. Text is normalized to NFC; drawing waits for browser font readiness and uses Arial-compatible Vietnamese glyph coverage. Window line height is 24 px and standard padding is 12 px.

- Title command window: 160×96 at `(240,336)` with New Game, Continue, and Shutdown.
- Menu: command window 160 px wide; actor status area starts at x=160 and is 480 px wide; gold is `(0,432,160,48)`; the custom `Tội Lỗi` variable-38 window is `(0,370,160,64)`.
- Item: 48 px help row, 48 px category row, remaining item list with original icons/counts.
- Skill, equipment, and status use the original full-screen window partition and the game's eight equipment slots/class permissions.
- Save/load: 48 px help row plus four 108 px file windows, scrolling across 16 slots with actor graphic, level, location, timestamp, and playtime metadata.
- Battle: 512 px party-status region and 128 px actor-command region at the bottom, using Window skin, icons, gauges, battlebacks, and battlers.

Messages preserve face, background, position, multiline text, and the original attached-choice behavior. Screen tone/flash/weather are drawn beneath messages and menus so the Map 97 black tone does not hide `Bỏ qua / Không bỏ qua`.

The browser acceptance run visually checked title, name confirmation, class confirmation, attached skip prompt, Map98, menu, save slots 1–16, title Continue, load-file selection, and a successful slot-16 reload.
