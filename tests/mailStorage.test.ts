import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

interface LetterStorage {
  getLetters(): ArchiveLetter[];
  setLetters(letters: readonly ArchiveLetter[]): void;
  getJSON<T>(key: string): T | null;
  setJSON(key: string, value: unknown): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

interface StorageModule {
  openCharStorage(character: string, onError: () => void, factory?: IDBFactory): Promise<LetterStorage>;
}

interface DriverModule {
  IndexedDbStorageDriver: new (factory?: IDBFactory, databaseName?: string) => {
    loadAllLetters(): Promise<Record<string, Record<string, string>>>;
    close(): Promise<void>;
  };
}

const storageModulePath = '../src/arkmail/adapters/storage.js';
const driverModulePath = '../src/arkmail/adapters/storageDriver.js';
let storageModule: StorageModule;
let driverModule: DriverModule;
test.before(async () => {
  storageModule = (await import(storageModulePath)) as StorageModule;
  driverModule = (await import(driverModulePath)) as DriverModule;
});

function letter(index: number, subject = `List ${index}`): ArchiveLetter {
  return {
    id: `id-${index}`,
    box: 'odebrane',
    number: index,
    party: 'Foo',
    subject,
    forwarded: false,
    dateRaw: 'Pn, 2 III 2026, 01:02:03',
    sortKey: '2026-03-02 01:02:03',
    read: false,
    body: [`Tresc ${index}`],
  };
}

function countingFactory(real: IDBFactory) {
  const counter = { puts: 0, bytes: 0 };
  const factory = {
    open(name: string, version?: number): IDBOpenDBRequest {
      const request = version === undefined ? real.open(name) : real.open(name, version);
      request.addEventListener('success', () => {
        const database = request.result;
        const transaction = database.transaction.bind(database);
        database.transaction = ((stores: string | string[], mode?: IDBTransactionMode) => {
          const current = transaction(stores, mode);
          if (mode === 'readwrite' && (stores === 'letters' || (Array.isArray(stores) && stores.includes('letters')))) {
            const objectStore = current.objectStore.bind(current);
            current.objectStore = ((name: string) => {
              const store = objectStore(name);
              if (name === 'letters') {
                const put = store.put.bind(store);
                store.put = ((value: unknown, key?: IDBValidKey) => {
                  counter.puts++;
                  counter.bytes += JSON.stringify(value).length;
                  return key === undefined ? put(value) : put(value, key);
                }) as IDBObjectStore['put'];
              }
              return store;
            }) as IDBTransaction['objectStore'];
          }
          return current;
        }) as IDBDatabase['transaction'];
      });
      return request;
    },
  } as IDBFactory;
  return { factory, counter };
}

test('magazyn zapisuje osobno kazdy list, rozdziela postacie i usuwa dawny obszar', async () => {
  const factory = new IDBFactory();
  const legacy = factory.open('arkmail', 1);
  legacy.onupgradeneeded = () => {
    legacy.result.createObjectStore('dane');
  };
  await new Promise<void>((resolve, reject) => {
    legacy.onsuccess = () => resolve();
    legacy.onerror = () => reject(legacy.error);
  });
  legacy.result.close();

  const foo = await storageModule.openCharStorage('Foo', () => {}, factory);
  foo.setJSON('powiadomienia', false);
  foo.setLetters([letter(1), letter(2)]);
  await foo.close();

  const driver = new driverModule.IndexedDbStorageDriver(factory);
  const saved = await driver.loadAllLetters();
  assert.deepEqual(Object.keys(saved.foo).sort(), ['id-1', 'id-2']);
  assert.equal(JSON.parse(saved.foo['id-1']).subject, 'List 1');
  await driver.close();

  const bar = await storageModule.openCharStorage('Bar', () => {}, factory);
  assert.deepEqual(bar.getLetters(), []);
  await bar.close();
  const reopened = await storageModule.openCharStorage('Foo', () => {}, factory);
  assert.equal(reopened.getLetters().length, 2);
  assert.equal(reopened.getJSON('powiadomienia'), false);
  await reopened.close();

  const opening = factory.open('arkmail');
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  assert.equal(database.objectStoreNames.contains('dane'), false);
  assert.equal(database.objectStoreNames.contains('letters'), true);
  assert.equal(database.objectStoreNames.contains('state'), true);
  database.close();
});

test('10 000 listow: kolejna zmiana zapisuje tylko jeden rekord', async () => {
  const real = new IDBFactory();
  const { factory, counter } = countingFactory(real);
  const storage = await storageModule.openCharStorage('Foo', () => {}, factory);
  const letters = Array.from({ length: 10_000 }, (_, index) => letter(index));
  storage.setLetters(letters);
  await storage.flush();
  assert.equal(counter.puts, 10_000);

  counter.puts = 0;
  counter.bytes = 0;
  const changed = [...letters];
  changed[5000] = { ...changed[5000], read: true };
  storage.setLetters(changed);
  await storage.flush();
  assert.equal(counter.puts, 1);
  assert.ok(counter.bytes < 1000, `Przeslano ${counter.bytes} bajtow zamiast jednego rekordu`);
  await storage.close();
});

test('kolejka laczy kolejne zmiany tego samego listu i zachowuje ostatnia wartosc', async () => {
  const real = new IDBFactory();
  const { factory, counter } = countingFactory(real);
  const storage = await storageModule.openCharStorage('Foo', () => {}, factory);
  storage.setLetters([letter(1)]);
  await storage.flush();
  counter.puts = 0;

  storage.setLetters([{ ...letter(1), subject: 'Druga wersja' }]);
  storage.setLetters([{ ...letter(1), subject: 'Ostatnia wersja' }]);
  await storage.flush();
  assert.equal(counter.puts, 1);
  await storage.close();

  const reopened = await storageModule.openCharStorage('Foo', () => {}, real);
  assert.equal(reopened.getLetters()[0].subject, 'Ostatnia wersja');
  await reopened.close();
});
