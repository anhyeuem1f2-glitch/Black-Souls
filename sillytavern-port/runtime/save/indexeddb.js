const DATABASE = 'black-souls-sillytavern';
const STORE = 'saves';

export class SaveStore {
  async save(slot, state) {
    const record = { slot, schema: 'black-souls-st-save-v1', savedAt: new Date().toISOString(), state };
    const database = await openDatabase().catch(() => null);
    if (!database) { memorySaves.set(slot, record); return; }
    await request(database.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  }

  async load(slot) {
    const database = await openDatabase().catch(() => null);
    const record = database ? await request(database.transaction(STORE).objectStore(STORE).get(slot)) : memorySaves.get(slot);
    if (!record) return null;
    if (record.schema !== 'black-souls-st-save-v1') throw new Error(`Unsupported save schema: ${record.schema}`);
    return record.state;
  }

  async has(slot) {
    const database = await openDatabase().catch(() => null);
    return database ? Boolean(await request(database.transaction(STORE).objectStore(STORE).getKey(slot))) : memorySaves.has(slot);
  }
}

let databasePromise;
const memorySaves = new Map();
function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const opening = indexedDB.open(DATABASE, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'slot' });
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
  }
  return databasePromise;
}

function request(value) {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
