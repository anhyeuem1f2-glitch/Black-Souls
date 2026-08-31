import { bootRuntime, createReleaseCandidates, LOADER_STATES, serializeError } from './loader-core.js';

const RELEASE = Object.freeze({
  owner: 'anhyeuem1f2-glitch',
  repository: 'Black-Souls',
  currentRef: __BLACK_SOULS_RUNTIME_REF__,
  currentSha256: __BLACK_SOULS_RUNTIME_SHA256__,
  fallbackRef: '5ac55ae9b4b983e5aa3d9f107447f975e60e059b',
});
const DEBUG_OVERRIDE_KEY = 'black-souls-runtime-debug-override-v4';
const frame = window.frameElement;
let bootSequence = 0;
let activeRuntime = null;

function showFrame() {
  frame?.style.setProperty('display', 'block', 'important');
  frame?.style.setProperty('position', 'fixed', 'important');
  frame?.style.setProperty('inset', '0', 'important');
  frame?.style.setProperty('width', '100vw', 'important');
  frame?.style.setProperty('height', '100vh', 'important');
  frame?.style.setProperty('border', '0', 'important');
  frame?.style.setProperty('z-index', '2147483000', 'important');
  document.body.style.margin = '0';
}

function compactFrame() {
  frame?.style.setProperty('display', 'block', 'important');
  frame?.style.setProperty('position', 'fixed', 'important');
  frame?.style.setProperty('inset', 'auto 16px 16px auto', 'important');
  frame?.style.setProperty('width', '270px', 'important');
  frame?.style.setProperty('height', '64px', 'important');
  frame?.style.setProperty('border', '0', 'important');
  frame?.style.setProperty('z-index', '2147483000', 'important');
}

function handleHostState(event) {
  if (event?.state === 'PAUSED') compactFrame();
  else if (event?.state && event.state !== 'UNMOUNTED') showFrame();
}

async function boot() {
  const sequence = ++bootSequence;
  showFrame();
  renderLoader();
  await cleanupRuntime();
  if (sequence !== bootSequence) return;
  const overrideBaseUrl = String(window.BLACK_SOULS_RUNTIME_OVERRIDE || storageGet(DEBUG_OVERRIDE_KEY) || '').trim();
  const candidates = createReleaseCandidates({ ...RELEASE, overrideBaseUrl });
  const diagnostics = {
    schema: 'black-souls-loader-diagnostics-v2',
    origin: location.origin,
    executionContext: 'TavernHelper srcdoc iframe',
    loaderStrategy: 'verified classic bundle with legacy last-known-good fallback',
    release: { ...RELEASE, currentSha256: RELEASE.currentSha256 },
    startedAt: new Date().toISOString(),
    attempts: [],
    successfulSource: null,
    fallbackUsed: false,
  };
  window.BLACK_SOULS_LOADER_DIAGNOSTICS = diagnostics;
  try {
    const result = await bootRuntime({
      candidates,
      onState: (state, context) => {
        diagnostics.state = state;
        diagnostics.attempts = context.attempts ?? diagnostics.attempts;
        if (state === LOADER_STATES.PREFLIGHT) setLoaderState('Checking runtime...', `${context.candidate.label} · ${context.candidate.ref}`);
        if (state === LOADER_STATES.LOADING_RUNTIME) setLoaderState('Loading runtime...', context.candidate.kind === 'bundle' ? 'Verified classic bundle' : 'Last-known-good ES-module fallback');
        if (state === LOADER_STATES.VERIFYING_RUNTIME) setLoaderState('Verifying runtime...', context.candidate.label);
        if (state === LOADER_STATES.INITIALIZING) setLoaderState('Loading game data...', context.candidate.baseUrl);
        if (state === LOADER_STATES.ERROR) console.error('[BLACK SOULS loader] Source failed', context.attempt);
      },
      mountOptions: () => ({
        target: document.body,
        assetDevelopmentBaseUrl: window.BLACK_SOULS_ASSET_DEVELOPMENT_BASE_OVERRIDE || undefined,
        onHostState: handleHostState,
        onLoaderState: (state, detail = '') => {
          diagnostics.runtimeState = state;
          diagnostics.runtimeDetail = detail;
          setLoaderState(state, detail);
        },
      }),
    });
    if (sequence !== bootSequence) {
      await result.runtime.unmount?.();
      return;
    }
    activeRuntime = result.runtime;
    diagnostics.attempts = result.attempts;
    diagnostics.successfulSource = result.candidate.baseUrl;
    diagnostics.successfulRef = result.candidate.ref;
    diagnostics.fallbackUsed = result.candidate.role === 'last-known-good';
    diagnostics.completedAt = new Date().toISOString();
    console.info('[BLACK SOULS loader] Runtime ready', diagnostics);
  } catch (error) {
    if (sequence !== bootSequence) return;
    diagnostics.state = LOADER_STATES.ERROR;
    diagnostics.attempts = error.attempts ?? diagnostics.attempts;
    diagnostics.error = serializeError(error);
    diagnostics.completedAt = new Date().toISOString();
    showFailure(diagnostics);
  }
}

async function cleanupRuntime() {
  try { await activeRuntime?.unmount?.(); } catch (error) { console.warn('[BLACK SOULS loader] Cleanup failed', error); }
  activeRuntime = null;
  document.querySelectorAll('script[data-black-souls-runtime]').forEach((script) => script.remove());
  try { delete window.BlackSoulsRuntime; } catch { window.BlackSoulsRuntime = undefined; }
}

function renderLoader() {
  document.body.innerHTML = `
    <style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#050506;color:#ddd;font:14px/1.5 ui-monospace,monospace}
      .bs-loader{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 25%,#24171b,#050506 62%)}
      .bs-loader-card{width:min(820px,100%);border:1px solid #5d4042;padding:22px;background:#0d0a0b;box-shadow:0 18px 70px #000}
      h1{font:28px Georgia,serif;margin:0 0 20px}.bs-loader-state{font-size:17px;color:#fff}.bs-loader-detail{color:#9d9290;overflow-wrap:anywhere}
      .bs-loader-track{height:3px;margin:18px 0;background:linear-gradient(90deg,#9a343c 0 42%,#281d20 42%);animation:bs-pulse 1.1s ease-in-out infinite alternate}
      button,input{font:inherit}button{padding:8px 14px;background:#27181b;color:#fff;border:1px solid #744;cursor:pointer}
      @keyframes bs-pulse{to{filter:brightness(1.6)}}
    </style>
    <main class="bs-loader"><section class="bs-loader-card">
      <h1>BLACK SOULS</h1><div class="bs-loader-state" aria-live="polite">Checking runtime...</div>
      <div class="bs-loader-detail"></div><div class="bs-loader-track"></div>
    </section></main>`;
}

function setLoaderState(state, detail = '') {
  document.querySelector('.bs-loader-state')?.replaceChildren(state);
  document.querySelector('.bs-loader-detail')?.replaceChildren(detail);
}

function showFailure(diagnostics) {
  document.body.innerHTML = `
    <style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#050506;color:#ddd;font:14px/1.5 ui-monospace,monospace}
      main{min-height:100vh;display:grid;place-items:center;padding:24px}.box{width:min(920px,100%);border:1px solid #743b42;padding:22px;background:#100c0d}
      h1{font:26px Georgia,serif;margin-top:0;color:#f0dddd}pre{max-height:45vh;overflow:auto;padding:12px;background:#070607;border:1px solid #39272a;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}
      button,input{font:inherit}button{padding:8px 14px;background:#27181b;color:#fff;border:1px solid #744;cursor:pointer;margin:4px 6px 4px 0}input{width:100%;margin:8px 0;padding:8px;background:#090708;color:#eee;border:1px solid #655}
      details{margin-top:14px;color:#aaa}
    </style>
    <main><section class="box">
      <h1>BLACK SOULS runtime could not load</h1>
      <p>Every verified current and last-known-good source failed. Retry clears failed runtime state and starts source selection again.</p>
      <pre data-diagnostics></pre>
      <button data-retry>Retry verified sources</button><button data-close>Exit to SillyTavern</button>
      <details><summary>Developer override</summary>
        <label>Runtime base URL<input data-override placeholder="http://127.0.0.1:4174/sillytavern-port/runtime/"></label>
        <button data-use-override>Retry override</button><button data-clear-override>Clear override</button>
      </details>
    </section></main>`;
  document.querySelector('[data-diagnostics]').textContent = JSON.stringify(diagnostics, null, 2);
  const input = document.querySelector('[data-override]');
  input.value = String(window.BLACK_SOULS_RUNTIME_OVERRIDE || storageGet(DEBUG_OVERRIDE_KEY) || '');
  document.querySelector('[data-retry]').addEventListener('click', () => { storageRemove(DEBUG_OVERRIDE_KEY); void boot(); });
  document.querySelector('[data-use-override]').addEventListener('click', () => { const value = input.value.trim(); if (value) storageSet(DEBUG_OVERRIDE_KEY, value); void boot(); });
  document.querySelector('[data-clear-override]').addEventListener('click', () => { storageRemove(DEBUG_OVERRIDE_KEY); input.value = ''; });
  document.querySelector('[data-close]').addEventListener('click', showErrorRecovery);
}

function showErrorRecovery() {
  document.body.innerHTML = `<style>:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080607}button{width:100%;height:100%;border:1px solid #744;color:#fff;background:linear-gradient(#28181c,#120d0f);font:13px ui-monospace,monospace;cursor:pointer}</style><button data-reopen>Retry BLACK SOULS</button>`;
  document.querySelector('[data-reopen]').addEventListener('click', () => void boot());
  compactFrame();
}

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* opaque origins may deny storage */ } }
function storageRemove(key) { try { localStorage.removeItem(key); } catch { /* opaque origins may deny storage */ } }

window.addEventListener('pagehide', () => {
  void cleanupRuntime();
  frame?.removeAttribute('style');
});

void boot();
