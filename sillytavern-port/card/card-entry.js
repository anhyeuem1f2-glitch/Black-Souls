const RUNTIME_RELEASE = Object.freeze({
  owner: 'anhyeuem1f2-glitch',
  repository: 'Black-Souls',
  ref: String(window.BLACK_SOULS_RUNTIME_REF_OVERRIDE || 'name-confirm-v0.3.1').trim(),
  path: 'sillytavern-port/runtime/',
});

const RUNTIME_SOURCES = Object.freeze([
  Object.freeze({ id: 'jsdelivr', label: 'jsDelivr primary', origin: 'https://cdn.jsdelivr.net' }),
  Object.freeze({ id: 'jsdelivr-testingcf', label: 'jsDelivr testing fallback', origin: 'https://testingcf.jsdelivr.net' }),
  Object.freeze({ id: 'github-raw', label: 'GitHub Raw last fallback', origin: 'https://raw.githubusercontent.com' }),
]);

const DEBUG_OVERRIDE_KEY = 'black-souls-runtime-debug-override-v3';
const MODULE_MANIFEST = 'module-manifest.json';
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

function releaseBase(source) {
  const { owner, repository, ref, path } = RUNTIME_RELEASE;
  if (source.id === 'github-raw') return `${source.origin}/${owner}/${repository}/${ref}/${path}`;
  return `${source.origin}/gh/${owner}/${repository}@${ref}/${path}`;
}

function configuredSources() {
  const override = String(window.BLACK_SOULS_RUNTIME_OVERRIDE || localStorage.getItem(DEBUG_OVERRIDE_KEY) || '').trim();
  if (override) {
    const bootstrapUrl = new URL(override, location.href).href;
    return [{
      id: 'developer-override',
      label: 'Developer override',
      baseUrl: new URL('./', bootstrapUrl).href,
      bootstrapUrl,
    }];
  }
  return RUNTIME_SOURCES.map((source) => {
    const baseUrl = releaseBase(source);
    return { ...source, baseUrl, bootstrapUrl: new URL('bootstrap.js', baseUrl).href };
  });
}

async function boot() {
  const sequence = ++bootSequence;
  showFrame();
  renderLoader();
  const diagnostics = {
    schema: 'black-souls-loader-diagnostics-v1',
    origin: location.origin,
    release: { ...RUNTIME_RELEASE },
    startedAt: new Date().toISOString(),
    attempts: [],
    successfulSource: null,
  };
  window.BLACK_SOULS_LOADER_DIAGNOSTICS = diagnostics;

  for (const source of configuredSources()) {
    if (sequence !== bootSequence) return;
    const attempt = {
      source: source.label,
      baseUrl: source.baseUrl,
      bootstrapUrl: source.bootstrapUrl,
      stage: 'checking-runtime',
      requests: [],
      success: false,
    };
    diagnostics.attempts.push(attempt);
    try {
      setLoaderState('Checking runtime...', source.label, diagnostics);
      await preflightRuntime(source, attempt);

      attempt.stage = 'module-import';
      setLoaderState('Loading runtime...', source.bootstrapUrl, diagnostics);
      const importUrl = cacheBusted(source.bootstrapUrl);
      attempt.importUrl = importUrl;
      let runtimeNamespace;
      try {
        runtimeNamespace = await import(importUrl);
      } catch (error) {
        throw stageError(
          'module-import',
          `bootstrap.js or one of its descendants failed during browser module import after ${attempt.moduleCount} files passed HTTP/MIME preflight. Browser error: ${errorMessage(error)}`,
          error,
        );
      }
      const runtime = runtimeNamespace.BlackSoulsRuntime || window.BlackSoulsRuntime;
      if (!runtime || typeof runtime.mount !== 'function') {
        throw stageError('runtime-contract', 'bootstrap.js loaded but did not expose BlackSoulsRuntime.mount().');
      }

      attempt.stage = 'runtime-mount';
      setLoaderState('Loading game data...', source.baseUrl, diagnostics);
      try {
        await runtime.mount({
          target: document.body,
          assetDevelopmentBaseUrl: window.BLACK_SOULS_ASSET_DEVELOPMENT_BASE_OVERRIDE || undefined,
          onHostState: handleHostState,
          onLoaderState: (state, detail = '') => {
            attempt.runtimeState = state;
            attempt.runtimeDetail = detail;
            console.info(`[BLACK SOULS loader] ${state}`, detail);
          },
        });
      } catch (error) {
        try { await runtime.unmount?.(); } catch (cleanupError) { attempt.cleanupError = serializeError(cleanupError); }
        throw stageError('runtime-mount', `Runtime loaded from ${source.label}, but mount failed: ${errorMessage(error)}`, error);
      }

      attempt.stage = 'ready';
      activeRuntime = runtime;
      attempt.success = true;
      diagnostics.successfulSource = source.baseUrl;
      diagnostics.completedAt = new Date().toISOString();
      console.info('[BLACK SOULS loader] Runtime ready', { source: source.label, baseUrl: source.baseUrl, diagnostics });
      return;
    } catch (error) {
      attempt.stage = error.stage || attempt.stage;
      attempt.error = serializeError(error);
      console.error('[BLACK SOULS loader] Source failed', { source: source.label, attempt });
      if (sequence !== bootSequence) return;
      renderLoader();
      setLoaderState('Checking runtime...', `Trying the next source after ${source.label}`, diagnostics);
    }
  }

  diagnostics.completedAt = new Date().toISOString();
  showFailure(diagnostics);
}

async function preflightRuntime(source, attempt) {
  attempt.stage = 'module-manifest-fetch';
  const manifestUrl = new URL(MODULE_MANIFEST, source.baseUrl).href;
  const response = await checkedFetch(manifestUrl, attempt, 'module manifest');
  let manifest;
  try {
    manifest = await response.json();
  } catch (error) {
    throw stageError('module-manifest-parse', `Module manifest is not valid JSON: ${manifestUrl}`, error);
  }
  if (manifest.schema !== 'black-souls-runtime-module-tree-v1' || !Array.isArray(manifest.modules)) {
    throw stageError('module-manifest-validate', `Unsupported module manifest at ${manifestUrl}.`);
  }
  if (!manifest.modules.includes(manifest.entry) || new URL(manifest.entry, source.baseUrl).href !== source.bootstrapUrl) {
    throw stageError('module-manifest-validate', `Module manifest entry does not match ${source.bootstrapUrl}.`);
  }

  attempt.stage = 'module-tree-preflight';
  attempt.moduleCount = manifest.modules.length;
  const results = await Promise.allSettled(manifest.modules.map(async (path) => {
    const url = new URL(path, source.baseUrl).href;
    const moduleResponse = await checkedFetch(url, attempt, `ES module ${path}`);
    const contentType = moduleResponse.headers.get('content-type') || '';
    if (!isJavaScriptMime(contentType)) {
      throw stageError('module-mime-check', `ES module ${path} has unusable Content-Type "${contentType || '(missing)'}" at ${url}.`);
    }
  }));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
}

async function checkedFetch(url, attempt, label) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store', mode: 'cors', credentials: 'omit' });
  } catch (error) {
    attempt.requests.push({ label, url, stage: 'fetch', error: errorMessage(error) });
    throw stageError('http-fetch', `${label} could not be fetched from ${url}: ${errorMessage(error)}`, error);
  }
  const record = {
    label,
    url,
    finalUrl: response.url,
    redirected: response.redirected,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('content-type') || '(missing)',
    cors: response.headers.get('access-control-allow-origin') || '(not exposed)',
  };
  attempt.requests.push(record);
  if (!response.ok) {
    throw stageError('http-status', `${label} returned HTTP ${response.status} ${response.statusText} at ${url}.`);
  }
  return response;
}

function cacheBusted(url) {
  const result = new URL(url);
  if (RUNTIME_RELEASE.ref === 'main') result.searchParams.set('bs_dev', `${Date.now()}-${bootSequence}`);
  return result.href;
}

function isJavaScriptMime(contentType) {
  return /^(?:application|text)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(contentType);
}

function stageError(stage, message, cause) {
  const error = new Error(message);
  error.stage = stage;
  if (cause) error.cause = cause;
  return error;
}

function errorMessage(error) {
  return String(error?.message || error || 'Unknown error');
}

function serializeError(error) {
  return {
    name: String(error?.name || 'Error'),
    stage: String(error?.stage || 'unknown'),
    message: errorMessage(error),
    stack: String(error?.stack || ''),
    cause: error?.cause ? errorMessage(error.cause) : undefined,
  };
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

function setLoaderState(state, detail = '', diagnostics) {
  document.querySelector('.bs-loader-state')?.replaceChildren(state);
  document.querySelector('.bs-loader-detail')?.replaceChildren(detail);
  void diagnostics;
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
      <p>Every configured source failed. The report below records the source, stage, HTTP status, redirect target, Content-Type, and browser error.</p>
      <pre data-diagnostics></pre>
      <button data-retry>Retry configured sources</button><button data-close>Exit to SillyTavern</button>
      <details><summary>Developer override</summary>
        <label>Bootstrap URL<input data-override placeholder="https://.../runtime/bootstrap.js"></label>
        <button data-use-override>Retry override</button><button data-clear-override>Clear override</button>
      </details>
    </section></main>`;
  document.querySelector('[data-diagnostics]').textContent = JSON.stringify(diagnostics, null, 2);
  const input = document.querySelector('[data-override]');
  input.value = String(window.BLACK_SOULS_RUNTIME_OVERRIDE || localStorage.getItem(DEBUG_OVERRIDE_KEY) || '');
  document.querySelector('[data-retry]').addEventListener('click', () => {
    localStorage.removeItem(DEBUG_OVERRIDE_KEY);
    boot();
  });
  document.querySelector('[data-use-override]').addEventListener('click', () => {
    const value = input.value.trim();
    if (value) localStorage.setItem(DEBUG_OVERRIDE_KEY, value);
    boot();
  });
  document.querySelector('[data-clear-override]').addEventListener('click', () => {
    localStorage.removeItem(DEBUG_OVERRIDE_KEY);
    input.value = '';
  });
  document.querySelector('[data-close]').addEventListener('click', showErrorRecovery);
}

function showErrorRecovery() {
  document.body.innerHTML = `<style>:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080607}button{width:100%;height:100%;border:1px solid #744;color:#fff;background:linear-gradient(#28181c,#120d0f);font:13px ui-monospace,monospace;cursor:pointer}</style><button data-reopen>Retry BLACK SOULS</button>`;
  document.querySelector('[data-reopen]').addEventListener('click', boot);
  compactFrame();
}

window.addEventListener('pagehide', () => {
  void activeRuntime?.unmount?.();
  frame?.removeAttribute('style');
});

boot();
