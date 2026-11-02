/**
 * Tozsamosc wiersza widoku = tozsamosc rekordu archiwum (archiveId).
 *
 * Zgloszenie 2026-11-02: przy masie listow o identycznych metadanych
 * (ten sam autor, temat, minuta) dedup appendMailboxPage po kluczu
 * tresci zachowywal sie inaczej niz baza: wpis rozwiazany na NOWY
 * rekord (nadmiarowy blizniak) dostawal wiersz w archiwum, ale zero
 * wierszy w widoku, bo klucz tresci byl juz widoczny. Rozjazd
 * widok vs archiwum rosl o 1 na kazdy taki przypadek.
 *
 * Kontrakt po zmianie (dedup po archiveId, klucz tresci tylko dla
 * wpisow legacy bez archiveId):
 *  - wpis z archiveId juz widocznym w widoku = powtorka (sonda) -> 0;
 *  - wpis z NOWYM archiveId = osobny wiersz, nawet przy identycznym
 *    kluczu tresci - wierszy widoku przybywa tyle samo co rekordow
 *    archiwum (zero rozjazdu);
 *  - liczba wierszy widoku = liczba rekordow archiwum skrzynki.
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

// Trzy fizycznie rozne listy (inne numery) o identycznych metadanych;
// w archiwum dwa rekordy: rec-1 (list nowszy + jego blizniak
// dopasowany po kluczu) i rec-2 (nadmiarowy blizniak).
const PAGE1 = { ...entry({ number: 7 }), archiveId: 'rec-1' };
const PAGE2_A = { ...entry({ number: 8 }), archiveId: 'rec-1' };
const PAGE2_B = { ...entry({ number: 9 }), archiveId: 'rec-2' };

test('widok: nadmiarowy blizniak (nowy rekord) dostaje wlasny wiersz', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([PAGE1]));
  // Starsza strona: blizniak rozwiazany na stary rekord + blizniak
  // rozwiazany na NOWY rekord.
  const added = s.appendMailboxPage('odebrane', [PAGE2_A, PAGE2_B], false);
  assert.equal(added, 1, 'tylko nowy rekord = nowy wiersz');
  const rows = s.state.boxes['odebrane']?.entries ?? [];
  assert.equal(rows.length, 2, 'wierszy widoku = rekordow archiwum');
  assert.deepEqual(
    [...rows.map((r) => r.archiveId)].sort(),
    ['rec-1', 'rec-2'],
    'widok pokrywa oba rekordy',
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

test('widok: wpis legacy bez archiveId = dedup po kluczu tresci (sonda)', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([entry({ number: 7 })]));
  const added = s.appendMailboxPage('odebrane', [entry({ number: 40 })], true);
  assert.equal(added, 0, 'bez archiveId klucz tresci pilnuje powtorki');
  assert.equal(s.state.boxes['odebrane']?.entries.length, 1);
});
