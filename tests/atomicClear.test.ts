import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { CharStorage } from '../src/arkmail/adapters/storage';
import {
  IndexedDbStorageDriver,
  MemoryStorageDriver,
  type LettersByCharacter,
} from '../src/arkmail/adapters/storageDriver';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

const INDEX_KEY = 'indeks';
const GAPS_KEY = 'luki-archiwum';

interface AtomicClearStorage {
  clearMailData(keys: readonly string[]): Promise<void>;
}

function atomic(storage: CharStorage): AtomicClearStorage {
  return storage as unknown as AtomicClearStorage;
}

function letter(id: string): ArchiveLetter {
  return {
    id,
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject: 'Temat',
    forwarded: false,
    dateRaw: 'Pn, 20 IX 1999, 01:02:03',
    sortKey: '1999-09-20 01:02:03',
    read: false,
    body: [],
  };
}

test('czyszczenie usuwa listy, indeks i luki atomowo oraz zachowuje ustawienia po restarcie', async () => {
  const factory = new IDBFactory();
  const seed = new IndexedDbStorageDriver(factory);
  await seed.loadAll();
  await seed.putLetters('foo', { one: JSON.stringify(letter('one')) });
  await seed.putMany({
    'arkmail.foo.indeks': JSON.stringify({ odebrane: '1999-09-02T00:00:00Z' }),
    'arkmail.foo.luki-archiwum': JSON.stringify({ odebrane: ['1999-08-21'] }),
    'arkmail.foo.powiadomienia': JSON.stringify(false),
    'arkmail.bar.indeks': JSON.stringify({ odebrane: '1999-09-03T00:00:00Z' }),
  });
  await seed.putLetters('bar', { two: JSON.stringify(letter('two')) });
  await seed.close();

  const driver = new IndexedDbStorageDriver(factory);
  const storage = await CharStorage.open('Foo', driver, () => {});
  await atomic(storage).clearMailData([INDEX_KEY, GAPS_KEY]);
  assert.deepEqual(storage.getLetters(), []);
  assert.equal(storage.getJSON(INDEX_KEY), null);
  assert.equal(storage.getJSON(GAPS_KEY), null);
  assert.equal(storage.getJSON('powiadomienia'), false);
  await storage.close();

  const restartedDriver = new IndexedDbStorageDriver(factory);
  const restarted = await CharStorage.open('Foo', restartedDriver, () => {});
  assert.deepEqual(restarted.getLetters(), []);
  assert.equal(restarted.getJSON(INDEX_KEY), null);
  assert.equal(restarted.getJSON(GAPS_KEY), null);
  assert.equal(restarted.getJSON('powiadomienia'), false);
  await restarted.close();

  const checkDriver = new IndexedDbStorageDriver(factory);
  const allLetters: LettersByCharacter = await checkDriver.loadAllLetters();
  assert.deepEqual(Object.keys(allLetters.foo ?? {}), []);
  assert.deepEqual(Object.keys(allLetters.bar ?? {}), ['two']);
  assert.equal(await checkDriver.loadAll().then((all) => all['arkmail.bar.indeks'] !== undefined), true);
  await checkDriver.close();
});

test('blad trwalego czyszczenia pozostawia poprzedni stan w RAM i nie zglasza sukcesu', async () => {
  class FailingDriver extends MemoryStorageDriver {
    async clearMailData(): Promise<void> {
      throw new Error('czyszczenie odrzucone');
    }
  }
  const driver = new FailingDriver();
  await driver.putLetters('foo', { one: JSON.stringify(letter('one')) });
  await driver.putMany({
    'arkmail.foo.indeks': JSON.stringify({ odebrane: '1999-09-02T00:00:00Z' }),
    'arkmail.foo.luki-archiwum': JSON.stringify({ odebrane: ['1999-08-21'] }),
    'arkmail.foo.powiadomienia': JSON.stringify(false),
  });
  const storage = await CharStorage.open('Foo', driver, () => {});
  await assert.rejects(atomic(storage).clearMailData([INDEX_KEY, GAPS_KEY]), /czyszczenie odrzucone/);
  assert.equal(storage.getLetters().length, 1);
  assert.notEqual(storage.getJSON(INDEX_KEY), null);
  assert.notEqual(storage.getJSON(GAPS_KEY), null);
  assert.equal(storage.getJSON('powiadomienia'), false);
  await storage.close();
});
