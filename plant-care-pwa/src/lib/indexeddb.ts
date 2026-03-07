type CacheRecord = {
  key: string;
  payload: unknown;
  savedAt: number;
};

export type OfflineMutationRecord = {
  id?: number;
  method: string;
  path: string;
  body?: string;
  createdAt: number;
  dedupeKey?: string;
  attempts: number;
};

const DB_NAME = 'plant-care-pwa-db';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const MUTATION_QUEUE_STORE = 'mutation_queue';

let openDbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (openDbPromise) {
    return openDbPromise;
  }

  openDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(MUTATION_QUEUE_STORE)) {
        const queueStore = db.createObjectStore(MUTATION_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('dedupeKey', 'dedupeKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });

  return openDbPromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  return openDb().then((db) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return executor(store);
  });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function cacheSet(key: string, payload: unknown): Promise<void> {
  await runTransaction(CACHE_STORE, 'readwrite', async (store) => {
    await requestToPromise(store.put({ key, payload, savedAt: Date.now() } satisfies CacheRecord));
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  return runTransaction(CACHE_STORE, 'readonly', async (store) => {
    const result = await requestToPromise<CacheRecord | undefined>(store.get(key));
    return (result?.payload as T | undefined) ?? null;
  });
}

export async function upsertQueuedMutation(record: OfflineMutationRecord): Promise<void> {
  await runTransaction(MUTATION_QUEUE_STORE, 'readwrite', async (store) => {
    if (record.dedupeKey) {
      const index = store.index('dedupeKey');
      const existing = await requestToPromise<OfflineMutationRecord[]>(index.getAll(record.dedupeKey));
      if (existing.length > 0) {
        const last = existing.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
        await requestToPromise(
          store.put({
            ...last,
            ...record,
            id: last.id,
            attempts: last.attempts
          } satisfies OfflineMutationRecord)
        );
        return;
      }
    }
    await requestToPromise(
      store.add({
        ...record,
        attempts: record.attempts ?? 0
      } satisfies OfflineMutationRecord)
    );
  });
}

export async function getQueuedMutations(): Promise<OfflineMutationRecord[]> {
  return runTransaction(MUTATION_QUEUE_STORE, 'readonly', async (store) => {
    const records = await requestToPromise<OfflineMutationRecord[]>(store.getAll());
    return records.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  });
}

export async function deleteQueuedMutation(id: number): Promise<void> {
  await runTransaction(MUTATION_QUEUE_STORE, 'readwrite', async (store) => {
    await requestToPromise(store.delete(id));
  });
}

export async function mutationQueueCount(): Promise<number> {
  return runTransaction(MUTATION_QUEUE_STORE, 'readonly', async (store) => requestToPromise<number>(store.count()));
}

