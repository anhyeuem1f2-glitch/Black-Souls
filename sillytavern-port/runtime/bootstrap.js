import { BlackSoulsHost } from './host.js';

let activeHost = null;

async function mount(options = {}) {
  if (activeHost) await activeHost.unmount();
  const manifestUrl = new URL(options.manifestUrl ?? './manifest.json', import.meta.url);
  options.onLoaderState?.('Loading game data...', manifestUrl.href);
  const manifest = await fetchJson(manifestUrl);
  activeHost = new BlackSoulsHost({ ...options, manifest, manifestUrl });
  await activeHost.mount();
  return activeHost;
}

async function unmount() {
  if (!activeHost) return;
  await activeHost.unmount();
  activeHost = null;
}

const api = {
  mount,
  unmount,
  loadSave: (slot) => activeHost?.loadSave(slot),
  save: (slot) => activeHost?.save(slot),
  reset: () => activeHost?.reset(),
  pause: () => activeHost?.pause(),
  resume: () => activeHost?.resume(),
  getState: () => activeHost?.getState() ?? null,
  getHostState: () => activeHost?.getHostState() ?? { state: 'UNMOUNTED', presentation: 'WINDOWED', scene: null },
  getDiagnostics: () => activeHost?.getDiagnostics() ?? null,
};

globalThis.BlackSoulsRuntime = api;

export { api as BlackSoulsRuntime, mount, unmount };

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Runtime manifest failed: HTTP ${response.status} ${response.statusText} at ${url}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/\bjson\b/i.test(contentType)) throw new Error(`Runtime manifest has invalid Content-Type "${contentType || '(missing)'}" at ${url}`);
  return response.json();
}
