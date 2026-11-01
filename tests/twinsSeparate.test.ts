/**
 * Fala 41: kazda pozycja listingu serwera = osobny rekord archiwum.
 *
 * Zasada (rozkaz 2026-11-01): zero mergowania po metadanych. Dwa wpisy
 * o identycznej osobie/tematcie/dacie to DWA listy - kazdy ze swoja
 * trescia, kazdy ze swoim ID. Tozsamosc rekordu pochodzi z przebiegu
 * skanu i pozycji w nim, nie z metadanych.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMailboxEntry,
  insertLetters,
  replaceBoxLetters,
  scanKeyOfEntries,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const entry = (number: number, body: string[]): MailboxEntry => ({
  number,
  isRead: true,
  subject: 'Raport',
  forwarded: false,
  party: 'Foo',
  partyKind: 'nadawca',
  date: { raw: 'Pn, 23 VIII 1999, 10:00:00', weekday: 'Pn', day: 23, month: 8, year: 1999, time: '10:00:00' },
  // biome-ignore lint: pole przypisywane przez warstwe skanu (Fala 41).
  archiveId: '',
  ...(body.length > 0 ? {} : {}),
}) as MailboxEntry;

test('blizniacy: dwa identyczne wpisy z trescia = dwa rekordy, obie tresci', () => {
  const scanKey = scanKeyOfEntries([entry(5, []), entry(6, [])]);
  const recs = [
    { ...fromMailboxEntry('odebrane', entry(5, []), scanKey, 0), body: ['tresc pierwszego'] },
    { ...fromMailboxEntry('odebrane', entry(6, []), scanKey, 1), body: ['tresc drugiego'] },
  ];
  const out = insertLetters([], recs);
  assert.equal(out.letters.length, 2, 'kazdy wpis listingu = osobny rekord');
  assert.equal(out.added, 2);
  const bodies = out.letters.map((l) => l.body[0]).sort();
  assert.deepEqual(bodies, ['tresc drugiego', 'tresc pierwszego'], 'zadna tresc nie ginie');
});

test('blizniacy: ponowny insert tych samych ID = idempotentny, bez duplikatow', () => {
  const scanKey = scanKeyOfEntries([entry(5, []), entry(6, [])]);
  const recs = [
    fromMailboxEntry('odebrane', entry(5, []), scanKey, 0),
    fromMailboxEntry('odebrane', entry(6, []), scanKey, 1),
  ];
  const once = insertLetters([], recs);
  const twice = insertLetters(once.letters, recs);
  assert.equal(twice.letters.length, 2);
  assert.equal(twice.added, 0, 'ponowny skan nie duplikuje');
});

test('pelny skan zastepuje skrzynke: wynik przebiegu = stan archiwum skrzynki', () => {
  // Stary rekord ma INNA tresc niz blizniaki z nowego skanu - nie
  // zostanie dopasowany, tylko fizycznie usuniety.
  const stale = {
    ...entry(9, []),
    subject: 'Stary temat',
  };
  const keyOld = scanKeyOfEntries([stale]);
  const keyNew = scanKeyOfEntries([entry(5, []), entry(6, [])]);
  const before = insertLetters(
    [],
    [fromMailboxEntry('odebrane', stale, keyOld, 0)],
  ).letters;
  const out = replaceBoxLetters(before, 'odebrane', [
    fromMailboxEntry('odebrane', entry(5, []), keyNew, 0),
    fromMailboxEntry('odebrane', entry(6, []), keyNew, 1),
  ]);
  assert.equal(out.letters.length, 2, 'zrzut skrzynki = dokladnie listing');
  assert.ok(out.removedIds.has(before[0]!.id), 'zwraca usuniete ID do przyciecia widoku');
});

test('blizniacy: tresci roznia sie miedzy rekordami (brak nadpisywania)', () => {
  const scanKey = scanKeyOfEntries([entry(5, []), entry(6, [])]);
  const a: ArchiveLetter = { ...fromMailboxEntry('odebrane', entry(5, []), scanKey, 0), body: ['A'] };
  const b: ArchiveLetter = { ...fromMailboxEntry('odebrane', entry(6, []), scanKey, 1), body: ['B'] };
  // Drugi insert NIE nadpisuje pierwszego (stary upsert zjadal tresc).
  const out = insertLetters([a], [b]);
  assert.equal(out.letters.length, 2);
  assert.ok(out.letters.every((l) => l.body.length === 1), 'obie tresci wlasne');
});
