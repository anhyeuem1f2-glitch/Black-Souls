# SillyTavern runtime environment used by the BLACK SOULS card

This design record is based on the connected read-only investigation of the user's actual SillyTavern installation at revision `9c9be90821ffd6132b40b5f04982522a61d7ad30` (`1.14.0`), TavernHelper / JS-Slash-Runner `4.8.19`, and the failing BLACK SOULS loader diagnostics supplied by the user. It separates statically established behavior from the runtime fact reported by the failing card.

## Established environment facts

- TavernHelper character scripts are executable software, not ordinary card prose. Its `srcdoc` iframe builder exposes parent-side interfaces including TavernHelper and SillyTavern APIs.
- The generated iframe has no HTML `sandbox` attribute in the inspected TavernHelper implementation. Code in that iframe can interact with the host APIs that TavernHelper deliberately exposes and can use the authenticated local SillyTavern session for same-origin APIs.
- The actual failing BLACK SOULS diagnostics reported `location.origin === "null"`. Loader logic must therefore tolerate an opaque-looking document URL and must not use the iframe origin as a runtime resource base.
- SillyTavern's inspected Express/Helmet configuration disables CSP. Prompt Template's optional sandbox and worker isolation were also disabled. The BLACK SOULS loader nevertheless does not depend on `eval`, `new Function`, EJS, Blob URLs, or relaxed CSP.
- Browser `fetch()` is available to TavernHelper/extension JavaScript, but cross-origin response reads remain subject to CORS. Response status, MIME, redirects, and bytes must be checked before execution.
- Regex rules run sequentially and can affect display-only or prompt-only copies. Some installed cards use regex replacements to deliver rich UI/loaders. BLACK SOULS keeps its executable host in one enabled TavernHelper script and does not require regex execution.
- Cross-origin `import()` requires the entry and every nested module to satisfy module CORS and JavaScript MIME rules. One missing descendant rejects the complete module graph. This was unnecessarily fragile for the previous 15-file runtime graph.
- A classic external script has no nested module graph. The repaired loader therefore preflights one bundle, verifies its SHA-256, and loads that exact immutable URL as a classic script with Subresource Integrity and `crossorigin="anonymous"`.
- The runtime global is iframe-local: the bundle exposes `window.BlackSoulsRuntime`. The loader validates `mount`, `unmount`, `getState`, `save`, and `loadSave` before mounting.
- TavernHelper message/card rendering can recreate script DOM. The loader is restartable: each boot gets a new sequence, unmounts an active runtime, removes stale runtime script tags, and repeats source selection. `pagehide` also unmounts and restores the frame style.
- Fullscreen is requested only by an explicit in-game control. Escape leaves browser fullscreen while the game maps its own cancel/menu path. Pausing compacts the TavernHelper frame; resuming restores it.

## Delivery consequences

The loader never derives release URLs from `location.origin`, `document.baseURI`, or `import.meta.url`. It receives and passes four explicit values:

```text
codeBaseUrl   = verified runtime directory at an immutable commit
manifestUrl   = runtime/manifest.json at that commit
dataBaseUrl   = generated/ at that commit
releaseRef    = exact verified 40-character commit SHA for asset resolution
```

Current code delivery uses, in order:

1. `cdn.jsdelivr.net`
2. `testingcf.jsdelivr.net`
3. `fastly.jsdelivr.net`

The code path does not execute Raw GitHub JavaScript. Raw GitHub is useful for repository verification but can expose MIME behavior unsuitable for classic or module execution. The last-known-good release is the exact published commit behind `streaming-v0.4.1`; it is a visible emergency ES-module fallback because that historical commit predates the bundle format.

## Loader state and trust boundary

```text
BOOT
  → PREFLIGHT (manifest, status, redirects, MIME, body signature, boot data)
  → LOADING_RUNTIME (one classic bundle, or explicit legacy fallback)
  → VERIFYING_RUNTIME (SHA-256/SRI and global API contract)
  → INITIALIZING (explicit code/data/asset bases passed to mount)
  → READY
  ↘ ERROR (diagnostics retained; Retry performs a clean selection)
```

The runtime bundle contains code only. Original game assets and normalized game data remain streamed separately and are not embedded in the card or bundle. No loader or gameplay path makes an AI/LLM request.

## What remains for real-user confirmation

Static, HTTP, and browser smoke tests can prove the release object, CORS/MIME behavior, integrity, bundle global, mount path, and original title flow. They cannot prove that the user's currently installed TavernHelper settings enable the imported character script. A fresh card import is required because the pinned ref and inline loader changed; the final confirmation is import/open in the user's real SillyTavern session.
