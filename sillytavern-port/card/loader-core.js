export const LOADER_STATES = Object.freeze({
  BOOT: 'BOOT',
  PREFLIGHT: 'PREFLIGHT',
  LOADING_RUNTIME: 'LOADING_RUNTIME',
  VERIFYING_RUNTIME: 'VERIFYING_RUNTIME',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  ERROR: 'ERROR',
});

export const DEFAULT_SOURCE_HOSTS = Object.freeze([
  Object.freeze({ id: 'jsdelivr', label: 'jsDelivr primary', host: 'cdn.jsdelivr.net' }),
  Object.freeze({ id: 'jsdelivr-testingcf', label: 'jsDelivr testing fallback', host: 'testingcf.jsdelivr.net' }),
  Object.freeze({ id: 'jsdelivr-fastly', label: 'jsDelivr Fastly fallback', host: 'fastly.jsdelivr.net' }),
]);

export function createReleaseCandidates({ owner, repository, currentRef, currentSha256, fallbackRef, overrideBaseUrl }) {
  if (overrideBaseUrl) {
    const baseUrl = ensureTrailingSlash(overrideBaseUrl);
    return [{
      id: 'developer-override', label: 'Developer override', role: 'current', kind: 'bundle',
      owner, repository, ref: 'developer-override', baseUrl,
      manifestUrl: new URL('dist/runtime-build.json', baseUrl).href,
      entryUrl: null, expectedSha256: null,
    }];
  }
  const candidates = [];
  for (const source of DEFAULT_SOURCE_HOSTS) {
    const baseUrl = cdnRuntimeBase(source.host, owner, repository, currentRef);
    candidates.push({
      ...source, role: 'current', kind: 'bundle', owner, repository, ref: currentRef, baseUrl,
      manifestUrl: new URL('dist/runtime-build.json', baseUrl).href,
      entryUrl: null, expectedSha256: currentSha256,
    });
  }
  if (fallbackRef) {
    for (const source of DEFAULT_SOURCE_HOSTS) {
      const baseUrl = cdnRuntimeBase(source.host, owner, repository, fallbackRef);
      candidates.push({
        ...source, id: `${source.id}-last-known-good`, label: `${source.label} · last-known-good`,
        role: 'last-known-good', kind: 'legacy-module', owner, repository, ref: fallbackRef, baseUrl,
        manifestUrl: new URL('module-manifest.json', baseUrl).href,
        entryUrl: new URL('bootstrap.js', baseUrl).href, expectedSha256: null,
      });
    }
  }
  return candidates;
}

export async function bootRuntime({
  candidates,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  executeBundle = executeClassicScript,
  importModule = (url) => import(url),
  onState = () => {},
  mountOptions = () => ({}),
}) {
  const attempts = [];
  onState(LOADER_STATES.BOOT, { attempts });
  for (const candidate of candidates) {
    const attempt = {
      source: candidate.label,
      sourceId: candidate.id,
      role: candidate.role,
      kind: candidate.kind,
      ref: candidate.ref,
      baseUrl: candidate.baseUrl,
      manifestUrl: candidate.manifestUrl,
      requests: [],
      state: LOADER_STATES.PREFLIGHT,
      success: false,
    };
    attempts.push(attempt);
    let runtime = null;
    try {
      onState(LOADER_STATES.PREFLIGHT, { candidate, attempt, attempts });
      const preflight = candidate.kind === 'bundle'
        ? await preflightBundle(candidate, { fetchImpl, cryptoImpl, requests: attempt.requests })
        : await preflightLegacyModule(candidate, { fetchImpl, requests: attempt.requests });
      attempt.preflight = summarizePreflight(preflight);
      attempt.state = LOADER_STATES.LOADING_RUNTIME;
      onState(LOADER_STATES.LOADING_RUNTIME, { candidate, attempt, attempts });
      runtime = candidate.kind === 'bundle'
        ? await executeBundle(preflight, candidate)
        : moduleRuntime(await importModule(preflight.entryUrl));
      attempt.state = LOADER_STATES.VERIFYING_RUNTIME;
      onState(LOADER_STATES.VERIFYING_RUNTIME, { candidate, attempt, attempts });
      assertRuntimeContract(runtime);
      if (candidate.kind === 'bundle' && globalThis.window && runtime !== globalThis.window.BlackSoulsRuntime) {
        throw stageError('runtime-global', 'Classic bundle did not expose window.BlackSoulsRuntime.');
      }
      attempt.state = LOADER_STATES.INITIALIZING;
      onState(LOADER_STATES.INITIALIZING, { candidate, attempt, attempts });
      await runtime.mount({
        codeBaseUrl: candidate.baseUrl,
        manifestUrl: new URL('manifest.json', candidate.baseUrl).href,
        dataBaseUrl: new URL('../generated/', candidate.baseUrl).href,
        releaseRef: candidate.ref,
        ...mountOptions(candidate, preflight),
      });
      attempt.state = LOADER_STATES.READY;
      attempt.success = true;
      attempt.fallbackUsed = candidate.role === 'last-known-good';
      onState(LOADER_STATES.READY, { candidate, attempt, attempts, runtime });
      return { runtime, candidate, attempt, attempts, preflight };
    } catch (error) {
      try { await runtime?.unmount?.(); } catch (cleanupError) { attempt.cleanupError = serializeError(cleanupError); }
      attempt.state = LOADER_STATES.ERROR;
      attempt.error = serializeError(error);
      onState(LOADER_STATES.ERROR, { candidate, attempt, attempts, error });
    }
  }
  const error = stageError('all-sources-failed', 'Every configured runtime source failed.');
  error.attempts = attempts;
  throw error;
}

export async function preflightBundle(candidate, { fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto, requests = [] } = {}) {
  const manifestResponse = await requestBytes(candidate.manifestUrl, {
    fetchImpl, requests, label: 'runtime build manifest', expectedType: 'json', parseJson: true,
  });
  const manifest = validateBuildManifest(manifestResponse.json, candidate.manifestUrl);
  if (candidate.expectedSha256 && normalizeHash(candidate.expectedSha256) !== normalizeHash(manifest.entrySha256)) {
    throw stageError('manifest-integrity', `Build manifest SHA-256 does not match the card's verified release hash at ${candidate.manifestUrl}.`);
  }
  const entryUrl = new URL(manifest.entry, candidate.manifestUrl).href;
  const entryResponse = await requestBytes(entryUrl, {
    fetchImpl, requests, label: 'runtime bundle', expectedType: 'javascript',
  });
  const actualSha256 = await sha256Hex(entryResponse.bytes, cryptoImpl);
  if (actualSha256 !== normalizeHash(manifest.entrySha256)) {
    throw stageError('integrity-mismatch', `Runtime bundle SHA-256 mismatch at ${entryUrl}.`);
  }
  for (const path of manifest.requiredBootData) {
    const url = new URL(path, candidate.manifestUrl).href;
    await requestBytes(url, { fetchImpl, requests, label: `required boot data ${path}`, expectedType: 'json', parseJson: true });
  }
  return { manifest, manifestUrl: candidate.manifestUrl, entryUrl, entryBytes: entryResponse.bytes, entrySha256: actualSha256 };
}

export async function preflightLegacyModule(candidate, { fetchImpl = globalThis.fetch, requests = [] } = {}) {
  const response = await requestBytes(candidate.manifestUrl, {
    fetchImpl, requests, label: 'legacy module manifest', expectedType: 'json', parseJson: true,
  });
  const manifest = response.json;
  if (manifest?.schema !== 'black-souls-runtime-module-tree-v1' || !Array.isArray(manifest.modules) || !manifest.modules.includes(manifest.entry)) {
    throw stageError('legacy-manifest-validate', `Unsupported legacy module manifest at ${candidate.manifestUrl}.`);
  }
  for (const path of manifest.modules) {
    await requestBytes(new URL(path, candidate.baseUrl).href, {
      fetchImpl, requests, label: `legacy ES module ${path}`, expectedType: 'javascript',
    });
  }
  const entryUrl = new URL(manifest.entry, candidate.baseUrl).href;
  return { manifest, manifestUrl: candidate.manifestUrl, entryUrl };
}

export function validateBuildManifest(manifest, manifestUrl = 'runtime-build.json') {
  if (!manifest || manifest.schema !== 'black-souls-runtime-build-v1') throw stageError('build-manifest-schema', `Unsupported runtime build manifest at ${manifestUrl}.`);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(String(manifest.runtimeVersion ?? ''))) throw stageError('build-manifest-version', `Invalid runtimeVersion at ${manifestUrl}.`);
  if (!/^[0-9a-f]{40}$/i.test(String(manifest.sourceCommit ?? ''))) throw stageError('build-manifest-commit', `Invalid sourceCommit at ${manifestUrl}.`);
  if (!/^[\w.-]+\.js$/.test(String(manifest.entry ?? ''))) throw stageError('build-manifest-entry', `Missing or unsafe runtime entry at ${manifestUrl}.`);
  if (!/^[0-9a-f]{64}$/i.test(String(manifest.entrySha256 ?? ''))) throw stageError('build-manifest-integrity', `Invalid entrySha256 at ${manifestUrl}.`);
  if (!Array.isArray(manifest.requiredBootData) || manifest.requiredBootData.length === 0) throw stageError('build-manifest-data', `Required boot data is missing at ${manifestUrl}.`);
  return manifest;
}

export async function requestBytes(url, { fetchImpl, requests = [], label = 'resource', expectedType, parseJson = false }) {
  let response;
  try {
    response = await fetchImpl(url, { cache: 'no-store', mode: 'cors', credentials: 'omit' });
  } catch (error) {
    requests.push({ label, url, stage: 'fetch', error: errorMessage(error) });
    throw stageError('fetch', `${label} could not be fetched from ${url}: ${errorMessage(error)}`, error);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers?.get?.('content-type') || '';
  const record = {
    label, url, finalUrl: response.url || url, redirected: Boolean(response.redirected),
    status: response.status, statusText: response.statusText || '',
    contentType: contentType || '(missing)',
    contentLength: response.headers?.get?.('content-length') || String(bytes.byteLength),
    cors: response.headers?.get?.('access-control-allow-origin') || '(not exposed)',
    bodySignature: bodySignature(bytes),
  };
  requests.push(record);
  if (!response.ok) throw stageError('http-status', `${label} returned HTTP ${response.status} ${response.statusText || ''} at ${url}.`);
  validateBody(bytes, url);
  if (expectedType === 'javascript' && !isJavaScriptMime(contentType)) throw stageError('content-type', `${label} has unusable JavaScript Content-Type "${contentType || '(missing)'}" at ${url}.`);
  if (expectedType === 'json' && !isJsonMime(contentType)) throw stageError('content-type', `${label} has unusable JSON Content-Type "${contentType || '(missing)'}" at ${url}.`);
  let json;
  if (parseJson) {
    try { json = JSON.parse(new TextDecoder().decode(bytes)); }
    catch (error) { throw stageError('json-parse', `${label} is not valid JSON at ${url}.`, error); }
  }
  return { response, bytes, json, record };
}

export function validateBody(bytes, url = 'resource') {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw stageError('empty-body', `Empty response body at ${url}.`);
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 512))).trimStart();
  if (/^<!doctype\s+html|^<html\b|^<head\b|^<body\b/i.test(prefix)) throw stageError('html-body', `HTML was returned instead of a runtime resource at ${url}.`);
  if (/^version https:\/\/git-lfs\.github\.com\/spec\/v1\b/i.test(prefix)) throw stageError('lfs-pointer', `Git LFS pointer was returned instead of resource bytes at ${url}.`);
  if (/^(?:couldn't find|package size exceeded|rate limit)/i.test(prefix)) throw stageError('error-body', `CDN error text was returned at ${url}.`);
}

export async function sha256Hex(bytes, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw stageError('crypto-unavailable', 'Web Crypto SHA-256 is unavailable in this execution context.');
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function isJavaScriptMime(contentType) { return /^(?:application|text)\/(?:javascript|ecmascript|x-javascript)(?:\s*;|$)/i.test(contentType); }
export function isJsonMime(contentType) { return /^(?:application|text)\/(?:[\w.+-]*\+?json)(?:\s*;|$)/i.test(contentType); }
export function stageError(stage, message, cause) { const error = new Error(message); error.stage = stage; if (cause) error.cause = cause; return error; }
export function serializeError(error) { return { name: String(error?.name || 'Error'), stage: String(error?.stage || 'unknown'), message: errorMessage(error), stack: String(error?.stack || ''), cause: error?.cause ? errorMessage(error.cause) : undefined }; }

export async function executeClassicScript(preflight) {
  document.querySelectorAll('script[data-black-souls-runtime]').forEach((script) => script.remove());
  try { delete window.BlackSoulsRuntime; } catch { window.BlackSoulsRuntime = undefined; }
  const script = document.createElement('script');
  script.src = preflight.entryUrl;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.integrity = sha256Sri(preflight.entrySha256);
  script.dataset.blackSoulsRuntime = preflight.entrySha256;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(stageError('script-timeout', `Runtime script timed out at ${preflight.entryUrl}.`)), 20000);
    script.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
    script.addEventListener('error', () => { clearTimeout(timeout); reject(stageError('script-load', `Classic runtime script failed at ${preflight.entryUrl}.`)); }, { once: true });
    document.head.append(script);
  });
  return window.BlackSoulsRuntime;
}

function assertRuntimeContract(runtime) {
  for (const method of ['mount', 'unmount', 'getState', 'save', 'loadSave']) {
    if (typeof runtime?.[method] !== 'function') throw stageError('runtime-contract', `Runtime does not expose ${method}().`);
  }
}
function moduleRuntime(namespace) { return namespace?.BlackSoulsRuntime ?? globalThis.window?.BlackSoulsRuntime; }
function summarizePreflight(value) { return { manifestUrl: value.manifestUrl, entryUrl: value.entryUrl, entrySha256: value.entrySha256, runtimeVersion: value.manifest?.runtimeVersion ?? value.manifest?.version }; }
function cdnRuntimeBase(host, owner, repository, ref) { return `https://${host}/gh/${owner}/${repository}@${ref}/sillytavern-port/runtime/`; }
function ensureTrailingSlash(value) { const url = new URL(value, globalThis.location?.href ?? 'http://localhost/'); return new URL('./', url.href.endsWith('/') ? url : `${url.href}/`).href; }
function normalizeHash(value) { return String(value ?? '').replace(/^sha256-/i, '').toUpperCase(); }
function errorMessage(error) { return String(error?.message || error || 'Unknown error'); }
function bodySignature(bytes) { return [...bytes.subarray(0, 12)].map((value) => value.toString(16).padStart(2, '0')).join(' '); }
function sha256Sri(hex) { const bytes = String(hex).match(/../g).map((value) => String.fromCharCode(Number.parseInt(value, 16))).join(''); return `sha256-${btoa(bytes)}`; }
