# Prefetch and Streaming

BLACK SOULS 0.5.0 uses one `PrefetchManager` for normalized JSON, validated repository/RTP bytes, decoded images, parsed maps, priority scheduling, retries, Cache API persistence, and transition measurements.

## Policy

- Maximum concurrent requests: 8, with 2 slots reserved for `CRITICAL` work.
- Memory byte budget: 64 MiB; decoded-image budget: 160 MiB; parsed-map budget: 24 MiB.
- Timeouts: JSON 10 s, image 18 s, audio 30 s, binary 18 s.
- Critical map resources gate visibility. Off-screen sprites and second-hop map resources stream at lower priority.
- Current-map event lookahead covers transfers, pictures, audio, animations, move-route graphics, battles, and cycle-safe Common Event expansion.
- Cache identity includes runtime, data schema, and immutable asset tag: `0.5.0:black-souls-normalized-data-v1:systems-v0.5.0`.

The opening route is generated from source data as Map 7, direct Map 97, and second-hop Maps 10/98. It is warmed behind the title without executing events.

## Resource correctness

All asset requests flow through the resolver. Fetch response metadata and magic bytes are recorded before decode. Git LFS pointers are rejected. In-flight requests are deduplicated, successful bytes/decoded images are reused, and low-priority prefetch cannot consume reserved critical capacity.

Switch/self-switch page changes, move-route graphics, pictures, and transfers use explicit resource waits. Failures record original path, resolved URL/source, HTTP/decode stage, and interpreter state. Transfers roll back and provide Retry/Cancel.

## Verification

The deterministic integration benchmark warms a cold map JSON plus critical image with two network requests and no duplicate transfer fetch. The final clean browser run reported prefetch hits for Maps 7, 97, and 10; Map 7 and Map 97 became visible in single-digit milliseconds after their critical bundles were warm. Map 10 waited for its larger 25-resource critical bundle and completed with an empty waiting list.
