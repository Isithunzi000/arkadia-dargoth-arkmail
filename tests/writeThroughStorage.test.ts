import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

interface Driver {
  loadAll(): Promise<Record<string, string>>;
  put(key: string, value: string): Promise<void>;
  putMany?(values: Readonly<Record<string, string>>): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}

interface Storage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  setMany(values: Readonly<Record<string, string>>): void;
  delete(key: string): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

interface StorageModule {
  STORAGE_WRITE_ERROR: string;
  MemoryStorageDriver: new () => Driver;
  WriteThroughStorage: {
    open(driver: Driver, onError: () => void): Promise<Storage>;
  };
  openWriteThroughStorage(onError: () => void, factory?: IDBFactory): Promise<Storage>;
}

const modulePath = '../src/arkmail/adapters/writeThroughStorage.js';
let storageModule: StorageModule;
test.before(async () => {
  storageModule = (await import(modulePath)) as StorageModule;
});

test('pamiec podreczna: zapis i usuniecie sa widoczne natychmiast', async () => {
  const driver = new storageModule.MemoryStorageDriver();
  await driver.put('arkmail.Foo.archiwum', '["Foo"]');
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});

  assert.equal(storage.get('arkmail.Foo.archiwum'), '["Foo"]');
  storage.set('arkmail.Foo.archiwum', '["Foo","Baz"]');
  assert.equal(storage.get('arkmail.Foo.archiwum'), '["Foo","Baz"]');
  storage.delete('arkmail.Foo.archiwum');
  assert.equal(storage.get('arkmail.Foo.archiwum'), null);
  await storage.flush();
  assert.deepEqual(await driver.loadAll(), {});
});

test('zapis wsadowy: cala zmiana jest w RAM, trwaly zapis wykonuje sie raz', async () => {
  const batches: Record<string, string>[] = [];
  const driver: Driver = {
    async loadAll() {
      return {};
    },
    async put() {},
    async putMany(values) {
      batches.push({ ...values });
    },
    async delete() {},
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});
  const batch = {
    'arkmail.foo.archiwum': '[]',
    'arkmail.foo.wersja-archiwum': '1',
  };

  storage.setMany(batch);
  batch['arkmail.foo.archiwum'] = 'zmiana poza magazynem';
  assert.equal(storage.get('arkmail.foo.archiwum'), '[]');
  assert.equal(storage.get('arkmail.foo.wersja-archiwum'), '1');
  await storage.flush();

  assert.deepEqual(batches, [{
    'arkmail.foo.archiwum': '[]',
    'arkmail.foo.wersja-archiwum': '1',
  }]);
});

test('flush czeka na wszystkie zapisy i zachowuje ich kolejnosc', async () => {
  const operations: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const driver: Driver = {
    async loadAll() {
      return {};
    },
    async put(key, value) {
      operations.push(`start:${key}:${value}`);
      if (operations.length === 1) await firstPending;
      operations.push(`end:${key}:${value}`);
    },
    async delete(key) {
      operations.push(`delete:${key}`);
    },
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});
  storage.set('arkmail.Foo.archiwum', 'pierwszy');
  storage.set('arkmail.Foo.indeks', 'drugi');
  storage.delete('arkmail.Foo.archiwum');
  const flushing = storage.flush();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(operations, ['start:arkmail.Foo.archiwum:pierwszy']);
  releaseFirst!();
  await flushing;
  assert.deepEqual(operations, [
    'start:arkmail.Foo.archiwum:pierwszy',
    'end:arkmail.Foo.archiwum:pierwszy',
    'start:arkmail.Foo.indeks:drugi',
    'end:arkmail.Foo.indeks:drugi',
    'delete:arkmail.Foo.archiwum',
  ]);
});

test('blad zapisu jest zgloszony, a kolejka moze zapisac dalsze dane', async () => {
  const saved: string[] = [];
  const errors: string[] = [];
  const driver: Driver = {
    async loadAll() {
      return {};
    },
    async put(key) {
      if (key === 'arkmail.Foo.archiwum') throw new Error('Zapis odrzucony.');
      saved.push(key);
    },
    async delete() {},
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {
    errors.push(storageModule.STORAGE_WRITE_ERROR);
  });
  storage.set('arkmail.Foo.archiwum', '[]');
  storage.set('arkmail.Foo.indeks', '{}');

  await storage.flush();
  assert.deepEqual(errors, ['Nie udalo sie zapisac danych archiwum']);
  assert.deepEqual(saved, ['arkmail.Foo.indeks']);
});

test('niedostepna IndexedDB: magazyn RAM przejmuje prace', async () => {
  const factory = {
    open(): IDBOpenDBRequest {
      const request = new EventTarget() as IDBOpenDBRequest;
      Object.defineProperty(request, 'error', {
        value: new DOMException('Tryb prywatny.', 'InvalidStateError'),
      });
      queueMicrotask(() => request.onerror?.(new Event('error')));
      return request;
    },
  } as unknown as IDBFactory;
  const errors: string[] = [];
  const storage = await storageModule.openWriteThroughStorage(() => {
    errors.push(storageModule.STORAGE_WRITE_ERROR);
  }, factory);

  storage.set('arkmail.Foo.archiwum', '["Foo"]');
  await storage.flush();
  assert.equal(storage.get('arkmail.Foo.archiwum'), '["Foo"]');
  assert.deepEqual(errors, ['Nie udalo sie zapisac danych archiwum']);
  await storage.close();
});
