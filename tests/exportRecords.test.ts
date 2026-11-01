// Fala 41: eksport = jeden plik na REKORD. Kazdy wylistowany wpis
// to osobny rekord archiwum i osobny plik w ZIP (wlasna tresc, wlasna
// nazwa; kolizje nazw dostaja suffiks -2, -3, ...). Rekord bez tresci
// jest pomijany i liczony. Replika miedzy skrzynkami eksportuje sie
// w kazdej skrzynce osobno. Bez numerow porzadkowych _01 (to byla
// semantyka scalania wystapien, wycofana).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { archiveExportEntries } from '../src/arkmail/core/exportTxt';

const DATE_RAW = 'Wt, 24 VIII 1999, 10:00:00';

const entry = (subject: string) =>
  fromMailboxEntry('odebrane', {
    number: 3,
    isRead: true,
    subject,
    forwarded: false,
    party: 'Goniec',
    partyKind: 'nadawca' as const,
    date: { raw: DATE_RAW, weekday: 'Wt', day: 24, month: 8, year: 1999, time: '10:00:00' },
  });

test('eksport: dwa blizniacze rekordy = DWA pliki z wlasnymi tresciami', () => {
  const letters: ArchiveLetter[] = [
    { ...entry('Raport'), id: 't1', body: ['Tresc pierwszego.'] },
    { ...entry('Raport'), id: 't2', body: ['Tresc drugiego.'] },
  ];
  const { entries, skipped } = archiveExportEntries(letters);
  assert.equal(skipped, 0);
  assert.equal(entries.length, 2, 'dwa rekordy = dwa pliki');
  assert.ok(
    entries.every((e) => !/_\d{2}\.txt$/.test(e.name)),
    `bez numerow porzadkowych: ${entries.map((e) => e.name).join(', ')}`,
  );
  assert.ok(
    entries.some((e) => e.txt.includes('Tresc pierwszego.')),
    'tresc pierwszego rekordu w swoim pliku',
  );
  assert.ok(
    entries.some((e) => e.txt.includes('Tresc drugiego.')),
    'tresc drugiego rekordu w swoim pliku',
  );
  // Ta sama nazwa bazowa = kolizja rozwiazana suffiksem -2.
  const names = entries.map((e) => e.name);
  assert.equal(names.filter((n) => /-2\.txt$/.test(n)).length, 1, `jeden plik z suffiksem -2: ${names.join(', ')}`);
  assert.equal(names.filter((n) => /(?<!-2)\.txt$/.test(n)).length, 1, `jeden plik bez suffiksu: ${names.join(', ')}`);
});

test('eksport: rekord bez tresci pominiety i policzony', () => {
  const letters: ArchiveLetter[] = [
    { ...entry('Raport'), id: 't1', body: [] },
    { ...entry('Inny'), id: 't2', body: ['Tresc.'] },
  ];
  const { entries, skipped } = archiveExportEntries(letters);
  assert.equal(entries.length, 1);
  assert.equal(skipped, 1);
});

test('eksport: rekord pojedynczy zachowuje nazwe bez suffiksu', () => {
  const single: ArchiveLetter = { ...entry('Inny'), id: 's1', body: ['Tresc.'] };
  const { entries, skipped } = archiveExportEntries([single]);
  assert.equal(skipped, 0);
  assert.equal(entries.length, 1);
  assert.ok(
    /\/1999-08-24_10-00-00_goniec_inny\.txt$/.test(entries[0]!.name),
    `nazwa bez numeru: ${entries[0]!.name}`,
  );
});

test('eksport: replika miedzy skrzynkami = plik w kazdej skrzynce osobno', () => {
  const unread: ArchiveLetter = {
    ...entry('Raport'),
    box: 'nieprzeczytane' as const,
    id: 'x-1',
    body: ['Tresc.'],
  };
  const read: ArchiveLetter = { ...entry('Raport'), id: 'x-2', body: ['Tresc.'] };
  const { entries } = archiveExportEntries([unread, read]);
  assert.equal(entries.length, 2, 'replika to osobny rekord = osobny plik');
  const folders = entries.map((e) => e.name.split('/')[0]).sort();
  assert.deepEqual(folders, ['nieprzeczytane', 'odebrane']);
});
