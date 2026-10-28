import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

import { init, destroy } from '../src/arkmail/index';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
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
