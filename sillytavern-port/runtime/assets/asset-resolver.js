import { PrefetchManager, PREFETCH_PRIORITY } from '../streaming/prefetch-manager.js';

const LFS_SIGNATURE = 'version https://git-lfs.github.com/spec/v1';

export class AssetError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = 'AssetError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export class AssetResolver {
  constructor({ manifest, runtimeBaseUrl, repository, fetchImpl = (...args) => fetch(...args), onDiagnostic = () => {}, streaming = null }) {
    this.manifest = manifest;
    this.runtimeBaseUrl = new URL(runtimeBaseUrl);
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.onDiagnostic = onDiagnostic;
    this.entries = new Map((manifest.assets ?? []).map((entry) => [normalKey(entry.path), entry]));
    this.byBase = new Map();
    for (const entry of manifest.assets ?? []) {
      const key = normalKey(stripExtension(entry.path));
      if (!this.byBase.has(key)) this.byBase.set(key, entry);
    }
    this.streaming = streaming ?? new PrefetchManager({ version: 'standalone', assetVersion: repository?.ref ?? 'test', fetchImpl, cacheStorage: null, onDiagnostic });
    this.ownsStreaming = !streaming;
    this.imageInflight = new Map();
    this.audioUrlCache = new Map();
    this.assetReports = new Map();
    this.objectUrls = new Set();
    this.stats = { requests: 0, cacheHits: 0, loaded: 0, decoded: 0, failed: 0, lfsPointersRejected: 0, sources: {}, lastError: null, lastLoaded: null, lastDecodeError: null };
  }

  entry(path) {
    return this.entries.get(normalKey(path)) ?? this.byBase.get(normalKey(stripExtension(path))) ?? null;
  }

  candidates(path) {
    const entry = this.entry(path);
    const requested = entry?.path ?? path;
    const urls = [];
    if (entry?.deliveryPath) {
      urls.push({ source: 'runtime-bundle', url: new URL(encodePath(entry.deliveryPath), this.runtimeBaseUrl).href });
    }
    if (this.repository?.developmentBaseUrl) {
      urls.push({ source: 'development-local', url: new URL(encodePath(requested), this.repository.developmentBaseUrl).href });
    }
    if (this.repository?.owner && this.repository?.name && this.repository?.ref) {
      const base = `https://media.githubusercontent.com/media/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.name)}/${encodeURIComponent(this.repository.ref)}/`;
      urls.push({ source: 'github-media', url: new URL(encodePath(requested), base).href });
      const redirectBase = `https://github.com/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.name)}/raw/${encodeURIComponent(this.repository.ref)}/`;
      urls.push({ source: 'github-raw-redirect', url: new URL(encodePath(requested), redirectBase).href });
    }
    if (!entry?.lfs && !entry?.deliveryPath) {
      urls.unshift({ source: 'runtime-repository', url: new URL(encodePath(`../../${requested}`), this.runtimeBaseUrl).href });
    }
    return dedupe(urls);
  }

  async binary(path, { required = true, kind, priority = PREFETCH_PRIORITY.CRITICAL, purpose = 'runtime' } = {}) {
    const key = normalKey(path);
    if (this.streaming.hasResource(`asset:${key}`)) {
      this.stats.cacheHits += 1;
    }
    try { return await this.fetchBinary(path, { required, kind, priority, purpose }); }
    catch (error) {
      this.stats.failed += 1;
      this.stats.lastError = { path, error: error.message, code: error.code ?? 'ASSET_UNAVAILABLE' };
      if (!required) return null;
      if (error instanceof AssetError && error.code === 'ASSET_UNAVAILABLE') throw error;
      throw new AssetError('ASSET_UNAVAILABLE', `Could not load required asset: ${path}`, { path, cause: error.message, attempts: error.attempts ?? [] });
    }
  }

  async fetchBinary(path, { kind, priority, purpose }) {
    this.stats.requests += 1;
    const entry = this.entry(path);
    const resource = await this.streaming.fetchBytes(`asset:${normalKey(path)}`, this.candidates(path), {
      priority, kind: kind ?? assetKind(path), purpose, retries: 1,
      validate: (bytes) => {
        const pointer = parseLfsPointer(bytes);
        if (pointer) {
          this.stats.lfsPointersRejected += 1;
          throw new AssetError('LFS_POINTER_RECEIVED', `Asset source returned a Git LFS pointer instead of ${path}`, { pointer });
        }
        validateMagic(bytes, entry?.extension ?? extension(path), kind);
      },
    });
    const result = { ...resource, magicBytes: hexPrefix(resource.bytes), lfsPointer: false, entry };
    this.stats.loaded += 1;
    this.stats.sources[result.source] = (this.stats.sources[result.source] ?? 0) + 1;
    this.stats.lastLoaded = { path, source: result.source, bytes: result.bytes.byteLength, url: result.url };
    const report = { path, originalRepoPath: entry?.path ?? path, ...result, bytes: result.bytes.byteLength, stage: 'ready', decodeSuccess: null };
    delete report.entry;
    this.assetReports.set(normalKey(path), report);
    this.onDiagnostic({ type: 'asset-loaded', ...report });
    return result;
  }

  async image(path, { required = true, priority = PREFETCH_PRIORITY.CRITICAL, purpose = 'runtime' } = {}) {
    const key = normalKey(path);
    const cached = this.streaming.getDecoded(`image:${key}`);
    if (cached) { this.stats.cacheHits += 1; return cached; }
    if (!this.imageInflight.has(key)) this.imageInflight.set(key, this.decodeImage(path, required, priority, purpose));
    try { return await this.imageInflight.get(key); } finally { this.imageInflight.delete(key); }
  }

  async decodeImage(path, required, priority, purpose) {
    const asset = await this.binary(path, { required, kind: 'image', priority, purpose });
    if (!asset) return null;
    const began = globalThis.performance?.now?.() ?? Date.now();
    const blob = new Blob([asset.bytes], { type: asset.contentType || mimeFor(path) });
    const url = URL.createObjectURL(blob);
    this.objectUrls.add(url);
    const image = new Image();
    image.src = url;
    try {
      if (image.decode) await image.decode();
      else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const report = {
        ...(this.assetReports.get(normalKey(path)) ?? {}),
        path,
        originalRepoPath: asset.entry?.path ?? path,
        resolvedRuntimeUrl: asset.finalUrl || asset.url,
        source: asset.source,
        status: asset.status,
        contentType: asset.contentType,
        contentLength: asset.contentLength || String(asset.bytes.byteLength),
        bytes: asset.bytes.byteLength,
        magicBytes: asset.magicBytes,
        lfsPointer: false,
        decodedWidth: image.naturalWidth || image.width,
        decodedHeight: image.naturalHeight || image.height,
        decodeSuccess: true,
        stage: 'decoded',
      };
      this.assetReports.set(normalKey(path), report);
      this.stats.decoded += 1;
      const decodeMs = (globalThis.performance?.now?.() ?? Date.now()) - began;
      this.streaming.recordDecode(decodeMs);
      this.streaming.setDecoded(`image:${normalKey(path)}`, image, Math.max(1, (image.naturalWidth || image.width) * (image.naturalHeight || image.height) * 4));
      this.onDiagnostic({ type: 'asset-decoded', ...report });
      return image;
    } catch (cause) {
      const diagnostics = { path, source: asset.source, url: asset.url, cause: String(cause), decodeSuccess: false, stage: 'decode' };
      this.assetReports.set(normalKey(path), { ...(this.assetReports.get(normalKey(path)) ?? {}), ...diagnostics });
      this.stats.lastDecodeError = diagnostics;
      this.onDiagnostic({ type: 'asset-decode-failed', ...diagnostics });
      throw new AssetError('IMAGE_DECODE_FAILED', `Browser could not decode ${path}`, diagnostics);
    }
  }

  async audioUrl(path, { required = true } = {}) {
    const key = normalKey(path);
    if (this.audioUrlCache.has(key)) return this.audioUrlCache.get(key);
    const asset = await this.binary(path, { required, kind: 'audio' });
    if (!asset) return null;
    const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.contentType || mimeFor(path) }));
    this.objectUrls.add(url);
    this.audioUrlCache.set(key, url);
    return url;
  }

  prefetch(path, { priority = PREFETCH_PRIORITY.NORMAL, purpose = 'prefetch', optional = true } = {}) {
    const kind = assetKind(path);
    if (kind === 'image') return this.image(path, { required: !optional, priority, purpose });
    return this.binary(path, { required: !optional, kind, priority, purpose });
  }

  diagnostics() {
    return { ...this.stats, imageInflight: this.imageInflight.size, audioUrls: this.audioUrlCache.size, manifestAssets: this.entries.size };
  }

  assetDiagnostics(path) { return structuredClone(this.assetReports.get(normalKey(path)) ?? null); }

  destroy() {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.imageInflight.clear();
    this.audioUrlCache.clear();
    this.assetReports.clear();
    if (this.ownsStreaming) this.streaming.destroy();
  }
}

export function parseLfsPointer(bytes) {
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  if (!text.startsWith(LFS_SIGNATURE)) return null;
  return {
    oid: /oid sha256:([0-9a-f]{64})/i.exec(text)?.[1] ?? null,
    size: Number(/size (\d+)/.exec(text)?.[1] ?? 0),
  };
}

export function validateMagic(bytes, ext = '', kind) {
  const normalized = String(ext).toLowerCase().replace(/^\./, '');
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  const ascii = (start, length) => new TextDecoder().decode(bytes.subarray(start, start + length));
  let valid = true;
  if (normalized === 'png') valid = starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  else if (normalized === 'jpg' || normalized === 'jpeg') valid = starts(0xff, 0xd8, 0xff);
  else if (normalized === 'ogg') valid = ascii(0, 4) === 'OggS';
  else if (normalized === 'wav') valid = ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
  else if (normalized === 'mp3') valid = ascii(0, 3) === 'ID3' || starts(0xff, 0xfb) || starts(0xff, 0xf3) || starts(0xff, 0xf2);
  if (!valid) throw new AssetError('INVALID_ASSET_BYTES', `Invalid ${normalized || kind || 'asset'} signature; refusing to pass bytes to the browser decoder`, { extension: normalized, byteLength: bytes.length });
}

function encodePath(path) { return String(path).split('/').filter((part) => part !== '').map(encodeURIComponent).join('/'); }
function normalKey(path) { return String(path).replaceAll('\\', '/').replace(/^\.\//, '').toLocaleLowerCase(); }
function extension(path) { return /\.([^.\/]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''; }
function stripExtension(path) { return String(path).replace(/\.[^.\/]+$/, ''); }
function dedupe(items) { const seen = new Set(); return items.filter((item) => !seen.has(item.url) && seen.add(item.url)); }
function mimeFor(path) {
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg' })[extension(path)] ?? 'application/octet-stream';
}
function hexPrefix(bytes, length = 12) { return [...bytes.subarray(0, length)].map((value) => value.toString(16).padStart(2, '0')).join(' '); }
function assetKind(path) { return /\.(?:png|jpe?g)$/i.test(path) ? 'image' : /\.(?:ogg|wav|mp3)$/i.test(path) ? 'audio' : 'binary'; }
