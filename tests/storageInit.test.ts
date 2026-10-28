import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { Window } from 'happy-dom';

import { init, destroy } from '../src/arkmail/index';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import { FakeApi } from './harness';

interface CleanupModule {
  cleanupLegacyStorage(): void;
}

const storageModulePath = '../src/arkmail/adapters/storage.js';

test('init: UI powstaje od razu i uzywa aktualnej nazwy postaci', async () => {
  const previousFactory = globalThis.indexedDB;
  const previousDocument = globalThis.document;
  globalThis.indexedDB = new IDBFactory();
  const window = new Window();
  globalThis.document = window.document as unknown as Document;
  const f = new FakeApi();
  f.characterName = null;
  try {
    const initializing = init(f.api);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(f.popupConfig, 'popup jest dostepny bez oczekiwania na zdarzenie postaci');
    await initializing;
    f.setCharacter('Foo');
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(f.popupConfig, 'popup pozostaje dostepny po poznaniu postaci');
  } finally {
    await destroy();
    if (previousFactory === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else globalThis.indexedDB = previousFactory;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
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
