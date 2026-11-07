import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

interface Driver {
  loadAll(): Promise<Record<string, string>>;
  loadAllLetters?(): Promise<Record<string, Record<string, string>>>;
  putLetters?(character: string, values: Readonly<Record<string, string>>): Promise<void>;
  deleteLetters?(character: string, ids: readonly string[]): Promise<void>;
  clearLetters?(character: string): Promise<void>;
  clearMailData?(character: string, keys: readonly string[]): Promise<void>;
  put(key: string, value: string): Promise<void>;
  putMany?(values: Readonly<Record<string, string>>): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}

interface Storage {
  get(key: string): string | null;
  getLetters(character: string): Record<string, string>;
  setLetters(character: string, letters: readonly { id: string }[]): void;
  clearLetters(character: string): void;
  clearMailData(character: string, keys: readonly string[]): Promise<void>;
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

test('blad zapisu listu zachowuje rekord, a flush ponawia zapis', async () => {
  const saved: Record<string, string> = {};
  let attempts = 0;
  const errors: string[] = [];
  const driver: Driver = {
    async loadAll() { return {}; },
    async loadAllLetters() { return { Foo: { ...saved } }; },
    async put() {},
    async putLetters(_character, values) {
      attempts++;
      if (attempts === 1) throw new Error('Pierwszy zapis odrzucony.');
      Object.assign(saved, values);
    },
    async deleteLetters() {},
    async delete() {},
    async clearLetters() {},
    async clearMailData() {},
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {
    errors.push(storageModule.STORAGE_WRITE_ERROR);
  });
  storage.setLetters('Foo', [{ id: 'list-1' }]);

  await storage.flush();

  assert.equal(attempts, 2, 'flush ma ponowic zachowany zapis po pierwszej awarii');
  assert.equal(saved['list-1'], JSON.stringify({ id: 'list-1' }));
  assert.deepEqual(errors, [storageModule.STORAGE_WRITE_ERROR]);
});

test('niezmieniony list z oczekujacym zapisem jest ponawiany bez zmiany tresci', async () => {
  let attempts = 0;
  const saved: Record<string, string> = {};
  const driver: Driver = {
    async loadAll() { return {}; },
    async loadAllLetters() { return {}; },
    async put() {},
    async putLetters(_character, values) {
      attempts++;
      if (attempts <= 2) throw new Error('Zapis nadal odrzucony.');
      Object.assign(saved, values);
    },
    async deleteLetters() {},
    async delete() {},
    async clearLetters() {},
    async clearMailData() {},
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});
  const letters = [{ id: 'list-1' }];
  storage.setLetters('Foo', letters);
  await storage.flush();
  assert.equal(attempts, 2);

  storage.setLetters('Foo', letters);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(attempts, 3, 'niezmieniona tresc nie moze blokowac ponowienia');
  await storage.flush();
  assert.equal(saved['list-1'], JSON.stringify({ id: 'list-1' }));
});

test('starszy zapis nie usuwa ani nie nadpisuje nowszej wersji listu', async () => {
  const saved: Record<string, string> = {};
  const written: string[] = [];
  let release!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const driver: Driver = {
    async loadAll() { return {}; },
    async loadAllLetters() { return {}; },
    async put() {},
    async putLetters(_character, values) {
      markStarted();
      await gate;
      Object.assign(saved, values);
      written.push(values['list-1']);
    },
    async deleteLetters() {},
    async delete() {},
    async clearLetters() {},
    async clearMailData() {},
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});
  storage.setLetters('Foo', [{ id: 'list-1', value: 'stara' } as { id: string }]);
  await started;
  storage.setLetters('Foo', [{ id: 'list-1', value: 'nowa' } as { id: string }]);
  release();
  await storage.flush();

  assert.deepEqual(written, [JSON.stringify({ id: 'list-1', value: 'stara' }), JSON.stringify({ id: 'list-1', value: 'nowa' })]);
  assert.equal(saved['list-1'], JSON.stringify({ id: 'list-1', value: 'nowa' }));
});

test('czyszczenie po bledzie zapisu nie wskrzesza listu, a identyczny stan jest no-op', async () => {
  let attempts = 0;
  let cleared = 0;
  const driver: Driver = {
    async loadAll() { return {}; },
    async loadAllLetters() { return {}; },
    async put() {},
    async putLetters() {
      attempts++;
      throw new Error('Zapis odrzucony.');
    },
    async deleteLetters() {},
    async delete() {},
    async clearLetters() { cleared++; },
    async clearMailData() {},
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});
  const letters = [{ id: 'list-1' }];
  storage.setLetters('Foo', letters);
  await storage.flush();
  const attemptsBeforeClear = attempts;
  storage.clearLetters('Foo');
  await storage.flush();
  storage.setLetters('Foo', []);
  await storage.flush();

  assert.equal(cleared, 1);
  assert.equal(attempts, attemptsBeforeClear, 'po czyszczeniu nie wolno ponawiac usunietego listu');
  assert.deepEqual(storage.getLetters('Foo'), {});
});

test('atomowe czyszczenie po bledzie zapisu nie wskrzesza listu ani indeksu', async () => {
  let attempts = 0;
  let cleared = 0;
  const driver: Driver = {
    async loadAll() { return { 'arkmail.Foo.indeks': '{}' }; },
    async loadAllLetters() { return {}; },
    async put() {},
    async putLetters() {
      attempts++;
      throw new Error('Zapis odrzucony.');
    },
    async deleteLetters() {},
    async delete() {},
    async clearLetters() {},
    async clearMailData() { cleared++; },
    async close() {},
  };
  const storage = await storageModule.WriteThroughStorage.open(driver, () => {});
  storage.setLetters('Foo', [{ id: 'list-1' }]);
  await storage.flush();
  const attemptsBeforeClear = attempts;

  await storage.clearMailData('Foo', ['arkmail.Foo.indeks']);
  storage.setLetters('Foo', []);
  await storage.flush();

  assert.equal(cleared, 1);
  assert.equal(attempts, attemptsBeforeClear, 'atomowe czyszczenie usuwa oczekujacy zapis');
  assert.deepEqual(storage.getLetters('Foo'), {});
  assert.equal(storage.get('arkmail.Foo.indeks'), null);
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
