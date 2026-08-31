# Event Command Coverage

Generated from all 150 maps and 248 common events. Unsupported commands remain explicit; this report does not imply compatibility.

- Command instances: 70425
- Distinct command codes: 80
- Distinct embedded Ruby snippets: 32

| Code | VX Ace command | Count | Maps | Common events | Implemented | Tested |
|---:|---|---:|---:|---:|---|---|
| 0 | End | 12802 | 139 | 248 | complete | yes |
| 101 | Show Text | 6584 | 100 | 132 | partial | no |
| 102 | Show Choices | 650 | 70 | 18 | partial | yes |
| 103 | Input Number | 17 | 1 | 11 | none | no |
| 104 | Select Key Item | 6 | 0 | 6 | none | no |
| 105 | Show Scrolling Text | 2 | 2 | 0 | none | no |
| 108 | Comment | 841 | 44 | 24 | complete | yes |
| 111 | Conditional Branch | 1808 | 52 | 80 | partial | yes |
| 115 | Exit Event Processing | 689 | 13 | 23 | complete | no |
| 117 | Common Event | 2338 | 109 | 125 | none | no |
| 118 | Label | 40 | 15 | 4 | complete | no |
| 119 | Jump to Label | 187 | 5 | 1 | complete | no |
| 121 | Control Switches | 1994 | 98 | 164 | complete | yes |
| 122 | Control Variables | 885 | 73 | 49 | partial | no |
| 123 | Control Self Switch | 2903 | 113 | 0 | complete | yes |
| 124 | Control Timer | 9 | 9 | 0 | none | no |
| 125 | Change Gold | 79 | 18 | 27 | none | no |
| 126 | Change Items | 1474 | 95 | 16 | none | no |
| 127 | Change Weapons | 408 | 16 | 1 | none | no |
| 128 | Change Armors | 136 | 44 | 1 | none | no |
| 129 | Change Party Member | 432 | 2 | 33 | none | no |
| 132 | Change Battle BGM | 433 | 70 | 8 | none | no |
| 135 | Change Menu Access | 20 | 6 | 3 | none | no |
| 136 | Change Encounter | 2 | 2 | 0 | none | no |
| 201 | Transfer Player | 642 | 137 | 12 | partial | yes |
| 202 | Set Vehicle Location | 6 | 1 | 4 | none | no |
| 203 | Set Event Location | 2 | 1 | 1 | none | no |
| 204 | Scroll Map | 4 | 3 | 0 | none | no |
| 205 | Set Move Route | 1742 | 102 | 9 | partial | yes |
| 206 | Get On/Off Vehicle | 5 | 0 | 5 | none | no |
| 211 | Change Transparency | 12 | 2 | 1 | none | no |
| 212 | Show Animation | 311 | 23 | 15 | partial | yes |
| 213 | Show Balloon Icon | 291 | 56 | 0 | partial | yes |
| 221 | Fadeout Screen | 566 | 54 | 119 | partial | yes |
| 222 | Fadein Screen | 567 | 54 | 118 | partial | yes |
| 223 | Tint Screen | 253 | 42 | 12 | none | no |
| 224 | Flash Screen | 124 | 37 | 7 | none | no |
| 225 | Shake Screen | 30 | 12 | 0 | none | no |
| 230 | Wait | 512 | 55 | 107 | complete | no |
| 231 | Show Picture | 409 | 4 | 97 | none | no |
| 232 | Move Picture | 229 | 2 | 97 | none | no |
| 235 | Erase Picture | 417 | 3 | 100 | none | no |
| 236 | Set Weather Effects | 114 | 24 | 7 | none | no |
| 241 | Play BGM | 442 | 25 | 98 | none | no |
| 242 | Fadeout BGM | 118 | 25 | 11 | none | no |
| 243 | Save BGM | 64 | 10 | 10 | none | no |
| 244 | Replay BGM | 63 | 10 | 10 | none | no |
| 245 | Play BGS | 400 | 15 | 91 | none | no |
| 246 | Fadeout BGS | 18 | 2 | 7 | none | no |
| 249 | Play ME | 21 | 1 | 0 | none | no |
| 250 | Play SE | 1412 | 136 | 66 | partial | yes |
| 251 | Stop SE | 8 | 3 | 4 | none | no |
| 281 | Change Map Name Display | 2 | 1 | 0 | none | no |
| 283 | Change Battle Back | 50 | 7 | 2 | none | no |
| 301 | Battle Processing | 765 | 96 | 0 | none | no |
| 302 | Shop Processing | 33 | 9 | 2 | none | no |
| 303 | Name Input Processing | 3 | 3 | 0 | complete | yes |
| 314 | Recover All | 44 | 1 | 42 | none | no |
| 315 | Change EXP | 12 | 0 | 11 | none | no |
| 316 | Change Level | 12 | 2 | 1 | none | no |
| 318 | Change Skill | 72 | 0 | 23 | none | no |
| 320 | Change Name | 1 | 1 | 0 | complete | no |
| 322 | Change Actor Graphic | 37 | 2 | 2 | none | no |
| 353 | Game Over | 2 | 1 | 0 | none | no |
| 354 | Return to Title Screen | 1 | 1 | 0 | none | no |
| 355 | Script | 38 | 5 | 3 | partial | no |
| 401 | Text Data | 11709 | 100 | 132 | complete | yes |
| 402 | When Choice | 1470 | 70 | 18 | complete | yes |
| 403 | When Cancel | 1 | 1 | 0 | complete | yes |
| 404 | End Choices | 650 | 70 | 18 | complete | yes |
| 405 | Scrolling Text Data | 111 | 2 | 0 | none | no |
| 408 | Comment Continuation | 235 | 1 | 12 | complete | no |
| 411 | Else | 775 | 47 | 48 | complete | yes |
| 412 | Branch End | 1808 | 52 | 80 | complete | yes |
| 505 | Move Route Command | 6067 | 102 | 9 | partial | yes |
| 601 | Battle Win | 764 | 96 | 0 | none | no |
| 602 | Battle Escape | 529 | 49 | 0 | none | no |
| 603 | Battle Lose | 763 | 95 | 0 | none | no |
| 604 | Battle End | 764 | 96 | 0 | none | no |
| 605 | Shop Goods | 186 | 7 | 2 | none | no |

## Opening continuation trace (v0.3.1)

The regression follows Map 97 Event 1 Page 0 on the original default path.

| Index | Code | Operation | Verified continuation |
|---:|---:|---|---|
| 10 | 118 | Label `2` | enters original name loop |
| 11 | 303 | Name Input, actor 1, max 6 | suspends on `name_input`; same interpreter resumes exactly once |
| 12 | 111 | Self Switch A condition | next command after modal |
| 51 | 101 | `\N[1]. XÁC NHẬN?` | renders with the confirmed actor name |
| 53 | 102 | `Đúng` / `Không đúng` | accepted branch continues |
| 60 | 212 | Animation 109, sheet `Light6` | missing RTP sheet is diagnostic-only; event logic continues |
| 61 | 101 | Post-name dialogue | renders after confirmation |
| 251 | 201 | Transfer to Map 10 `(15,16)` | browser-verified |

Map 10 Event 38 Page 0 then runs its 29-command autorun, shows the translation-credit message, sets Self Switch A at index 27, and ends with interpreter `running=false` and an empty wait mode. Missing optional event sprite `Damage3` is reported and omitted without aborting the map transfer.

## Embedded Ruby inventory

The machine-readable complete inventory, including full source and locations, is in `generated/audit/embedded-ruby.json`.

| Hash | Kind | Uses | First line |
|---|---|---:|---|
| `51639dbd339fbdcb` | event-script | 6 | `reset_stealth` |
| `2b9339462befb17a` | event-script | 2 | `$game_actors[2].name = $game_actors[1].name` |
| `0847e3ea3ea67ac7` | event-script | 1 | `RETCON::Journal::journal_activate(29)` |
| `0df658acbbdc5f50` | event-script | 1 | `RETCON::Journal::journal_activate(15)` |
| `18763f118e8972b1` | event-script | 1 | `RETCON::Journal::journal_activate(16)` |
| `24404649fc0e5a94` | event-script | 1 | `$game_actors[3].name = $game_actors[1].name` |
| `24e6d1461f44c4d1` | event-script | 1 | `RETCON::Journal::journal_activate(14)` |
| `3ac07a41f4a84b78` | event-script | 1 | `RETCON::Journal::journal_activate(21)` |
| `42e5b822d7d06d9e` | event-script | 1 | `RETCON::Journal::journal_activate(26)` |
| `5744856401098094` | event-script | 1 | `recipe_all_switch_on` |
| `5d3694ba4ae57ec3` | event-script | 1 | `RETCON::Journal::journal_activate(13)` |
| `649b36abc1d0525f` | event-script | 1 | `$game_actors[4].name = $game_actors[1].name` |
| `738b4ce8bc9fb8ba` | event-script | 1 | `RETCON::Journal::journal_activate(9)` |
| `807b9c96b7eaa7fa` | event-script | 1 | `RETCON::Journal::journal_activate(11)` |
| `817800fa75837930` | event-script | 1 | `adv_self_switches("all", "all", "all", false)` |
| `82876320078e7259` | event-script | 1 | `RETCON::Journal::journal_activate(25)` |
| `83aba70ba64503aa` | event-script | 1 | `RETCON::Journal::journal_activate(18)` |
| `88baa1927b3577fe` | event-script | 1 | `RETCON::Journal::journal_activate(17)` |
| `9298ab032d1906bb` | event-script | 1 | `RETCON::Journal::journal_activate(31)` |
| `958b853d785dc9b1` | event-script | 1 | `RETCON::Journal::journal_activate(27)` |
| `9ef7481e6bd538cb` | event-script | 1 | `RETCON::Journal::journal_activate(10)` |
| `a5183522f790ef0c` | event-script | 1 | `RETCON::Journal::journal_activate(30)` |
| `ad18b86a16cf4774` | event-script | 1 | `$game_party.steps = 0` |
| `b377c5659d54f119` | event-script | 1 | `SceneManager.call(Scene_WorldMap)` |
| `b5f6f5d534342237` | event-script | 1 | `RETCON::Journal::journal_activate(22)` |
| `b84aaac3ae7f3cfc` | event-script | 1 | `RETCON::Journal::journal_activate(24)` |
| `c171790eec0f6251` | event-script | 1 | `RETCON::Journal::journal_activate(20)` |
| `d6ff46ac3ee2e238` | event-script | 1 | `RETCON::Journal::journal_activate(28)` |
| `e3b0a63d5c5fac5e` | event-script | 1 | `SceneManager.call(Scene_ItemSynthesis)` |
| `eb753029c2011056` | event-script | 1 | `RETCON::Journal::journal_activate(12)` |
| `ebaa24ebbd98b92c` | event-script | 1 | `RETCON::Journal::journal_activate(23)` |
| `efd56ffc72b07dbd` | event-script | 1 | `RETCON::Journal::journal_activate(19)` |
