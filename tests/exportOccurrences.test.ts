/**
 * Fala 35d: eksport = jeden plik per wystapienie (variant 2).
 *
 * Decyzja 2026-10-31: N wylistowanych listow = N rekordow = N plikow
 * eksportu, nawet gdy tresci sa identyczne. Rekord archiwum z
 * occurrences = N trzyma N slotow tresci (body = wystapienie 1,
 * extraBodies = 2..N); kazdy slot z trescia to osobny plik z numerem
 * porzadkowym w nazwie (_01.._NN). Slot bez tresci: pominiety i
 * policzony w podsumowaniu. Rekord z occurrences = 1 zachowuje dawna
 * nazwe pliku (bez numeru).
 *
 * Ten plik to dowod RED: testy padaja na kodzie eksportujacym jeden
 * plik per rekord.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry, withOccurrenceBodies, type ArchiveLetter } from '../src/arkmail/core/archive';
import { archiveExportEntries } from '../src/arkmail/core/exportTxt';

const DATE_RAW = 'Wt, 23 XII 2025, 10:00:00';

const entry = (subject: string) =>
  fromMailboxEntry('odebrane', {
    number: 3,
    isRead: true,
    subject,
    forwarded: false,
    party: 'Goniec',
    partyKind: 'nadawca' as const,
    date: { raw: DATE_RAW, weekday: 'Wt', day: 23, month: 12, year: 2025, time: '10:00:00' },
  });

test('eksport: occurrences = 2 daje DWA pliki z wlasnymi tresciami i numerami', () => {
  const twin: ArchiveLetter = withOccurrenceBodies(entry('Raport'), [
    ['Tresc pierwszego wystapienia.'],
    ['Tresc drugiego wystapienia.'],
  ]);
  const { entries, skipped } = archiveExportEntries([twin]);
  assert.equal(skipped, 0);
  assert.equal(entries.length, 2, 'dwa wylistowane listy = dwa pliki');
  const names = entries.map((e) => e.name);
  assert.ok(
    names.some((n) => /_01\.txt$/.test(n)),
    `pierwszy plik z numerem _01: ${names.join(', ')}`,
  );
  assert.ok(names.some((n) => /_02\.txt$/.test(n)), 'drugi plik z numerem _02');
  const bodies = entries.map((e) => e.txt);
  assert.ok(
    bodies.some((t) => t.includes('Tresc pierwszego wystapienia.')),
    'tresc wystapienia 1 w swoim pliku',
  );
  assert.ok(
    bodies.some((t) => t.includes('Tresc drugiego wystapienia.')),
    'tresc wystapienia 2 w swoim pliku',
  );
  assert.ok(
    bodies.every((t) => t.split('\n')[0] === 'Raport'),
    'pierwsza linia kazdego pliku = temat listu',
  );
});

test('eksport: slot bez tresci pominiety i policzony', () => {
  const twin: ArchiveLetter = withOccurrenceBodies(entry('Raport'), [
    ['Tresc pierwszego wystapienia.'],
    [],
  ]);
  const { entries, skipped } = archiveExportEntries([twin]);
  assert.equal(entries.length, 1, 'tylko zapelniony slot');
  assert.equal(skipped, 1, 'pusty slot policzony');
});

test('eksport: occurrences = 1 zachowuje dawna nazwe bez numeru', () => {
  const single: ArchiveLetter = { ...entry('Inny'), body: ['Tresc.'] };
  const { entries, skipped } = archiveExportEntries([single]);
  assert.equal(skipped, 0);
  assert.equal(entries.length, 1);
  assert.ok(
    /\/2025-12-23_10-00-00_goniec_inny\.txt$/.test(entries[0]!.name),
    `dawna nazwa bez numeru: ${entries[0]!.name}`,
  );
});

test('eksport: dwa rekordy o tym samym kluczu (rozne skrzynki) = pliki per wystapienie bez podwojnego liczenia', () => {
  // Cross-box: ta sama tresc w nieprzeczytane + odebrane. Eksport
  // kanoniczny (jedna skrzynka), ale kazde wystapienie osobno.
  const unread: ArchiveLetter = withOccurrenceBodies(
    { ...entry('Raport'), box: 'nieprzeczytane' as const, id: 'x-1' },
    [['Tresc.']],
  );
  const read: ArchiveLetter = withOccurrenceBodies(
    { ...entry('Raport'), id: 'x-2' },
    [['Tresc.']],
  );
  const { entries } = archiveExportEntries([unread, read]);
  assert.equal(entries.length, 1, 'jedna fizyczna tresc = jeden plik (kanon: odebrane)');
  assert.ok(entries[0]!.name.startsWith('odebrane/'), 'folder skrzynki kanonicznej');
});
