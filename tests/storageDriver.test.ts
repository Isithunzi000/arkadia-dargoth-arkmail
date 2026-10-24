import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

interface StorageDriver {
  loadAll(): Promise<Record<string, string>>;
  put(key: string, value: string): Promise<void>;
  putMany(values: Readonly<Record<string, string>>): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}

interface StorageDriverModule {
  MemoryStorageDriver: new () => StorageDriver;
  IndexedDbStorageDriver: new (factory?: IDBFactory, databaseName?: string) => StorageDriver;
}

// Dynamiczny adres pozwala uruchomic test na starym kodzie i wykazac brak
// sterownika jako zwykla porazke testu, a nie blad kompilacji calego zestawu.
const driverModulePath = '../src/arkmail/adapters/storageDriver.js';
let drivers: StorageDriverModule;
test.before(async () => {
  drivers = (await import(driverModulePath)) as StorageDriverModule;
});

let databaseSequence = 0;

async function removeDatabase(factory: IDBFactory, name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Usuwanie testowej bazy zablokowane.'));
  });
}

test('sterownik RAM: odczyt, zapis, nadpisanie i usuniecie', async () => {
  const driver = new drivers.MemoryStorageDriver();
  await driver.put('arkmail.Foo.archiwum', '["Foo"]');
  await driver.put('arkmail.Bar.archiwum', '["Bar"]');
  await driver.put('arkmail.Foo.archiwum', '["Foo","Baz"]');
  await driver.delete('arkmail.Bar.archiwum');

  assert.deepEqual(await driver.loadAll(), {
    'arkmail.Foo.archiwum': '["Foo","Baz"]',
  });

  const snapshot = await driver.loadAll();
  snapshot['arkmail.Foo.archiwum'] = 'zmiana poza magazynem';
  assert.equal((await driver.loadAll())['arkmail.Foo.archiwum'], '["Foo","Baz"]');
});

test('IndexedDB: dane i przestrzenie kluczy przetrwaja ponowne otwarcie', async (t) => {
  const factory = new IDBFactory();
  const databaseName = `arkmail-test-${databaseSequence++}`;

  const first = new drivers.IndexedDbStorageDriver(factory, databaseName);
  await first.put('arkmail.Foo.archiwum', '["Foo"]');
  await first.put('arkmail.Bar.archiwum', '["Bar"]');
  await first.put('arkmail.Foo.indeks', '{"odebrane":"2026-10-24"}');
  await first.delete('arkmail.Bar.archiwum');
  await first.close();

  const second = new drivers.IndexedDbStorageDriver(factory, databaseName);
  t.after(async () => {
    await second.close();
    await removeDatabase(factory, databaseName);
  });
  assert.deepEqual(await second.loadAll(), {
    'arkmail.Foo.archiwum': '["Foo"]',
    'arkmail.Foo.indeks': '{"odebrane":"2026-10-24"}',
  });
});

test('sterownik RAM: zapis wsadowy zapisuje wszystkie klucze', async () => {
  const driver = new drivers.MemoryStorageDriver();
  await driver.putMany({
    'arkmail.foo.archiwum': '[]',
    'arkmail.foo.wersja-archiwum': '1',
  });

  assert.deepEqual(await driver.loadAll(), {
    'arkmail.foo.archiwum': '[]',
    'arkmail.foo.wersja-archiwum': '1',
  });
});

test('IndexedDB: zapis wsadowy uzywa jednej transakcji', async (t) => {
  const realFactory = new IDBFactory();
  const databaseName = `arkmail-test-${databaseSequence++}`;
  let writeTransactions = 0;
  const factory = {
    open(name: string, version?: number): IDBOpenDBRequest {
      const request = version === undefined ? realFactory.open(name) : realFactory.open(name, version);
      request.addEventListener('success', () => {
        const database = request.result;
        const original = database.transaction.bind(database) as (
          stores: string | string[],
          mode?: IDBTransactionMode,
        ) => IDBTransaction;
        database.transaction = ((stores: string | string[], mode?: IDBTransactionMode) => {
          if (mode === 'readwrite') writeTransactions++;
          return original(stores, mode);
        }) as IDBDatabase['transaction'];
      });
      return request;
    },
  } as IDBFactory;

  const driver = new drivers.IndexedDbStorageDriver(factory, databaseName);
  await driver.loadAll();
  writeTransactions = 0;
  await driver.putMany({
    'arkmail.foo.archiwum': '[]',
    'arkmail.foo.wersja-archiwum': '1',
  });
  assert.equal(writeTransactions, 1);
  await driver.close();

  const reopened = new drivers.IndexedDbStorageDriver(realFactory, databaseName);
  t.after(async () => {
    await reopened.close();
    await removeDatabase(realFactory, databaseName);
  });
  assert.deepEqual(await reopened.loadAll(), {
    'arkmail.foo.archiwum': '[]',
    'arkmail.foo.wersja-archiwum': '1',
  });
});

test('IndexedDB: blad otwarcia bazy jest przekazywany do wywolania', async () => {
  const factory = {
    open(): IDBOpenDBRequest {
      const request = new EventTarget() as IDBOpenDBRequest;
      Object.defineProperty(request, 'error', {
        value: new DOMException('Baza niedostepna.', 'InvalidStateError'),
      });
      queueMicrotask(() => request.onerror?.(new Event('error')));
      return request;
    },
  } as unknown as IDBFactory;
  const driver = new drivers.IndexedDbStorageDriver(factory, 'arkmail-test-open-error');

  await assert.rejects(driver.loadAll(), /Baza niedostepna/);
  await assert.rejects(driver.put('arkmail.Foo.archiwum', '[]'), /Baza niedostepna/);
  await assert.rejects(driver.delete('arkmail.Foo.archiwum'), /Baza niedostepna/);
});
