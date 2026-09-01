# Prefetch and Streaming

Release 0.9.0 routes normalized JSON, validated bytes, decoded images, and parsed maps through one `PrefetchManager`.

Policy: 8 concurrent requests with 2 slots reserved for `CRITICAL`; graph depth 2; interpreter lookahead 48 commands; JSON/image/audio/binary timeouts of 10/18/30/18 seconds. Byte, decoded-image, and parsed-object LRUs are 64/160/24 MiB. Loaded Window/IconSet/title resources are globally pinned; active-map critical resources remain pinned until the map changes.

The generated opening graph is Map 7 → Map 97 → Maps 10 and 98. Title warmup prefetches these maps without executing their events. Event lookahead covers transfers, faces, pictures, audio, animations, move-route graphics, battles, and cycle-safe Common Events. In-flight requests are deduplicated and decoded readiness—not merely HTTP completion—satisfies image barriers.

Map visibility is atomic: map JSON, nonempty tileset sheets, player/fog, and initial-viewport sprites must decode before the bundle is swapped into the renderer. Off-screen and second-hop resources continue at lower priority. Failure diagnostics record source URL, status, MIME, magic bytes, decode stage, interpreter state, pending resources, cache hits, retries, fallbacks, timings, and transition percentiles; critical transfer failure rolls back and exposes Retry/Cancel.

The live unskipped-route run reported Map98 at `(55,5)`, 12/12 critical resources ready, an empty waiting list, a prefetch hit, and no transition warning. Automated tests cover in-flight dedupe, persistent-cache reuse, version isolation, reserved critical capacity, bounded fallback/retry, event/Common Event lookahead, the initial-viewport barrier, and a warm transfer with zero duplicate fetches.

Symbol enemies now start a HIGH-priority troop prefetch at detection time. Contact keeps the event locked behind decoded page graphics, and `startBattle` promotes the troop assets to CRITICAL before the scene swap. Live Map98 event-16 acceptance observed troop 3 ready at HIGH during chase and CRITICAL at battle entry, with no missing battler/battleback frame.
