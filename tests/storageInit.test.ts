import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

import { init, destroy } from '../src/arkmail/index';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import type { ArchiveLetter } from '../src/arkmail/core/archive';
import { FakeApi } from './harness';

interface CleanupModule {
  cleanupLegacyStorage(): void;
}

const storageModulePath = '../src/arkmail/adapters/storage.js';

test('init: UI i magazyn czekaja na nazwe postaci', async () => {
  const previousFactory = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  const f = new FakeApi();
  try {
    const initializing = init(f.api);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.popupConfig, null, 'popup nie moze powstac przed gmcp.char.info');

    f.fireEvent('gmcp.char.info', { name: 'Foo' });
    await initializing;
    assert.ok(f.popupConfig, 'popup powstaje po otrzymaniu nazwy postaci');
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
  }
});

test('init: migracja Archiwum zapisuje dane i znacznik raz oraz wykonuje sie jednokrotnie', async () => {
  const previousFactory = globalThis.indexedDB;
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  const key = 'arkmail.foo.archiwum';
  const versionKey = 'arkmail.foo.wersja-archiwum';
  const damaged: ArchiveLetter = {
    id: 'stary-identyfikator',
    box: 'odebrane',
    number: 1,
    party: 'Foo Pn, 2 III 2026, 01:02:03',
    subject: 'Wiadomosc',
    forwarded: false,
    dateRaw: null,
    sortKey: '0000-00-00 00:00:00',
    read: false,
    body: ['zachowana tresc'],
  };

  try {
    const seed = new IndexedDbStorageDriver(factory);
    await seed.put(key, JSON.stringify([damaged]));
    await seed.close();

    const firstApi = new FakeApi();
    const firstInit = init(firstApi.api);
    firstApi.fireEvent('gmcp.char.info', { name: 'Foo' });
    await firstInit;
    await destroy();

    const afterFirst = new IndexedDbStorageDriver(factory);
    const firstValues = await afterFirst.loadAll();
    await afterFirst.close();
    assert.equal(firstValues[versionKey], '1');
    const migrated = JSON.parse(firstValues[key]) as ArchiveLetter[];
    assert.equal(migrated[0].party, 'Foo');
    assert.equal(migrated[0].dateRaw, 'Pn, 2 III 2026, 01:02:03');
    assert.deepEqual(migrated[0].body, ['zachowana tresc']);

    const damagedAgain = new IndexedDbStorageDriver(factory);
    await damagedAgain.put(key, JSON.stringify([damaged]));
    await damagedAgain.close();
    const secondApi = new FakeApi();
    const secondInit = init(secondApi.api);
    secondApi.fireEvent('gmcp.char.info', { name: 'Foo' });
    await secondInit;
    await destroy();

    const afterSecond = new IndexedDbStorageDriver(factory);
    const secondValues = await afterSecond.loadAll();
    await afterSecond.close();
    assert.equal(secondValues[versionKey], '1');
    assert.deepEqual(JSON.parse(secondValues[key]), [damaged], 'znacznik blokuje drugi przebieg');
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
  }
});

test('sprzatanie: usuwa dawne klucze wtyczki i zachowuje obce dane', async () => {
  const { cleanupLegacyStorage } = (await import(storageModulePath)) as CleanupModule;
  const values = new Map<string, string>([
    ['arkmail._unknown.archiwum', '[]'],
    ['arkmail.foo.archiwum', '[]'],
    ['obca.wartosc', 'zostaje'],
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const localStorage = {
    length: 0,
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
  Object.defineProperty(localStorage, 'length', {
    get: () => values.size,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
  try {
    cleanupLegacyStorage();
    assert.deepEqual([...values.keys()], ['obca.wartosc']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
