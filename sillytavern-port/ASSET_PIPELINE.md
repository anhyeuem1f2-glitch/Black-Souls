# Asset Pipeline

`tools/build-assets.mjs` generates `generated/asset-manifest.json` schema v2 from tracked original assets plus the isolated browser RTP subset. Entries record original path, category, extension, size, Git LFS state, delivery mode, and SHA-256 for bundled files. Reverse references are derived from System, tilesets, actors, maps, events, animations, pictures, and audio commands.

`AssetResolver` is the only URL policy: bundled RTP first, GitHub Media for original LFS objects, GitHub raw redirect as an LFS-aware fallback, and repository-relative CDN URLs only for non-LFS blobs. Bytes are fetched before decode; LFS pointer text and invalid PNG/JPEG/Ogg/WAV/MP3 signatures are rejected. Unicode path segments are encoded independently.

The repository declares `RPGVXAce` RTP but does not contain every standard file referenced by the original data. Browser-required RTP files live only under `sillytavern-port/assets/rtp/`; the canonical `Graphics/` and `Audio/` trees remain untouched. The source archive is the official `RPGVXAce_RTP.zip`, SHA-256 `7E93D0EAD93A686218B7C671BF099EF42F09F536083BD0B2F0FA6423A39FC19B`. Extraction used innoextract 1.9 for Windows, archive SHA-256 `6989342C9B026A00A72A38F23B62A8E6A22CC5DE69805CF47D68AC2FEC993065`.

Release 0.7 adds only the standard assets required by the exact Map97/Map98 opening: Dungeon A1/A2/A4/A5/C, `Light6`, `Damage3`, `Monster1`, and Move/Open3/Slash7/Slash9. The original custom `Dungeon_B.png` remains authoritative. `.gitattributes` leaves this isolated subset outside LFS so immutable CDN refs return real bytes.

`tools/build-prefetch.mjs` produces the two-hop transfer graph, initial-viewport critical sets, event assets, transfer points, and Common Event/battle/animation dependencies. The runtime verifies decode readiness before map activation and exposes source/status/content/decode/cache metrics in its Diagnostics panel.
