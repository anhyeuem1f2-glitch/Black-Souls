# Asset Pipeline

`tools/build-assets.mjs` builds `generated/asset-manifest.json` from the Git tree and direct normalized database/map references. Runtime paths preserve the original `Graphics/...` and `Audio/...` identity and are URL-encoded segment by segment.

Assets are loaded lazily when a map/scene requests them. Missing optional images resolve to a reported compatibility gap rather than an invented substitute. Required data JSON fails loudly.

The source declares `RPGVXAce` RTP in `Game.ini`. Several referenced standard sheets and sounds—such as the `Inside_*`, `Outside_*`, and `Fire1` families—are not committed in this repository. A faithful release therefore needs a legal RTP asset provisioning step or a user-supplied RTP path. The current renderer shows diagnostic colors for unresolved tiles and does not claim visual fidelity.

Planned next steps:

1. Generate per-map dependency shards including event command pictures/audio.
2. Add extension probing for `.ogg`, `.mp3`, and `.wav` without duplicate network storms.
3. Implement Cache API/IndexedDB metadata with content hashes.
4. Require asset-integrity data for stable tagged releases.
