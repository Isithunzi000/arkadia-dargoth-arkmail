import test from 'node:test';
import assert from 'node:assert/strict';

import type { ArchiveLetter } from '../src/arkmail/core/archive';

interface ArchiveModule {
  letterId(
    box: ArchiveLetter['box'],
    party: string,
    subject: string,
    forwarded: boolean,
    dateRaw: string | null,
  ): string;
  normalizeArchive(letters: readonly ArchiveLetter[]): ArchiveLetter[];
}

const modulePath = '../src/arkmail/core/archive.js';
let archive: ArchiveModule;
test.before(async () => {
  archive = (await import(modulePath)) as ArchiveModule;
});

function record(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    id: 'stary-identyfikator',
    box: 'odebrane',
    number: 4,
    party: 'Foo',
    subject: 'Wiadomosc',
    forwarded: false,
    dateRaw: null,
    sortKey: '0000-00-00 00:00:00',
    read: false,
    body: [],
    ...over,
  };
}

test('normalizacja: odzyskuje date z konca osoby i czysci osobe', () => {
  const raw = 'Pn, 20 IX 1999, 01:02:03';
  const [fixed] = archive.normalizeArchive([
    record({ party: `Foo, Bar ${raw}` }),
  ]);

  assert.equal(fixed.party, 'Foo, Bar');
  assert.equal(fixed.dateRaw, raw);
  assert.equal(fixed.sortKey, '1999-09-20 01:02:03');
  assert.equal(fixed.id, archive.letterId('odebrane', 'Foo, Bar', 'Wiadomosc', false, raw));
});

test('normalizacja: poprawna dateRaw odtwarza sortKey i identyfikator', () => {
  const raw = 'Wt, 24 VIII 1999, 00:11:12';
  const [fixed] = archive.normalizeArchive([record({ dateRaw: raw })]);

  assert.equal(fixed.sortKey, '1999-08-24 00:11:12');
  assert.equal(fixed.id, archive.letterId('odebrane', 'Foo', 'Wiadomosc', false, raw));
});

test('normalizacja: sam poprawny sortKey odtwarza pelna dateRaw', () => {
  const [fixed] = archive.normalizeArchive([
    record({ sortKey: '1999-09-20 03:04:05' }),
  ]);

  assert.equal(fixed.dateRaw, 'Pn, 20 IX 1999, 03:04:05');
  assert.equal(fixed.sortKey, '1999-09-20 03:04:05');
});

test('normalizacja: scala duplikaty i zachowuje wszystkie rozne linie tresci', () => {
  const raw = 'Pn, 20 IX 1999, 01:02:03';
  const first = record({
    id: 'pierwszy',
    party: `Foo ${raw}`,
    body: ['pierwsza', 'wspolna'],
    read: false,
    missingOnServer: true,
  });
  const second = record({
    id: 'drugi',
    party: 'Foo',
    dateRaw: raw,
    sortKey: '1999-09-20 01:02:03',
    number: 9,
    body: ['druga', 'wspolna'],
    read: true,
  });

  const normalized = archive.normalizeArchive([first, second]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].read, true);
  // Fala 28: normalize NIE rusza legacy-pola - jednorazowy purge
  // flagged rekordow dzieje sie przy ladowaniu pluginu (index.ts).
  assert.equal(normalized[0].missingOnServer, true);
  assert.equal(normalized[0].number, 9);
  assert.deepEqual(new Set(normalized[0].body), new Set(['pierwsza', 'druga', 'wspolna']));
  assert.equal(normalized[0].body.length, 3);
  assert.deepEqual(
    archive.normalizeArchive([first, second]),
    archive.normalizeArchive([second, first]),
    'wynik nie zalezy od kolejnosci wejscia',
  );
});

test('normalizacja: jest powtarzalna i nie zmienia wejscia', () => {
  const original = record({
    party: 'Foo Pn, 20 IX 1999, 01:02:03',
    body: ['tresc'],
  });
  const snapshot = structuredClone(original);

  const once = archive.normalizeArchive([original]);
  const twice = archive.normalizeArchive(once);

  assert.deepEqual(original, snapshot);
  assert.deepEqual(twice, once);
  assert.notEqual(once[0].body, original.body, 'tresc jest kopiowana');
});

test('normalizacja: rekord bez mozliwej do odzyskania daty zostaje nietkniety', () => {
  const damaged = record({
    id: archive.letterId('odebrane', 'Foo ...', 'Wiadomosc', false, 'nieznana'),
    party: 'Foo ...',
    dateRaw: 'nieznana',
    sortKey: 'uszkodzony',
    body: ['nietypowa linia'],
  });

  assert.deepEqual(archive.normalizeArchive([damaged]), [damaged]);
});

test('normalizacja: pusta tresc duplikatu nie usuwa zapisanej tresci', () => {
  const raw = 'Pn, 20 IX 1999, 01:02:03';
  const withBody = record({ dateRaw: raw, body: ['zachowana'] });
  const withoutBody = record({ party: `Foo ${raw}`, body: [] });

  const [fixed] = archive.normalizeArchive([withoutBody, withBody]);
  assert.deepEqual(fixed.body, ['zachowana']);
});
