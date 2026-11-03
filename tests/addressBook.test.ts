/**
 * Fala UI-2 krok 1: ksiazka adresowa jako osobne klucze magazynu.
 * Grupy reczne (contactGroups), osoby importowane (zapamietani /
 * przedstawieni) i aliasy pocztowe z gry maja swoje klucze poza
 * cache listow. Czyszczenie zapisanych danych kasuje wylacznie
 * klucze cache (indeks, luki archiwum) - ksiazka adresowa zostaje,
 * w druga strone zarzadzanie ksiazka nie tyka danych listow.
 * Imiona w testach syntetyczne (Fred, Grault, Corge).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type { CharStorage } from '../src/arkmail/adapters/storage';
import {
  GROUPS_KEY,
  PEOPLE_KEY,
  ALIASES_KEY,
  loadGroups,
  saveGroups,
  loadImportedPeople,
  saveImportedPeople,
  loadImportedAliases,
  saveImportedAliases,
} from '../src/arkmail/core/addressBook';
import { MemoryStorageDriver } from '../src/arkmail/adapters/storageDriver';

function memoryIO() {
  const map = new Map<string, string>();
  return {
    getJSON<T>(key: string): T | null {
      const raw = map.get(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJSON(key: string, value: unknown): void {
      map.set(key, JSON.stringify(value));
    },
    map,
  };
}

test('ksiazka: pusty magazyn daje puste pule', () => {
  const io = memoryIO();
  assert.deepEqual(loadGroups(io), [], 'grupy: pusta lista');
  assert.deepEqual(
    loadImportedPeople(io),
    { zapamietani: [], przedstawieni: [] },
    'osoby: obie pule puste',
  );
  assert.deepEqual(loadImportedAliases(io), [], 'aliasy: pusta lista');
});

test('ksiazka: grupy zapis/odczyt 1:1 z porzadkiem czlonkow', () => {
  const io = memoryIO();
  const groups = [
    { name: 'Gildia', members: ['Fred', 'Grault'] },
    { name: 'Patrol', members: ['Corge'] },
  ];
  saveGroups(io, groups);
  assert.ok(io.map.has(GROUPS_KEY), 'grupy pod wlasnym kluczem');
  assert.deepEqual(loadGroups(io), groups, 'odczyt 1:1');
});

test('ksiazka: osoby importowane zapis/odczyt 1:1', () => {
  const io = memoryIO();
  const people = { zapamietani: ['Fred', 'Grault'], przedstawieni: ['Corge'] };
  saveImportedPeople(io, people);
  assert.ok(io.map.has(PEOPLE_KEY), 'osoby pod wlasnym kluczem');
  assert.deepEqual(loadImportedPeople(io), people, 'odczyt 1:1');
});

test('ksiazka: aliasy zapis/odczyt 1:1', () => {
  const io = memoryIO();
  const aliases = [
    { name: 'gildia', targets: ['Fred', 'Grault'] },
    { name: 'rada', targets: ['Corge'] },
  ];
  saveImportedAliases(io, aliases);
  assert.ok(io.map.has(ALIASES_KEY), 'aliasy pod wlasnym kluczem');
  assert.deepEqual(loadImportedAliases(io), aliases, 'odczyt 1:1');
});

test('ksiazka: klucze osobne od kluczy cache listow', () => {
  const io = memoryIO();
  saveGroups(io, [{ name: 'Gildia', members: ['Fred'] }]);
  assert.ok(!io.map.has('indeks'), 'grupy nie zapisuja pod kluczem cache');
  assert.ok(!io.map.has('luki-archiwum'), 'grupy nie zapisuja pod kluczem luk');
});

test('ksiazka: uszkodzona struktura daje domyslne, bez wyjatku', () => {
  const io = memoryIO();
  io.setJSON(GROUPS_KEY, [{ name: 17, members: 'Fred' }, { members: ['Grault'] }]);
  io.setJSON(PEOPLE_KEY, { zapamietani: 'Fred', przedstawieni: [7] });
  io.setJSON(ALIASES_KEY, [{ name: 'gildia', targets: null }]);
  assert.deepEqual(loadGroups(io), [], 'grupy: brak poprawnych wpisow');
  assert.deepEqual(loadImportedPeople(io), { zapamietani: [], przedstawieni: [] });
  assert.deepEqual(loadImportedAliases(io), [], 'aliasy: brak poprawnych wpisow');
});

test('ksiazka: normalizacja - trim, puste wpisy odrzucane, duplikaty scalone', () => {
  const io = memoryIO();
  saveGroups(io, [
    { name: '  Gildia  ', members: [' Fred ', '', 'Grault', 'Fred'] },
    { name: '', members: ['Corge'] },
    { name: 'Gildia', members: ['Corge'] },
  ]);
  assert.deepEqual(loadGroups(io), [{ name: 'Gildia', members: ['Fred', 'Grault', 'Corge'] }]);

  saveImportedPeople(io, { zapamietani: [' Fred ', '', 'Fred'], przedstawieni: ['  '] });
  assert.deepEqual(loadImportedPeople(io), { zapamietani: ['Fred'], przedstawieni: [] });

  saveImportedAliases(io, [{ name: ' gildia ', targets: [' Fred ', 'Fred', ''] }]);
  assert.deepEqual(loadImportedAliases(io), [{ name: 'gildia', targets: ['Fred'] }]);
});

test('ksiazka: wyczysc zapisane dane nie tyka ksiazki adresowej', async () => {
  const driver = new MemoryStorageDriver();
  const storage: CharStorage = await (
    await import('../src/arkmail/adapters/storage.js')
  ).CharStorage.open('fred', driver, () => {});

  // Stan cache + ksiazka przed czyszczeniem (klucze jak w index.ts).
  storage.setJSON('indeks', { odebrane: 'rev-1' });
  storage.setJSON('luki-archiwum', { odebrane: ['07-11-2026'] });
  saveGroups(storage, [{ name: 'Gildia', members: ['Fred'] }]);
  saveImportedPeople(storage, { zapamietani: ['Grault'], przedstawieni: [] });
  saveImportedAliases(storage, [{ name: 'gildia', targets: ['Fred'] }]);

  // Ten sam wzor co onClearCache w index.ts.
  await storage.clearMailData(['indeks', 'luki-archiwum']);

  assert.equal(storage.getJSON('indeks'), null, 'cache kasowany');
  assert.deepEqual(
    loadGroups(storage),
    [{ name: 'Gildia', members: ['Fred'] }],
    'grupy zostaja',
  );
  assert.deepEqual(
    loadImportedPeople(storage),
    { zapamietani: ['Grault'], przedstawieni: [] },
    'osoby zostaja',
  );
  assert.deepEqual(
    loadImportedAliases(storage),
    [{ name: 'gildia', targets: ['Fred'] }],
    'aliasy zostaja',
  );
});
