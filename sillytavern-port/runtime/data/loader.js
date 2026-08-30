import { AssetResolver } from '../assets/asset-resolver.js';

export class DataLoader {
  constructor(dataBaseUrl, runtimeBaseUrl, assetConfig, progress = () => {}, onDiagnostic = () => {}) {
    this.dataBaseUrl = dataBaseUrl;
    this.runtimeBaseUrl = runtimeBaseUrl;
    this.assetConfig = assetConfig;
    this.progress = progress;
    this.onDiagnostic = onDiagnostic;
    this.jsonCache = new Map();
  }

  async initialize() {
    this.progress('Loading game data...', 0.15);
    const [system, tilesets, actors, commonEvents, animations, assetManifest] = await Promise.all([
      this.json('database/System.json'),
      this.json('database/Tilesets.json'),
      this.json('database/Actors.json'),
      this.json('database/CommonEvents.json'),
      this.json('database/Animations.json'),
      this.json(this.assetConfig.manifest, this.runtimeBaseUrl),
    ]);
    this.assets = new AssetResolver({
      manifest: assetManifest,
      runtimeBaseUrl: this.runtimeBaseUrl,
      repository: this.assetConfig.repository,
      onDiagnostic: this.onDiagnostic,
    });
    this.progress('Game data ready', 0.45);
    return { system, tilesets, actors, commonEvents, animations, assetManifest };
  }

  map(id) {
    return this.json(`maps/${String(id).padStart(3, '0')}.json`);
  }

  async json(path, base = this.dataBaseUrl) {
    const url = new URL(path, base).href;
    if (!this.jsonCache.has(url)) {
      this.jsonCache.set(url, fetch(url).then((response) => {
        if (!response.ok) throw new Error(`Required game data failed: HTTP ${response.status} ${response.statusText} at ${url}`);
        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) throw new Error(`Required game data has invalid Content-Type "${contentType || '(missing)'}" at ${url}`);
        return response.json();
      }));
    }
    return this.jsonCache.get(url);
  }

  image(path, { optional = false } = {}) { return this.assets.image(path, { required: !optional }); }
  audioUrl(path, { optional = false } = {}) { return this.assets.audioUrl(path, { required: !optional }); }
  resolveEntry(path) { return this.assets.entry(path); }
  diagnostics() { return this.assets?.diagnostics() ?? { state: 'not-initialized' }; }
  destroy() { this.assets?.destroy(); }
}
