import { AssetResolver } from '../assets/asset-resolver.js';
import { PrefetchManager, PREFETCH_PRIORITY } from '../streaming/prefetch-manager.js';

export class DataLoader {
  constructor(dataBaseUrl, runtimeBaseUrl, assetConfig, progress = () => {}, onDiagnostic = () => {}, streamingConfig = {}) {
    this.dataBaseUrl = dataBaseUrl;
    this.runtimeBaseUrl = runtimeBaseUrl;
    this.assetConfig = assetConfig;
    this.progress = progress;
    this.onDiagnostic = onDiagnostic;
    this.prefetchManifest = streamingConfig.manifest ?? 'prefetch-manifest.json';
    this.jsonCache = new Map();
    this.prefetch = new PrefetchManager({
      version: streamingConfig.runtimeVersion ?? 'dev',
      dataVersion: streamingConfig.dataVersion ?? 'black-souls-normalized-data-v1',
      assetVersion: assetConfig.repository?.ref ?? 'dev',
      onDiagnostic,
      developerMode: streamingConfig.developerMode,
      maxConcurrent: streamingConfig.maxConcurrent ?? 8,
      reservedCritical: streamingConfig.reservedCritical ?? 2,
      memoryBudgetBytes: streamingConfig.memoryBudgetBytes,
      decodedBudgetBytes: streamingConfig.decodedBudgetBytes,
      timeouts: streamingConfig.timeouts,
      persistentEnabled: !assetConfig.repository?.developmentBaseUrl && !isLocalUrl(dataBaseUrl),
    });
    this.prefetch.bindLoader(this);
  }

  async initialize() {
    this.progress('Loading game data...', 0.15);
    const [system, tilesets, actors, classes, skills, items, weapons, armors, enemies, troops, states, commonEvents, animations, assetManifest, prefetchManifest, inventoryDependencies, combatDependencies, uiDependencies] = await Promise.all([
      this.json('database/System.json'),
      this.json('database/Tilesets.json'),
      this.json('database/Actors.json'),
      this.json('database/Classes.json'),
      this.json('database/Skills.json'),
      this.json('database/Items.json'),
      this.json('database/Weapons.json'),
      this.json('database/Armors.json'),
      this.json('database/Enemies.json'),
      this.json('database/Troops.json'),
      this.json('database/States.json'),
      this.json('database/CommonEvents.json'),
      this.json('database/Animations.json'),
      this.json(this.assetConfig.manifest, this.runtimeBaseUrl),
      this.json(this.prefetchManifest),
      this.json('dependencies/inventory-dependencies.json'),
      this.json('dependencies/combat-dependencies.json'),
      this.json('dependencies/ui-dependencies.json'),
    ]);
    this.assets = new AssetResolver({
      manifest: assetManifest,
      runtimeBaseUrl: this.runtimeBaseUrl,
      repository: this.assetConfig.repository,
      onDiagnostic: this.onDiagnostic,
      streaming: this.prefetch,
    });
    this.prefetch.setManifest(prefetchManifest);
    this.progress('Game data ready', 0.45);
    return { system, tilesets, actors, classes, skills, items, weapons, armors, enemies, troops, states, commonEvents, animations, assetManifest, prefetchManifest, inventoryDependencies, combatDependencies, uiDependencies };
  }

  map(id, options = {}) {
    return this.json(`maps/${String(id).padStart(3, '0')}.json`, this.dataBaseUrl, { ...options, key: `map:${id}` });
  }

  async json(path, base = this.dataBaseUrl, { key, priority = PREFETCH_PRIORITY.CRITICAL, purpose = 'runtime' } = {}) {
    const url = new URL(path, base).href;
    const cacheKey = key ?? `json:${url}`;
    const parsed = this.prefetch.getParsed(cacheKey);
    if (parsed) return parsed;
    if (this.jsonCache.has(cacheKey)) return this.jsonCache.get(cacheKey);
    const pending = this.prefetch.fetchBytes(cacheKey, dataCandidates(url), {
      priority, kind: 'json', purpose,
      validate: (bytes, meta) => {
        if (meta.contentType && !/\bjson\b/i.test(meta.contentType)) throw new Error(`Required game data has invalid Content-Type "${meta.contentType}" at ${meta.url}`);
        JSON.parse(new TextDecoder().decode(bytes));
      },
    }).then((resource) => {
      const text = new TextDecoder().decode(resource.bytes);
      const value = JSON.parse(text);
      this.prefetch.setParsed(cacheKey, value, resource.bytes.byteLength);
      return value;
    });
    this.jsonCache.set(cacheKey, pending);
    try { return await pending; } finally { this.jsonCache.delete(cacheKey); }
  }

  image(path, { optional = false } = {}) { return this.assets.image(path, { required: !optional }); }
  audioUrl(path, { optional = false } = {}) { return this.assets.audioUrl(path, { required: !optional }); }
  prefetchAsset(path, options = {}) { return this.assets.prefetch(path, options); }
  resolveEntry(path) { return this.assets.entry(path); }
  assetDiagnostics(path) { return this.assets?.assetDiagnostics(path) ?? null; }
  diagnostics() { return { assets: this.assets?.diagnostics() ?? { state: 'not-initialized' }, streaming: this.prefetch.getStatus() }; }
  destroy() { this.assets?.destroy(); this.prefetch.destroy(); }
}

function dataCandidates(url) {
  const primary = new URL(url);
  const candidates = [{ source: 'runtime-selected', url: primary.href }];
  const cdnMatch = /^(?:gh\/)?([^/]+)\/([^/@]+)@([^/]+)\/(.*)$/.exec(primary.pathname.replace(/^\//, ''));
  if ((primary.hostname === 'cdn.jsdelivr.net' || primary.hostname === 'testingcf.jsdelivr.net') && cdnMatch) {
    const [, owner, repository, ref, path] = cdnMatch;
    const alternate = primary.hostname === 'cdn.jsdelivr.net' ? 'testingcf.jsdelivr.net' : 'cdn.jsdelivr.net';
    candidates.push({ source: 'runtime-cdn-fallback', url: `https://${alternate}/gh/${owner}/${repository}@${ref}/${path}` });
    candidates.push({ source: 'runtime-raw-fallback', url: `https://raw.githubusercontent.com/${owner}/${repository}/${ref}/${path}` });
  }
  if (primary.hostname === 'raw.githubusercontent.com') {
    const [, owner, repository, ref, ...rest] = primary.pathname.split('/');
    const path = rest.join('/');
    candidates.push({ source: 'runtime-jsdelivr-fallback', url: `https://cdn.jsdelivr.net/gh/${owner}/${repository}@${ref}/${path}` });
    candidates.push({ source: 'runtime-testingcf-fallback', url: `https://testingcf.jsdelivr.net/gh/${owner}/${repository}@${ref}/${path}` });
  }
  return candidates;
}

function isLocalUrl(url) { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname); }
