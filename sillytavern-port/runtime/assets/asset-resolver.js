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
  constructor({ manifest, runtimeBaseUrl, repository, fetchImpl = (...args) => fetch(...args), onDiagnostic = () => {} }) {
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
    this.binaryCache = new Map();
    this.imageCache = new Map();
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
    if (this.repository?.developmentBaseUrl) {
      urls.push({ source: 'development-local', url: new URL(encodePath(requested), this.repository.developmentBaseUrl).href });
    }
    if (entry?.deliveryPath) {
      urls.push({ source: 'runtime-bundle', url: new URL(encodePath(entry.deliveryPath), this.runtimeBaseUrl).href });
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

  async binary(path, { required = true, kind } = {}) {
    const key = normalKey(path);
    if (this.binaryCache.has(key)) {
      this.stats.cacheHits += 1;
      return this.binaryCache.get(key);
    }
    const pending = this.fetchBinary(path, { required, kind });
    this.binaryCache.set(key, pending);
    try { return await pending; } catch (error) { this.binaryCache.delete(key); throw error; }
  }

  async fetchBinary(path, { required, kind }) {
    this.stats.requests += 1;
    const attempts = [];
    for (const candidate of this.candidates(path)) {
      const attempt = { path, ...candidate, stage: 'fetch' };
      try {
        const response = await this.fetchImpl(candidate.url, { mode: 'cors', cache: 'default' });
        attempt.status = response.status;
        attempt.contentType = response.headers.get('content-type') || '';
        attempt.contentLength = response.headers.get('content-length') || '';
        attempt.finalUrl = response.url || candidate.url;
        attempt.redirected = Boolean(response.redirected);
        if (!response.ok) throw new AssetError('HTTP_ERROR', `HTTP ${response.status} ${response.statusText}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        attempt.bytes = bytes.byteLength;
        attempt.magicBytes = hexPrefix(bytes);
        attempt.stage = 'validate';
        const pointer = parseLfsPointer(bytes);
        if (pointer) {
          this.stats.lfsPointersRejected += 1;
          throw new AssetError('LFS_POINTER_RECEIVED', `Asset source returned a Git LFS pointer instead of ${path}`, { pointer });
        }
        validateMagic(bytes, this.entry(path)?.extension ?? extension(path), kind);
        const result = {
          bytes,
          contentType: attempt.contentType,
          contentLength: attempt.contentLength,
          url: candidate.url,
          finalUrl: attempt.finalUrl,
          status: response.status,
          source: candidate.source,
          magicBytes: attempt.magicBytes,
          lfsPointer: false,
          entry: this.entry(path),
        };
        attempt.stage = 'ready';
        this.stats.loaded += 1;
        this.stats.sources[candidate.source] = (this.stats.sources[candidate.source] ?? 0) + 1;
        this.stats.lastLoaded = { path, source: candidate.source, bytes: bytes.byteLength, url: candidate.url };
        this.assetReports.set(normalKey(path), { path, originalRepoPath: this.entry(path)?.path ?? path, ...attempt, lfsPointer: false, decodeSuccess: null });
        this.onDiagnostic({ type: 'asset-loaded', ...attempt });
        return result;
      } catch (error) {
        attempt.error = error.message;
        attempt.code = error.code ?? 'FETCH_FAILED';
        attempts.push(attempt);
        this.assetReports.set(normalKey(path), { path, originalRepoPath: this.entry(path)?.path ?? path, ...attempt, decodeSuccess: false });
        this.onDiagnostic({ type: 'asset-attempt-failed', ...attempt });
      }
    }
    const error = new AssetError('ASSET_UNAVAILABLE', `Could not load ${required ? 'required' : 'optional'} asset: ${path}`, { path, attempts });
    this.stats.failed += 1;
    this.stats.lastError = error.diagnostics;
    if (!required) return null;
    throw error;
  }

  async image(path, { required = true } = {}) {
    const key = normalKey(path);
    if (!this.imageCache.has(key)) this.imageCache.set(key, this.decodeImage(path, required));
    try { return await this.imageCache.get(key); } catch (error) { this.imageCache.delete(key); throw error; }
  }

  async decodeImage(path, required) {
    const asset = await this.binary(path, { required, kind: 'image' });
    if (!asset) return null;
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
    const asset = await this.binary(path, { required, kind: 'audio' });
    if (!asset) return null;
    const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.contentType || mimeFor(path) }));
    this.objectUrls.add(url);
    return url;
  }

  diagnostics() {
    return { ...this.stats, cacheEntries: this.binaryCache.size, manifestAssets: this.entries.size };
  }

  assetDiagnostics(path) { return structuredClone(this.assetReports.get(normalKey(path)) ?? null); }

  destroy() {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.binaryCache.clear();
    this.imageCache.clear();
    this.assetReports.clear();
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
