/**
 * Plaska ksiazka adresowa: jedna lista imion pod kluczem "osoby",
 * grupy reczne pod "grupy-kontaktow", aliasy pocztowe z gry (tylko
 * odczyt) pod "aliasy-importowane". Czyszczenie zapisanych danych
 * kasuje wylacznie klucze cache (indeks, luki archiwum) - ksiazka
 * zostaje. Migracja ze starego klucza "osoby-importowane" sumuje
 * pule i ZOSTAWIA stary klucz (bezpieczny rollback do starszej
 * wersji). Dedup imion bez wielkosci liter; pierwsza pisownia
 * wygrywa. Imiona w testach syntetyczne (Fred, Grault, Corge).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type { CharStorage } from '../src/arkmail/adapters/storage';
import {
  GROUPS_KEY,
  PEOPLE_KEY,
  LEGACY_PEOPLE_KEY,
  ALIASES_KEY,
  loadGroups,
  saveGroups,
  loadPeople,
  savePeople,
  migratePeople,
  mergeAddressBook,
  withGroupMembers,
  unionPeople,
  parseAddressBookExport,
  buildAddressBookExport,
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

test('ksiazka: pusty magazyn daje pusta ksiazke, grupy i aliasy', () => {
  const io = memoryIO();
  assert.deepEqual(loadPeople(io), [], 'imiona: pusta lista');
  assert.deepEqual(loadGroups(io), [], 'grupy: pusta lista');
  assert.deepEqual(loadImportedAliases(io), [], 'aliasy: pusta lista');
});

test('ksiazka: imiona zapis/odczyt 1:1 pod kluczem "osoby"', () => {
  const io = memoryIO();
  savePeople(io, ['Fred', 'Grault']);
  assert.ok(io.map.has(PEOPLE_KEY), 'imiona pod wlasnym kluczem');
  assert.ok(!io.map.has(LEGACY_PEOPLE_KEY), 'stary klucz nie powstaje');
  assert.deepEqual(loadPeople(io), ['Fred', 'Grault'], 'odczyt 1:1');
});

test('ksiazka: dedup imion bez wielkosci liter, pierwsza pisownia wygrywa', () => {
  const io = memoryIO();
  savePeople(io, ['Fred', 'fred', ' FRED ', '', 'Grault', 'GRAULT']);
  assert.deepEqual(loadPeople(io), ['Fred', 'Grault']);
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
  savePeople(io, ['Fred']);
  saveGroups(io, [{ name: 'Gildia', members: ['Fred'] }]);
  assert.ok(!io.map.has('indeks'), 'ksiazka nie zapisuje pod kluczem cache');
  assert.ok(!io.map.has('luki-archiwum'), 'ksiazka nie zapisuje pod kluczem luk');
});

test('ksiazka: uszkodzona struktura daje domyslne, bez wyjatku', () => {
  const io = memoryIO();
  io.setJSON(PEOPLE_KEY, { nie: 'lista' });
  io.setJSON(GROUPS_KEY, [{ name: 17, members: 'Fred' }, { members: ['Grault'] }]);
  io.setJSON(ALIASES_KEY, [{ name: 'gildia', targets: null }]);
  assert.deepEqual(loadPeople(io), [], 'imiona: brak poprawnych wpisow');
  assert.deepEqual(loadGroups(io), [], 'grupy: brak poprawnych wpisow');
  assert.deepEqual(loadImportedAliases(io), [], 'aliasy: brak poprawnych wpisow');
});

test('ksiazka: normalizacja grup - trim, puste odrzucane, duplikaty scalone', () => {
  const io = memoryIO();
  saveGroups(io, [
    { name: '  Gildia  ', members: [' Fred ', '', 'Grault', 'Fred'] },
    { name: '', members: ['Corge'] },
    { name: 'Gildia', members: ['Corge'] },
  ]);
  assert.deepEqual(loadGroups(io), [{ name: 'Gildia', members: ['Fred', 'Grault', 'Corge'] }]);
});

test('ksiazka: wyczysc zapisane dane nie tyka ksiazki adresowej', async () => {
  const driver = new MemoryStorageDriver();
  const storage: CharStorage = await (
    await import('../src/arkmail/adapters/storage.js')
  ).CharStorage.open('fred', driver, () => {});

  storage.setJSON('indeks', { odebrane: 'rev-1' });
  storage.setJSON('luki-archiwum', { odebrane: ['07-11-2026'] });
  savePeople(storage, ['Fred', 'Grault']);
  saveGroups(storage, [{ name: 'Gildia', members: ['Fred'] }]);
  saveImportedAliases(storage, [{ name: 'gildia', targets: ['Fred'] }]);

  await storage.clearMailData(['indeks', 'luki-archiwum']);

  assert.equal(storage.getJSON('indeks'), null, 'cache kasowany');
  assert.deepEqual(loadPeople(storage), ['Fred', 'Grault'], 'imiona zostaja');
  assert.deepEqual(loadGroups(storage), [{ name: 'Gildia', members: ['Fred'] }], 'grupy zostaja');
  assert.deepEqual(
    loadImportedAliases(storage),
    [{ name: 'gildia', targets: ['Fred'] }],
    'aliasy zostaja',
  );
});

// --- migracja ze starego klucza ----------------------------------------------

test('migracja: suma pul trafia do nowej ksiazki', () => {
  const io = memoryIO();
  io.setJSON(LEGACY_PEOPLE_KEY, {
    zapamietani: ['Fred', 'Grault'],
    przedstawieni: ['Grault', 'Corge'],
  });
  assert.deepEqual(migratePeople(io), ['Fred', 'Grault', 'Corge'], 'dedup nakladania pul');
  assert.deepEqual(loadPeople(io), ['Fred', 'Grault', 'Corge'], 'zapisana nowa ksiazka');
});

test('migracja: stary klucz ZOSTAJE (bezpieczny rollback)', () => {
  const io = memoryIO();
  io.setJSON(LEGACY_PEOPLE_KEY, { zapamietani: ['Fred'], przedstawieni: [] });
  migratePeople(io);
  assert.ok(io.map.has(LEGACY_PEOPLE_KEY), 'stary klucz nietkniety');
  assert.ok(io.map.has(PEOPLE_KEY), 'nowy klucz powstaje');
});

test('migracja: drugi przebieg jest no-op', () => {
  const io = memoryIO();
  io.setJSON(LEGACY_PEOPLE_KEY, { zapamietani: ['Fred'], przedstawieni: [] });
  migratePeople(io);
  io.setJSON(LEGACY_PEOPLE_KEY, { zapamietani: ['Nieznany'], przedstawieni: [] });
  assert.deepEqual(migratePeople(io), ['Fred'], 'istniejaca ksiazka blokuje remigracje');
});

test('migracja: uszkodzony stary zapis daje pusta ksiazke, bez wyjatku', () => {
  const io = memoryIO();
  io.setJSON(LEGACY_PEOPLE_KEY, 'nie-obiekt');
  assert.deepEqual(migratePeople(io), []);
  assert.deepEqual(loadPeople(io), []);
});

test('migracja: istniejaca nowa ksiazka nie jest nadpisywana', () => {
  const io = memoryIO();
  savePeople(io, ['Quux']);
  io.setJSON(LEGACY_PEOPLE_KEY, { zapamietani: ['Fred'], przedstawieni: [] });
  assert.deepEqual(migratePeople(io), ['Quux']);
});

// --- scalanie ksiazki (tryb dolacz) -------------------------------------------

test('scal: nowe grupy dolaczane, kolizja nazw scala czlonkow', () => {
  const existing = {
    people: ['Fred'],
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  };
  const incoming = {
    people: ['Grault'],
    groups: [
      { name: 'gildia', members: ['Grault', 'Fred'] },
      { name: 'Patrol', members: ['Corge'] },
    ],
  };
  const { data, stats } = mergeAddressBook(existing, incoming);
  assert.deepEqual(data.groups, [
    { name: 'Gildia', members: ['Fred', 'Grault'] },
    { name: 'Patrol', members: ['Corge'] },
  ], 'kolizja bez wielkosci liter scala, kanoniczna nazwa pierwsza');
  assert.deepEqual(data.people, ['Fred', 'Grault'], 'imiona z pliku dolaczone');
  assert.equal(stats.addedGroups, 1, 'Patrol nowa');
  assert.equal(stats.mergedGroups, 1, 'Gildia scalona');
  assert.equal(stats.addedPeople, 1, 'tylko Grault nowy');
});

test('scal: czlonkowie grup uzupelniaja ksiazke (kompletnosc)', () => {
  const { data, stats } = mergeAddressBook(
    { people: [], groups: [] },
    { people: [], groups: [{ name: 'Patrol', members: ['Corge', 'Waldo'] }] },
  );
  assert.deepEqual(data.people, ['Corge', 'Waldo'], 'brakujacy czlonkowie w ksiazce');
  assert.equal(stats.addedPeople, 2);
});

test('scal: dedup imion zachowuje pierwsza pisownie', () => {
  const { data } = mergeAddressBook(
    { people: ['Grault'], groups: [] },
    { people: ['grault', 'FRED'], groups: [] },
  );
  assert.deepEqual(data.people, ['Grault', 'FRED']);
});

test('unionPeople: dedup bez wielkosci liter, porzadek zachowany', () => {
  assert.deepEqual(unionPeople(['Fred', 'Grault'], ['fred', 'Corge']), [
    'Fred',
    'Grault',
    'Corge',
  ]);
});

test('withGroupMembers: tryb zastap uzupelnia imiona czlonkow grup', () => {
  const people = withGroupMembers(['Fred'], [{ name: 'Gildia', members: ['Grault', 'Fred'] }]);
  assert.deepEqual(people, ['Fred', 'Grault']);
});

// --- format eksportu v2 --------------------------------------------------------

test('format: eksport v2 i odczyt 1:1, bez aliasow', () => {
  const book = {
    people: ['Fred', 'Grault'],
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  };
  const json = buildAddressBookExport(book);
  const raw = JSON.parse(json) as { format: string; version: number };
  assert.equal(raw.format, 'arkmail-addressbook');
  assert.equal(raw.version, 2);
  assert.ok(!('importedAliases' in raw), 'aliasy nie wchodza do pliku');
  assert.ok(!('importedPeople' in raw), 'stare pule nie wchodza do pliku');
  assert.deepEqual(parseAddressBookExport(json), book, 'odczyt 1:1');
});

test('format: v1 daje sume pul, aliasy z pliku ignorowane', () => {
  const parsed = parseAddressBookExport(
    JSON.stringify({
      format: 'arkmail-addressbook',
      version: 1,
      groups: [{ name: 'Gildia', members: ['Fred'] }],
      importedPeople: { zapamietani: ['Fred', 'Grault'], przedstawieni: ['Grault', 'Corge'] },
      importedAliases: [{ name: 'rada', targets: ['Fred'] }],
    }),
  );
  assert.deepEqual(parsed, {
    people: ['Fred', 'Grault', 'Corge'],
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
});

test('format: brak zgodnosci odrzuca (zly format, brak wersji, nie-JSON)', () => {
  assert.equal(parseAddressBookExport('{"format":"inny","version":2}'), null);
  assert.equal(parseAddressBookExport('nie-json'), null);
  assert.equal(parseAddressBookExport('{"format":"arkmail-addressbook"}'), null, 'brak wersji');
  assert.equal(parseAddressBookExport('{"format":"arkmail-addressbook","version":"dwa"}'), null);
});

test('format: plik bez danych daje pusta ksiazke', () => {
  assert.deepEqual(parseAddressBookExport('{"format":"arkmail-addressbook","version":2}'), {
    people: [],
    groups: [],
  });
  assert.deepEqual(parseAddressBookExport('{"format":"arkmail-addressbook","version":1}'), {
    people: [],
    groups: [],
  });
});

test('format: bez suffixow import - kolizja nazw zostaje do scalenia', () => {
  const parsed = parseAddressBookExport(
    JSON.stringify({
      format: 'arkmail-addressbook',
      version: 2,
      people: [],
      groups: [{ name: 'Gildia', members: ['Fred'] }],
    }),
  );
  assert.deepEqual(parsed!.groups, [{ name: 'Gildia', members: ['Fred'] }], 'nazwa 1:1 z pliku');
});
