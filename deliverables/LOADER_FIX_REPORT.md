# BLACK SOULS SillyTavern loader hard-fix report

## Root cause

The v0.5.0 card pinned `systems-v0.5.0`, but that tag existed only in the local checkout and was never published to GitHub. Before repair, `origin/main` was `5ac55ae9b4b983e5aa3d9f107447f975e60e059b` and `git ls-remote` returned no remote `systems-v0.5.0` ref. The loader change from the last working card to the broken card was the pinned ref change from `streaming-v0.4.1` to the unpublished tag.

The three broken entry requests were:

| Requested URL | Status | Redirect | Content-Type | Length | Body signature |
|---|---:|---|---|---:|---|
| `https://cdn.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@systems-v0.5.0/sillytavern-port/runtime/bootstrap.js` | 404 | none | `text/plain; charset=utf-8` | 96 | `Couldn't find the requested file...` |
| `https://testingcf.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@systems-v0.5.0/sillytavern-port/runtime/bootstrap.js` | 404 | none | `text/plain; charset=utf-8` | 96 | `Couldn't find the requested file...` |
| `https://raw.githubusercontent.com/anhyeuem1f2-glitch/Black-Souls/systems-v0.5.0/sillytavern-port/runtime/bootstrap.js` | 404 | none | `text/plain; charset=utf-8` | 14 | `404: Not Found` |

The older loader also depended on one cross-origin ES-module entry plus every nested relative module. That architecture had already worked at the last published ref, so it was not the cause of these three 404s, but it unnecessarily multiplied CORS/MIME failure points in the TavernHelper iframe.

## SillyTavern environment findings used

- The connected forensic investigation identified SillyTavern `1.14.0` and TavernHelper / JS-Slash-Runner `4.8.19`.
- TavernHelper constructs a `srcdoc` iframe, exposes parent/TavernHelper APIs, and does not add an HTML `sandbox` attribute in the inspected implementation.
- The user's failing loader reported `location.origin === "null"`; the loader therefore never uses iframe origin, document URL, or `import.meta.url` to derive release resources.
- Browser `fetch` is available but cross-origin reads require CORS. Every manifest, bundle, and required boot-data response is checked before execution.
- A stricter local `origin:null` sandbox test revealed that `window.caches` can throw `SecurityError`. Cache access now degrades to memory, and unavailable IndexedDB degrades to session-memory saves instead of aborting boot.
- The current path uses one classic script with SHA-256/SRI. It does not require EJS, regex delivery, `eval`, `new Function`, or Blob execution.

See `sillytavern-port/SILLYTAVERN_RUNTIME_ENVIRONMENT.md` for the full runtime design record.

## New verified release

```text
commit: f0ed57350f8cf47b80d091df39b9b8cb80101a0f
runtime version: 0.6.0
entry: sillytavern-port/runtime/dist/black-souls-runtime.bundle.js
entry SHA-256: E0A4D59609F9AA575C938827C5283EF172C0ED6D5D97872586A8BA6FD8AD2558
uncompressed entry bytes: 218961
loader strategy: integrity-checked classic IIFE bundle
```

The runtime build manifest is generated at `sillytavern-port/runtime/dist/runtime-build.json`. It records its committed source revision, build timestamp, runtime version, entry hash/size, data schema, dependency-index schema, and required boot-data paths.

## Verified runtime URLs

All three returned HTTP 200, `application/javascript; charset=utf-8`, no redirect, and identical decoded SHA-256 bytes. The reported HTTP `Content-Length` was 52,203 bytes because the CDN representation was compressed.

```text
PRIMARY
https://cdn.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@f0ed57350f8cf47b80d091df39b9b8cb80101a0f/sillytavern-port/runtime/dist/black-souls-runtime.bundle.js

FALLBACK 1
https://testingcf.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@f0ed57350f8cf47b80d091df39b9b8cb80101a0f/sillytavern-port/runtime/dist/black-souls-runtime.bundle.js

FALLBACK 2
https://fastly.jsdelivr.net/gh/anhyeuem1f2-glitch/Black-Souls@f0ed57350f8cf47b80d091df39b9b8cb80101a0f/sillytavern-port/runtime/dist/black-souls-runtime.bundle.js
```

## Fallback and retry behavior

The current exact commit is tried across jsDelivr primary, testingcf, and Fastly. The loader preflights the generated build manifest, the bundle, and all boot data; validates MIME/body signatures; verifies the card-embedded hash against the manifest; computes the received bundle SHA-256; and then applies browser SRI to classic-script execution.

If every current source fails, the loader visibly tries the exact last-known-good published commit `5ac55ae9b4b983e5aa3d9f107447f975e60e059b` (`streaming-v0.4.1`) through its historical module entry. Diagnostics record `fallbackUsed: true`; the downgrade is not silent. Retry unmounts any active runtime, removes failed script tags/global state, and starts source selection again.

## Build/export guard

`tools/validate-release.mjs` requires the exact commit to be pushed as `origin/main`, checks the configured fetch/push URLs, validates primary and fallback CDNs, required data, MIME/body signatures, and bundle integrity, then writes `sillytavern-port/release/verified-runtime.json`.

`tools/build-card.mjs` refuses to export unless that verification record contains a 40-character commit, a 64-character SHA-256, a semantic runtime version, and at least one successful primary and fallback source. It injects the verified ref/hash into a self-contained TavernHelper loader and writes both the internal card and the user-facing deliverable.

## Re-import

```text
RE-IMPORT REQUIRED: YES
```

The inline loader, pinned runtime ref, runtime API delivery format, and card version changed. Import `deliverables/Black_Souls_ST.json` again and enable its TavernHelper character script.

## Verification scope

- Automated runtime/loader/game tests cover missing refs/entries, bad MIME, HTML and LFS bodies, integrity mismatch, CDN fallback, last-known-good fallback, runtime global/contract, mount, retry, build manifest, production export gate, opaque-origin cache access, and storage fallback.
- A browser smoke used a sandboxed `srcdoc` iframe that reported `origin:null`; the verified classic bundle reached the original BLACK SOULS title and New Game opening.
- Git/CDN HTTP validation was performed against the pushed exact commit.
- The user's real SillyTavern account/session has not been operated by Codex; final confirmation remains import/open in that installation.

## Original game files

Original `Game.exe`, `Game.ini`, `System/`, `Data/`, `Graphics/`, and `Audio/` were not modified or executed.
