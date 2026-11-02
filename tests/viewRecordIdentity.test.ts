/**
 * Tozsamosc wiersza widoku = tozsamosc rekordu archiwum (archiveId).
 *
 * Zgloszenie 2026-11-02: przy masie listow o identycznych metadanych
 * (ten sam autor, temat, minuta) dedup appendMailboxPage po kluczu
 * tresci pożeral prawdziwe listy. Scenariusz: 3 listy o jednym kluczu
 * rozdzielone 1+2 na dwie strony - strona nowsza daje 1 wiersz,
 * strona starsza 2 wpisy. Wpis trafiony po kluczu dostaje ID ISTNIEJACEGO
 * rekordu (mergeListingPage), nadmiarowy ID NOWEGO. Widok pokazuje
 * tyle wierszy, ile jest rekordow - a nie tyle, ile jest kluczy.
 *
 * Kontrakt po zmianie:
 *  - wpis z archiveId juz widocznym w widoku = powtorka (sonda) -> 0;
 *  - wpis z NOWYM archiveId = osobny list -> osobny wiersz, nawet przy
 *    identycznym kluczu tresci;
 *  - wpis bez archiveId (zapis legacy) = stare zachowanie po kluczu.
 *
 * Ten plik to dowod RED: testy padaja na dedupie po kluczu tresci.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry, MailboxResult } from '../src/arkmail/core/session/mailbox';

const DATE_RAW = 'Sroda, 5 XI 2026, 10:00:00';

function date() {
  return {
    raw: DATE_RAW,
    weekday: 'Sroda',
    day: 5,
    month: 11,
    year: 2026,
    time: '10:00:00',
  };
}

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 1,
    isRead: true,
    subject: 'Raport',
    forwarded: false,
    party: 'Goniec',
    partyKind: 'nadawca',
    date: date(),
    ...over,
  };
}

function lista(entries: MailboxEntry[]): MailboxResult {
  return {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries,
  };
}

// Trzy fizycznie rozne listy (inne numery) o identycznych metadanych.
const PAGE1 = { ...entry({ number: 7 }), archiveId: 'rec-1' };
const PAGE2_A = { ...entry({ number: 8 }), archiveId: 'rec-1' };
const PAGE2_B = { ...entry({ number: 9 }), archiveId: 'rec-2' };

test('widok: 3 listy o identycznym kluczu 1+2 na stronach = 3 wiersze', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([PAGE1]));
  const added = s.appendMailboxPage('odebrane', [PAGE2_A, PAGE2_B], false);
  assert.equal(added, 2, 'dwa rozne rekordy = dwa wiersze, blizniaki nietkniete');
  assert.equal(
    s.state.boxes['odebrane']?.entries.length,
    3,
    '3 fizyczne listy = 3 wiersze w widoku',
  );
});

test('widok: powtorka tego samego rekordu (sonda paginacji) = 0 wierszy', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([PAGE1]));
  // Sonda odpytuje ponownie ten sam dzien - wpis rozwiazany na ten
  // sam rekord co widoczny wiersz.
  const probe = { ...entry({ number: 40 }), archiveId: 'rec-1' };
  const added = s.appendMailboxPage('odebrane', [probe], true);
  assert.equal(added, 0, 'ten sam rekord = bez drugiego wiersza');
  assert.equal(s.state.boxes['odebrane']?.entries.length, 1);
});
