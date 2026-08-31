export const SAVE_DATABASE = 'black-souls-sillytavern';
export const SAVE_SCHEMA = 'black-souls-st-save-v2';
export const SAVE_SLOT_COUNT = 16;

const DATABASE_VERSION = 2;
const STORES = Object.freeze({ SAVES: 'saves', METADATA: 'metadata', SETTINGS: 'settings' });

export class SaveStore {
  constructor({ runtimeVersion = 'dev', dataVersion = 'black-souls-normalized-data-v1' } = {}) {
    this.runtimeVersion = runtimeVersion;
    this.dataVersion = dataVersion;
  }

  async save(slot, state, metadata = {}) {
    const safeSlot = validateSlot(slot);
    const savedAt = new Date().toISOString();
    const display = makeDisplayMetadata(safeSlot, state, savedAt, metadata);
    const record = {
      slot: safeSlot,
      schema: SAVE_SCHEMA,
      gameVersion: this.runtimeVersion,
      dataVersion: this.dataVersion,
      savedAt,
      metadata: display,
      state,
    };
    const database = await openDatabase().catch(() => null);
    if (!database) {
      memorySaves.set(safeSlot, record);
      memoryMetadata.set(safeSlot, display);
      return display;
    }
    const transaction = database.transaction([STORES.SAVES, STORES.METADATA], 'readwrite');
    transaction.objectStore(STORES.SAVES).put(record);
    transaction.objectStore(STORES.METADATA).put(display);
    await transactionDone(transaction);
    return display;
  }

  async load(slot) {
    const safeSlot = validateSlot(slot);
    const database = await openDatabase().catch(() => null);
    const record = database ? await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).get(safeSlot)) : memorySaves.get(safeSlot);
    if (!record) return null;
    if (![SAVE_SCHEMA, 'black-souls-st-save-v1'].includes(record.schema)) throw new Error(`Unsupported save schema: ${record.schema}`);
    return structuredClone(record.state);
  }

  async has(slot) {
    const safeSlot = validateSlot(slot);
    const database = await openDatabase().catch(() => null);
    return database ? Boolean(await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).getKey(safeSlot))) : memorySaves.has(safeSlot);
  }

  async any() { return (await this.list()).some((entry) => !entry.empty); }

  async list() {
    const database = await openDatabase().catch(() => null);
    const records = database
      ? await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).getAll())
      : [...memorySaves.values()];
    const bySlot = new Map(records.map((record) => [Number(record.slot), record]));
    return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
      const slot = index + 1;
      const record = bySlot.get(slot);
      if (!record) return { slot, empty: true };
      return { ...(record.metadata ?? makeDisplayMetadata(slot, record.state, record.savedAt)), slot, empty: false, schema: record.schema };
    });
  }

  async latestSlot() {
    const records = (await this.list()).filter((entry) => !entry.empty);
    return records.sort((a, b) => Date.parse(b.savedAt ?? 0) - Date.parse(a.savedAt ?? 0))[0]?.slot ?? 1;
  }

  async export(slot) {
    const safeSlot = validateSlot(slot);
    const database = await openDatabase().catch(() => null);
    const record = database ? await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).get(safeSlot)) : memorySaves.get(safeSlot);
    if (!record) throw new Error(`Save slot ${safeSlot} is empty.`);
    return JSON.stringify({ format: 'black-souls-browser-save-export-v1', exportedAt: new Date().toISOString(), record }, null, 2);
  }

  async import(serialized, targetSlot = null) {
    const payload = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (payload?.format !== 'black-souls-browser-save-export-v1' || !payload.record?.state) throw new Error('Unsupported BLACK SOULS save export.');
    const slot = validateSlot(targetSlot ?? payload.record.slot);
    return this.save(slot, structuredClone(payload.record.state), payload.record.metadata ?? {});
  }

  async setting(key, value) {
    const database = await openDatabase().catch(() => null);
    if (arguments.length === 1) {
      if (!database) return memorySettings.get(String(key));
      return (await request(database.transaction(STORES.SETTINGS).objectStore(STORES.SETTINGS).get(String(key))))?.value;
    }
    const record = { key: String(key), value };
    if (!database) { memorySettings.set(String(key), value); return value; }
    await request(database.transaction(STORES.SETTINGS, 'readwrite').objectStore(STORES.SETTINGS).put(record));
    return value;
  }
}

let databasePromise;
const memorySaves = new Map();
const memoryMetadata = new Map();
const memorySettings = new Map();

function openDatabase() {
  if (!globalThis.indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const opening = globalThis.indexedDB.open(SAVE_DATABASE, DATABASE_VERSION);
      opening.onupgradeneeded = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains(STORES.SAVES)) database.createObjectStore(STORES.SAVES, { keyPath: 'slot' });
        if (!database.objectStoreNames.contains(STORES.METADATA)) database.createObjectStore(STORES.METADATA, { keyPath: 'slot' });
        if (!database.objectStoreNames.contains(STORES.SETTINGS)) database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(new Error('Save database upgrade is blocked by another BLACK SOULS tab.'));
    });
  }
  return databasePromise;
}

function makeDisplayMetadata(slot, state = {}, savedAt = new Date().toISOString(), overrides = {}) {
  const actorId = state.party?.members?.[0];
  const actor = state.actors?.[actorId] ?? {};
  return {
    slot,
    playerName: normalizeText(overrides.playerName ?? actor.name ?? ''),
    level: Number(overrides.level ?? actor.level ?? 1),
    playtimeSeconds: Number(overrides.playtimeSeconds ?? state.system?.playtimeSeconds ?? state.playtimeSeconds ?? 0),
    location: normalizeText(overrides.location ?? state.mapName ?? `Map ${String(state.mapId ?? 0).padStart(3, '0')}`),
    mapId: Number(state.mapId ?? 0),
    x: Number(state.x ?? 0),
    y: Number(state.y ?? 0),
    partyCharacters: (state.party?.members ?? []).map((id) => {
      const member = state.actors?.[id] ?? {};
      return { actorId: id, characterName: member.characterName ?? '', characterIndex: Number(member.characterIndex ?? 0) };
    }),
    savedAt,
  };
}

function validateSlot(value) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_SLOT_COUNT) throw new RangeError(`Save slot must be between 1 and ${SAVE_SLOT_COUNT}.`);
  return slot;
}

function normalizeText(value) { return String(value ?? '').normalize('NFC'); }

function request(value) {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Save transaction was aborted.'));
  });
}
