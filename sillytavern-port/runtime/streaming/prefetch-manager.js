export const PREFETCH_PRIORITY = Object.freeze({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3, IDLE: 4 });

const DEFAULT_TIMEOUTS = Object.freeze({ json: 10_000, image: 18_000, audio: 30_000, binary: 18_000 });

export class PrefetchManager {
  constructor({
    version = 'dev', dataVersion = 'dev', assetVersion = 'dev', fetchImpl = (...args) => fetch(...args),
    cacheStorage = globalThis.caches, maxConcurrent = 8, reservedCritical = 2,
    memoryBudgetBytes = 64 * 1024 * 1024, decodedBudgetBytes = 160 * 1024 * 1024,
    now = () => globalThis.performance?.now?.() ?? Date.now(), backoffMs = 120,
    onDiagnostic = () => {}, timeouts = {}, developerMode = false,
    persistentEnabled = true,
  } = {}) {
    this.versionKey = `${version}:${dataVersion}:${assetVersion}`;
    this.cacheName = `black-souls-stream-v1-${safeKey(this.versionKey)}`;
    this.fetchImpl = fetchImpl;
    this.cacheStorage = cacheStorage;
    this.maxConcurrent = maxConcurrent;
    this.reservedCritical = Math.min(reservedCritical, Math.max(0, maxConcurrent - 1));
    this.now = now;
    this.backoffMs = backoffMs;
    this.onDiagnostic = onDiagnostic;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
    this.developerMode = developerMode;
    this.persistentEnabled = persistentEnabled;
    this.memory = new WeightedLru(memoryBudgetBytes);
    this.decoded = new WeightedLru(decodedBudgetBytes);
    this.parsed = new WeightedLru(24 * 1024 * 1024);
    this.inflight = new Map();
    this.queue = [];
    this.active = new Map();
    this.sequence = 0;
    this.mapWarmups = new Map();
    this.transition = idleTransition();
    this.transitionTimers = [];
    this.metrics = {
      requests: 0, prefetchRequests: 0, prefetchHits: 0, prefetchMisses: 0,
      memoryCacheHits: 0, decodedCacheHits: 0, parsedCacheHits: 0, persistentCacheHits: 0,
      networkFetchCount: 0, bytesFetched: 0, duplicateRequestsAvoided: 0,
      retries: 0, fallbacks: 0, timeouts: 0, failures: 0,
      fetchMs: 0, decodeMs: 0, transitions: [],
    };
  }

  bindLoader(loader) { this.loader = loader; }
  setManifest(manifest) { this.manifest = manifest; }
  setContextProvider(provider) { this.contextProvider = provider; }

  async fetchBytes(key, candidates, {
    priority = PREFETCH_PRIORITY.CRITICAL, kind = 'binary', purpose = 'runtime', retries = 1,
    timeoutMs = this.timeouts[kind] ?? this.timeouts.binary, validate = () => {}, persistent = this.persistentEnabled,
  } = {}) {
    const logicalKey = this.versioned(key);
    this.metrics.requests += 1;
    if (purpose === 'prefetch') this.metrics.prefetchRequests += 1;
    const cached = this.memory.get(logicalKey);
    if (cached) {
      this.metrics.memoryCacheHits += 1;
      return cached;
    }
    if (this.inflight.has(logicalKey)) {
      this.metrics.duplicateRequestsAvoided += 1;
      this.bump(logicalKey, priority);
      return this.inflight.get(logicalKey);
    }
    const pending = this.schedule(logicalKey, priority, async () => {
      const result = await this.loadCandidates(logicalKey, normalizeCandidates(candidates), { kind, retries, timeoutMs, validate, persistent, priority });
      this.memory.set(logicalKey, result, result.bytes.byteLength);
      return result;
    });
    this.inflight.set(logicalKey, pending);
    try { return await pending; } finally { this.inflight.delete(logicalKey); }
  }

  async loadCandidates(logicalKey, candidates, options) {
    let lastError;
    const failures = [];
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      const attempts = candidateIndex === 0 ? Math.max(1, options.retries + 1) : 1;
      for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
        const attempt = { key: logicalKey, url: candidate.url, source: candidate.source, candidateIndex, attemptIndex, kind: options.kind };
        try {
          const persistent = options.persistent ? await this.persistentMatch(candidate.url, options.validate, attempt) : null;
          if (persistent) return persistent;
          const began = this.now();
          this.metrics.networkFetchCount += 1;
          const response = await this.fetchWithTimeout(candidate.url, options.timeoutMs);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const meta = responseMeta(response, candidate);
          options.validate(bytes, meta);
          const elapsed = this.now() - began;
          this.metrics.bytesFetched += bytes.byteLength;
          this.metrics.fetchMs += elapsed;
          if (candidateIndex > 0) this.metrics.fallbacks += 1;
          const result = { bytes, ...meta, elapsedMs: elapsed };
          if (options.persistent) await this.persistentPut(candidate.url, result);
          this.emit({ type: 'stream-fetch-ready', ...attempt, status: result.status, bytes: bytes.byteLength, elapsedMs: elapsed });
          return result;
        } catch (error) {
          lastError = error;
          failures.push({ ...attempt, error: error.message, code: error.code ?? 'FETCH_FAILED', diagnostics: error.diagnostics ?? null });
          if (error?.code === 'FETCH_TIMEOUT') this.metrics.timeouts += 1;
          const retrying = candidateIndex === 0 && attemptIndex + 1 < attempts;
          if (retrying) {
            this.metrics.retries += 1;
            await delay(this.backoffMs * (attemptIndex + 1));
          }
          this.emit({ type: 'stream-fetch-failed', ...attempt, retrying, error: error.message, code: error.code ?? 'FETCH_FAILED' });
        }
      }
    }
    this.metrics.failures += 1;
    if (lastError && !lastError.attempts) lastError.attempts = failures;
    throw lastError ?? new Error(`No fetch candidates for ${logicalKey}`);
  }

  async fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const error = new Error(`Fetch timed out after ${timeoutMs} ms: ${url}`);
        error.code = 'FETCH_TIMEOUT';
        reject(error);
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([
        this.fetchImpl(url, { mode: 'cors', cache: 'default', signal: controller.signal }),
        timeout,
      ]);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        error.code = 'HTTP_ERROR';
        throw error;
      }
      return response;
    } finally { clearTimeout(timer); }
  }

  schedule(key, priority, run) {
    let resolveTask; let rejectTask;
    const promise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
    this.queue.push({ key, priority, run, resolve: resolveTask, reject: rejectTask, queuedAt: this.now(), sequence: ++this.sequence });
    this.pump();
    return promise;
  }

  pump() {
    queueMicrotask(() => {
      while (this.active.size < this.maxConcurrent && this.queue.length) {
        this.queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
        const highIndex = this.queue.findIndex((item) => item.priority <= PREFETCH_PRIORITY.HIGH);
        const speculativeLimit = this.maxConcurrent - this.reservedCritical;
        const index = highIndex >= 0 ? highIndex : this.active.size < speculativeLimit ? 0 : -1;
        if (index < 0) break;
        const task = this.queue.splice(index, 1)[0];
        task.startedAt = this.now();
        this.active.set(task.key, task);
        Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
          this.active.delete(task.key);
          this.pump();
        });
      }
    });
  }

  bump(key, priority) {
    const task = this.queue.find((item) => item.key === key);
    if (task) task.priority = Math.min(task.priority, priority);
  }

  cancelLowPriority() {
    const cancelled = this.queue.filter((task) => task.priority >= PREFETCH_PRIORITY.LOW);
    this.queue = this.queue.filter((task) => task.priority < PREFETCH_PRIORITY.LOW);
    for (const task of cancelled) {
      const error = new Error(`Cancelled speculative prefetch: ${task.key}`); error.name = 'AbortError'; task.reject(error);
    }
    return cancelled.length;
  }

  getDecoded(key) {
    const value = this.decoded.get(this.versioned(key));
    if (value) this.metrics.decodedCacheHits += 1;
    return value;
  }

  setDecoded(key, value, bytes) { this.decoded.set(this.versioned(key), value, bytes); }
  hasResource(key) { return this.memory.entries.has(this.versioned(key)); }
  recordDecode(milliseconds) { this.metrics.decodeMs += milliseconds; }
  getParsed(key) {
    const value = this.parsed.get(this.versioned(key));
    if (value) this.metrics.parsedCacheHits += 1;
    return value;
  }
  setParsed(key, value, bytes = 1) { this.parsed.set(this.versioned(key), value, bytes); }

  async prefetchAssets(paths, { priority = PREFETCH_PRIORITY.NORMAL, reason = 'assets' } = {}) {
    if (!this.loader) return [];
    return Promise.allSettled(unique(paths).map((path) => this.loader.prefetchAsset(path, { priority, purpose: 'prefetch', reason })));
  }

  async prefetchMap(mapId, { priority = PREFETCH_PRIORITY.HIGH, criticalOnly = false, reason = 'map', awaitOptional = false, onCriticalProgress = null } = {}) {
    const dependency = this.manifest?.maps?.[mapId];
    if (!this.loader || !dependency) return null;
    const began = this.now();
    const status = this.mapWarmups.get(mapId) ?? { mapId, ready: false, priority, requestedAt: began, criticalReady: 0, criticalTotal: dependency.criticalAssets.length + 1 };
    status.priority = Math.min(status.priority, priority);
    this.mapWarmups.set(mapId, status);
    const labels = [dependency.dataPath ?? `Map ${mapId}`, ...dependency.criticalAssets];
    const track = (label, promise) => promise.then(
      (value) => { onCriticalProgress?.({ label, ready: true }); return value; },
      (error) => { onCriticalProgress?.({ label, ready: false, error: error.message }); throw error; },
    );
    const mapPromise = track(labels[0], this.loader.map(mapId, { priority, purpose: 'prefetch' }));
    const critical = dependency.criticalAssets.map((path) => track(path, this.loader.prefetchAsset(path, { priority, purpose: 'prefetch', reason })));
    const optionalPaths = criticalOnly ? [] : (dependency.warmAssets ?? dependency.assets).filter((path) => !dependency.criticalAssets.includes(path));
    const optionalPriority = Math.min(PREFETCH_PRIORITY.IDLE, priority + 1);
    const optional = optionalPaths.map((path) => this.loader.prefetchAsset(path, { priority: optionalPriority, purpose: 'prefetch', reason, optional: true }));
    const criticalResults = await Promise.allSettled([mapPromise, ...critical]);
    status.criticalReady = criticalResults.filter((item) => item.status === 'fulfilled').length;
    status.ready = criticalResults.every((item) => item.status === 'fulfilled');
    status.readyAt = this.now(); status.elapsedMs = status.readyAt - began;
    status.failures = criticalResults.flatMap((item, index) => item.status === 'rejected' ? [{ path: labels[index], error: item.reason?.message ?? String(item.reason) }] : []);
    if (awaitOptional) await Promise.allSettled(optional);
    else void Promise.allSettled(optional);
    this.emit({ type: 'map-prefetch-ready', mapId, reason, priority, ready: status.ready, elapsedMs: status.elapsedMs, failures: status.failures });
    return status;
  }

  prefetchLikelyDestinations(mapId, { x = 0, y = 0 } = {}) {
    const signature = `${mapId}:${Math.floor(x / 4)}:${Math.floor(y / 4)}`;
    if (this.lastPrediction?.signature === signature) return this.lastPrediction.result;
    const dependency = this.manifest?.maps?.[mapId];
    const distance = new Map();
    for (const point of dependency?.transferPoints ?? []) distance.set(point.mapId, Math.min(distance.get(point.mapId) ?? Infinity, Math.abs(point.x - x) + Math.abs(point.y - y)));
    const candidates = [...(this.manifest?.transferGraph?.[mapId] ?? [])].sort((left, right) => (distance.get(left) ?? Infinity) - (distance.get(right) ?? Infinity));
    const direct = candidates.slice(0, 2);
    const deferred = candidates.slice(2, 6);
    const second = unique(direct.flatMap((id) => this.manifest?.transferGraph?.[id] ?? [])).filter((id) => !candidates.includes(id) && id !== Number(mapId)).slice(0, 6);
    for (const id of direct) void this.prefetchMap(id, { priority: PREFETCH_PRIORITY.HIGH, reason: `map-${mapId}-direct` });
    for (const id of second) void this.prefetchMap(id, { priority: PREFETCH_PRIORITY.NORMAL, reason: `map-${mapId}-second-hop` });
    for (const id of deferred) void this.prefetchMap(id, { priority: PREFETCH_PRIORITY.LOW, reason: `map-${mapId}-branch` });
    const result = { direct, second, deferred };
    this.lastPrediction = { signature, result };
    return result;
  }

  prefetchRoute(routeId) {
    const levels = this.manifest?.routes?.[routeId] ?? [];
    for (const level of levels) {
      const priority = level.depth === 0 ? PREFETCH_PRIORITY.HIGH : level.depth === 1 ? PREFETCH_PRIORITY.NORMAL : PREFETCH_PRIORITY.LOW;
      for (const mapId of level.mapIds ?? []) void this.prefetchMap(mapId, { priority, reason: `route-${routeId}-depth-${level.depth}` });
    }
    return levels;
  }

  scanUpcoming(list, start = 0, { limit = this.manifest?.policy?.eventLookahead ?? 48, commonDepth = 2 } = {}) {
    const actions = [];
    for (const command of (list ?? []).slice(start, start + limit)) {
      const parameters = command?.parameters ?? [];
      if (command?.code === 201 && parameters[0] === 0) actions.push({ type: 'map', mapId: Number(parameters[1]), priority: PREFETCH_PRIORITY.HIGH });
      if (command?.code === 212) actions.push(...(this.manifest?.animations?.[Number(parameters[1])]?.assets ?? []).map((path) => ({ type: 'asset', path, priority: PREFETCH_PRIORITY.HIGH })));
      if (command?.code === 231 && parameters[1]) actions.push({ type: 'asset', path: this.resolveAsset(`Graphics/Pictures/${parameters[1]}`), priority: PREFETCH_PRIORITY.HIGH });
      if (command?.code === 241) actions.push({ type: 'asset', path: this.resolveAudio('BGM', parameters[0]), priority: PREFETCH_PRIORITY.HIGH });
      if (command?.code === 245) actions.push({ type: 'asset', path: this.resolveAudio('BGS', parameters[0]), priority: PREFETCH_PRIORITY.HIGH });
      if (command?.code === 249) actions.push({ type: 'asset', path: this.resolveAudio('ME', parameters[0]), priority: PREFETCH_PRIORITY.NORMAL });
      if (command?.code === 250) actions.push({ type: 'asset', path: this.resolveAudio('SE', parameters[0]), priority: PREFETCH_PRIORITY.NORMAL });
      if (command?.code === 301 && parameters[0] === 0) actions.push(...(this.manifest?.battles?.[Number(parameters[1])]?.assets ?? []).map((path) => ({ type: 'asset', path, priority: PREFETCH_PRIORITY.HIGH })));
      if (command?.code === 322) {
        if (parameters[1]) actions.push({ type: 'asset', path: this.resolveAsset(`Graphics/Characters/${parameters[1]}`), priority: PREFETCH_PRIORITY.HIGH });
        if (parameters[3]) actions.push({ type: 'asset', path: this.resolveAsset(`Graphics/Faces/${parameters[3]}`), priority: PREFETCH_PRIORITY.NORMAL });
      }
      if (command?.code === 205) for (const move of parameters[1]?.list ?? []) if (move.code === 41 && move.parameters?.[0]) actions.push({ type: 'asset', path: this.resolveAsset(`Graphics/Characters/${move.parameters[0]}`), priority: PREFETCH_PRIORITY.HIGH });
      if (command?.code === 117) actions.push(...this.commonActions(Number(parameters[0]), commonDepth));
    }
    const deduped = dedupeActions(actions.filter((action) => action.path || action.mapId));
    for (const action of deduped) {
      if (action.type === 'map') void this.prefetchMap(action.mapId, { priority: action.priority, reason: 'event-lookahead' });
      else void this.prefetchAssets([action.path], { priority: action.priority, reason: 'event-lookahead' });
    }
    return deduped;
  }

  commonActions(id, depth, seen = new Set()) {
    if (!id || depth < 0 || seen.has(id)) return [];
    seen.add(id);
    const dependency = this.manifest?.commonEvents?.[id];
    if (!dependency) return [];
    return [
      ...(dependency.assets ?? []).map((path) => ({ type: 'asset', path, priority: PREFETCH_PRIORITY.NORMAL })),
      ...(dependency.transfers ?? []).map((mapId) => ({ type: 'map', mapId, priority: PREFETCH_PRIORITY.NORMAL })),
      ...(dependency.commonEvents ?? []).flatMap((next) => this.commonActions(next, depth - 1, seen)),
    ];
  }

  async prepareMap(mapId, { x = 0, y = 0 } = {}) {
    const dependency = this.manifest?.maps?.[mapId];
    const viewportAssets = unique((dependency?.eventAssets ?? [])
      .filter((event) => Math.abs(event.x - x) <= 12 && Math.abs(event.y - y) <= 9)
      .map((event) => event.path));
    this.beginTransition(mapId, unique([dependency?.dataPath ?? `Map ${mapId}`, ...(dependency?.criticalAssets ?? []), ...viewportAssets]));
    const mark = ({ label, ready }) => {
      if (this.transition.targetMapId !== mapId || this.transition.state !== 'loading') return;
      if (ready) this.transition.criticalReady += 1;
      this.transition.waitingFor = this.transition.waitingFor.filter((path) => path !== label);
    };
    const before = this.mapWarmups.get(mapId)?.ready === true;
    if (before) this.metrics.prefetchHits += 1; else this.metrics.prefetchMisses += 1;
    const status = await this.prefetchMap(mapId, { priority: PREFETCH_PRIORITY.CRITICAL, criticalOnly: false, reason: 'transition-barrier', onCriticalProgress: mark });
    const viewportResults = await Promise.allSettled(viewportAssets.map((path) => this.loader.prefetchAsset(path, { priority: PREFETCH_PRIORITY.CRITICAL, purpose: 'prefetch', reason: 'initial-viewport', optional: true }).then(
      (value) => { mark({ label: path, ready: true }); return value; },
      (error) => { mark({ label: path, ready: false, error: error.message }); throw error; },
    )));
    this.transition.criticalReady = (status?.criticalReady ?? 0) + viewportResults.filter((item) => item.status === 'fulfilled').length;
    this.transition.criticalTotal = (status?.criticalTotal ?? 0) + viewportAssets.length;
    this.transition.waitingFor = unique([
      ...(status?.failures ?? []).map((failure) => failure.path),
      ...viewportResults.flatMap((item, index) => item.status === 'rejected' ? [viewportAssets[index]] : []),
    ]);
    this.transition.prefetchHit = before;
    return status;
  }

  markMapVisible(mapId, position = {}) {
    const elapsedMs = this.now() - this.transition.startedAt;
    const record = { mapId, elapsedMs, prefetchHit: this.transition.prefetchHit, at: new Date().toISOString() };
    this.metrics.transitions.push(record);
    this.metrics.transitions = this.metrics.transitions.slice(-100);
    this.clearTransitionTimers();
    this.transition = { ...this.transition, state: 'visible', elapsedMs, completedAt: this.now() };
    this.pinMap(mapId);
    this.emit({ type: 'map-transition-visible', ...record });
    queueMicrotask(() => this.prefetchLikelyDestinations(mapId, position));
    return record;
  }

  failTransition(mapId, error) {
    this.clearTransitionTimers();
    this.transition = { ...this.transition, state: 'failed', mapId, elapsedMs: this.now() - this.transition.startedAt, error: error.message };
  }

  beginTransition(mapId, criticalAssets) {
    this.clearTransitionTimers();
    this.transition = { state: 'loading', targetMapId: mapId, startedAt: this.now(), criticalReady: 0, criticalTotal: criticalAssets.length, waitingFor: [...criticalAssets], prefetchHit: false, warning: null };
    this.transitionTimers.push(setTimeout(() => this.transitionWarning('warning'), 3_000));
    this.transitionTimers.push(setTimeout(() => this.transitionWarning('serious'), 10_000));
  }

  transitionWarning(level) {
    if (this.transition.state !== 'loading') return;
    this.transition.warning = level;
    const entry = { type: 'TRANSITION_STALL', level, ...this.transitionSnapshot(), context: this.contextProvider?.() ?? null };
    this.emit(entry);
    if (this.developerMode) console.warn('[BLACK SOULS]', entry);
  }

  pinMap(mapId) {
    this.memory.unpinAll(); this.decoded.unpinAll(); this.parsed.unpinAll();
    const dependency = this.manifest?.maps?.[mapId];
    if (!dependency) return;
    this.parsed.pin(this.versioned(`map:${mapId}`));
    for (const path of dependency.criticalAssets ?? []) {
      this.memory.pin(this.versioned(`asset:${normalKey(path)}`));
      this.decoded.pin(this.versioned(`image:${normalKey(path)}`));
    }
  }

  transitionSnapshot() {
    const elapsedMs = this.transition.state === 'loading' && this.transition.startedAt ? this.now() - this.transition.startedAt : this.transition.elapsedMs ?? 0;
    return { ...this.transition, elapsedMs };
  }

  getStatus() {
    const transitions = this.metrics.transitions.map((item) => item.elapsedMs).sort((a, b) => a - b);
    const active = [...this.active.values()].map((task) => ({ key: task.key, priority: priorityName(task.priority), ageMs: this.now() - task.startedAt }));
    const queued = this.queue.map((task) => ({ key: task.key, priority: priorityName(task.priority), ageMs: this.now() - task.queuedAt }));
    return {
      versionKey: this.versionKey, cacheName: this.cacheName,
      policy: { maxConcurrent: this.maxConcurrent, reservedCritical: this.reservedCritical, lookahead: this.manifest?.policy?.eventLookahead ?? 48, graphDepth: 2, timeouts: { ...this.timeouts } },
      transition: this.transitionSnapshot(),
      pendingCriticalFetches: active.filter((item) => item.priority === 'CRITICAL').length + queued.filter((item) => item.priority === 'CRITICAL').length,
      oldestRequestAge: Math.max(0, ...active.map((item) => item.ageMs), ...queued.map((item) => item.ageMs)),
      active, queued,
      warmMaps: [...this.mapWarmups.values()].map(({ mapId, ready, priority, elapsedMs, failures }) => ({ mapId, ready, priority: priorityName(priority), elapsedMs, failures })),
      memory: this.memory.status(), decoded: this.decoded.status(), parsed: this.parsed.status(),
      metrics: {
        ...this.metrics,
        averageTransitionMs: average(transitions),
        p95TransitionMs: percentile(transitions, 0.95),
        prefetchHitRate: ratio(this.metrics.prefetchHits, this.metrics.prefetchHits + this.metrics.prefetchMisses),
      },
    };
  }

  destroy() {
    this.cancelLowPriority(); this.clearTransitionTimers();
    this.memory.clear(); this.decoded.clear(); this.parsed.clear(); this.inflight.clear();
  }

  resolveAsset(base) { return this.loader?.resolveEntry(base)?.path ?? null; }
  resolveAudio(folder, descriptor) { return descriptor?.name ? this.resolveAsset(`Audio/${folder}/${descriptor.name}`) : null; }
  versioned(key) { return `${this.versionKey}:${key}`; }
  emit(entry) { try { this.onDiagnostic({ at: new Date().toISOString(), ...entry }); } catch {} }
  clearTransitionTimers() { for (const timer of this.transitionTimers) clearTimeout(timer); this.transitionTimers = []; }

  async persistentMatch(url, validate, attempt) {
    if (!this.cacheStorage?.open) return null;
    try {
      const cache = await this.cacheStorage.open(this.cacheName);
      const response = await cache.match(url);
      if (!response) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const meta = responseMeta(response, { url, source: 'persistent-cache' });
      try { validate(bytes, meta); } catch (error) { await cache.delete?.(url); throw error; }
      this.metrics.persistentCacheHits += 1;
      this.emit({ type: 'persistent-cache-hit', ...attempt, bytes: bytes.byteLength });
      return { bytes, ...meta, elapsedMs: 0 };
    } catch (error) {
      this.emit({ type: 'persistent-cache-read-failed', url, error: error.message });
      return null;
    }
  }

  async persistentPut(url, result) {
    if (!this.cacheStorage?.open || typeof Response === 'undefined') return;
    try {
      const cache = await this.cacheStorage.open(this.cacheName);
      await cache.put(url, new Response(result.bytes.slice(), { status: 200, headers: { 'content-type': result.contentType || 'application/octet-stream', 'x-black-souls-source': result.source || '' } }));
    } catch (error) { this.emit({ type: 'persistent-cache-write-failed', url, error: error.message }); }
  }
}

export class WeightedLru {
  constructor(budgetBytes) { this.budgetBytes = budgetBytes; this.bytes = 0; this.entries = new Map(); }
  get(key) {
    const entry = this.entries.get(key); if (!entry) return null;
    this.entries.delete(key); this.entries.set(key, entry); entry.lastAccess = Date.now(); return entry.value;
  }
  set(key, value, bytes = 1) {
    const previous = this.entries.get(key); if (previous) this.bytes -= previous.bytes;
    this.entries.delete(key); this.entries.set(key, { value, bytes: Math.max(1, Number(bytes) || 1), pinned: previous?.pinned ?? false, lastAccess: Date.now() });
    this.bytes += Math.max(1, Number(bytes) || 1); this.evict(); return value;
  }
  pin(key) { const entry = this.entries.get(key); if (entry) entry.pinned = true; }
  unpinAll() { for (const entry of this.entries.values()) entry.pinned = false; this.evict(); }
  evict() { for (const [key, entry] of this.entries) { if (this.bytes <= this.budgetBytes) break; if (entry.pinned) continue; this.entries.delete(key); this.bytes -= entry.bytes; } }
  clear() { this.entries.clear(); this.bytes = 0; }
  status() { return { entries: this.entries.size, bytes: this.bytes, budgetBytes: this.budgetBytes, pinned: [...this.entries.values()].filter((entry) => entry.pinned).length }; }
}

function normalizeCandidates(candidates) { return (candidates ?? []).map((candidate, index) => typeof candidate === 'string' ? { url: candidate, source: index ? `fallback-${index}` : 'primary' } : candidate); }
function responseMeta(response, candidate) { return { url: candidate.url, finalUrl: response.url || candidate.url, source: candidate.source, status: response.status, contentType: response.headers?.get?.('content-type') || '', contentLength: response.headers?.get?.('content-length') || '', redirected: Boolean(response.redirected) }; }
function safeKey(value) { return String(value).replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120); }
function normalKey(path) { return String(path).replaceAll('\\', '/').replace(/^\.\//, '').toLocaleLowerCase(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function priorityName(value) { return Object.entries(PREFETCH_PRIORITY).find(([, priority]) => priority === value)?.[0] ?? String(value); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function percentile(values, percentileValue) { return values.length ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))] : 0; }
function ratio(left, total) { return total ? left / total : 0; }
function idleTransition() { return { state: 'idle', targetMapId: null, startedAt: 0, criticalReady: 0, criticalTotal: 0, waitingFor: [], prefetchHit: false, warning: null }; }
function dedupeActions(actions) {
  const result = new Map();
  for (const action of actions) {
    const key = action.type === 'map' ? `map:${action.mapId}` : `asset:${action.path}`;
    const previous = result.get(key); if (!previous || action.priority < previous.priority) result.set(key, action);
  }
  return [...result.values()];
}
