/**
 * Fala 35a: liczba wystapien w modelu archiwum i licznikach.
 *
 * Decyzja 2026-10-31: kazdy wylistowany przez serwer list to osobny
 * list. Archiwum trzyma rekord po kluczu tresci (id bez numeru -
 * serwer renumeruje), wiec wielokrotnosc listow o identycznych
 * metadanych mieszka w polu occurrences. Pole brak = 1 (zapisy ze
 * starych wersji). Tresci przeczytane per wystapienie laduja w
 * extraBodies (body = wystapienie 1).
 *
 * Liczniki: "Listow w bazie" = suma wystapien (grupa miedzy skrzynkami
 * liczy MAX - ten sam fizyczny list wystepuje w kazdej skrzynce tyle
 * samo razy); kontakty sumuja wystapienia.
 *
 * Ten plik to dowod RED: testy padaja na kodzie bez occurrences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bodiesOf,
  fromMailboxEntry,
  normalizeArchive,
  occurrenceCount,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { perBoxCounts, totalLive } from '../src/arkmail/core/archiveStats';
import { contactsFromArchive } from '../src/arkmail/core/contacts';

const ENTRY = {
  number: 1,
  isRead: true,
  subject: 'Raport',
  forwarded: false,
  party: 'Goniec',
  partyKind: 'nadawca' as const,
  date: {
    raw: 'Wt, 24 VIII 1999, 00:11:12',
    weekday: 'Wt',
    day: 23,
    month: 12,
    year: 2025,
    time: '00:11:12',
  },
};

function archived(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return { ...fromMailboxEntry('odebrane', ENTRY), ...over };
}

test('occurrences: brak pola = 1 (zapisy legacy)', () => {
  assert.equal(occurrenceCount(archived()), 1);
});

test('occurrences: pole nadpisuje domyslna jedynke', () => {
  assert.equal(occurrenceCount(archived({ occurrences: 10 })), 10);
});

test('occurrences: totalLive sumuje wystapienia', () => {
  const letters = [archived({ occurrences: 10 }), archived({ subject: 'Inny' })];
  assert.equal(totalLive(letters), 11, '10 wystapien blizniaka + 1 inny list');
});

test('occurrences: grupa miedzy skrzynkami liczy MAX (ten sam fizyczny list)', () => {
  const letters = [
    archived({ occurrences: 10 }),
    archived({ box: 'nieprzeczytane', occurrences: 10 }),
  ];
  assert.equal(totalLive(letters), 10, 'nie 20 - to ten sam list w dwoch skrzynkach');
});

test('occurrences: perBoxCounts liczy wystapienia per skrzynka', () => {
  const letters = [
    archived({ occurrences: 10 }),
    archived({ box: 'nieprzeczytane', occurrences: 10 }),
    archived({ subject: 'Inny' }),
  ];
  const counts = perBoxCounts(letters);
  assert.equal(counts.get('odebrane'), 11);
  assert.equal(counts.get('nieprzeczytane'), 10);
});

test('occurrences: kontakty sumuja wystapienia korespondencji', () => {
  const letters = [archived({ occurrences: 5 })];
  const contacts = contactsFromArchive(letters);
  const goniec = contacts.find((c) => c.name === 'Goniec');
  assert.equal(goniec?.lettersReceived, 5, '5 listow od Goncia');
});

test('occurrences: normalizeArchive zachowuje occurrences i extraBodies', () => {
  const body = ['linia 1'];
  const extra = [['inna tresc']];
  const [fixed] = normalizeArchive([archived({ occurrences: 3, extraBodies: extra, body })]);
  assert.equal(fixed?.occurrences, 3);
  assert.deepEqual(fixed?.extraBodies, extra);
  assert.deepEqual(fixed?.body, body);
});

test('occurrences: bodiesOf skleja body z extraBodies bez dedupu', () => {
  const same = ['identyczna tresc'];
  const l = archived({ occurrences: 2, body: same, extraBodies: [same] });
  assert.deepEqual(bodiesOf(l), [same, same], 'dwa wystapienia = dwie tresci, nawet identyczne');
});
