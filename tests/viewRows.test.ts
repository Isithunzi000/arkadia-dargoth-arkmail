/**
 * Fala 34: wiersz widoku = wystapienie z listingu serwera.
 *
 * Zgloszenie 2026-10-31 (decyzja uzytkownika, korekta Fali 29): dedup
 * widoku po kluczu tresci byl semantycznie zly. Serwer wylistowal N
 * rekordow = N osobnych listow (w tym blizniakow o identycznych
 * metadanych), wiec widok pokazuje N wierszy. Numer rozroznia
 * blizniaki w obrebie jednego listingu.
 *
 * Kontrakt:
 *  - applyMailbox: widok = listing 1:1 (zero dedupu);
 *  - appendMailboxPage: w obrebie strony NIC nie jest sklejane; zdejmuje
 *    jedynie wpisy juz widoczne (sonda sciany paginacji odpytuje
 *    ponownie dzien graniczny - to te same fizyczne listy);
 *  - syncMailboxPage: parowanie wielozbiorowe - swieza strona z 2
 *    blizniakami przy 1 wierszu w widoku DOKLADA drugi wiersz;
 *    kompletny listing bez jednego blizniaka = jeden wiersz mniej;
 *  - niezmiennik: liczba wierszy widoku = liczba wierszy listingu.
 *
 * Ten plik to dowod RED: testy padaja na kodzie z dedupem (Fala 29).
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

// Blizniaki: fizycznie rozne listy (inny numer), identyczne metadane.
const TWIN_A = entry({ number: 7 });
const TWIN_B = entry({ number: 8 });
const OTHER = entry({ number: 9, subject: 'Inny temat' });

test('widok: applyMailbox z para blizniakow pokazuje DWA wiersze', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A, TWIN_B, OTHER]));
  assert.equal(
    s.state.boxes['odebrane']?.entries.length,
    3,
    '3 wiersze: dwa blizniaki osobno + Inny temat',
  );
});

test('widok: liczba wierszy = liczba wierszy listingu (niezmiennik 1:1)', () => {
  const s = new MailUiStore();
  const listing = [TWIN_A, TWIN_B, OTHER, entry({ number: 10, party: 'Inny' })];
  s.applyMailbox('odebrane', lista(listing));
  assert.equal(s.state.boxes['odebrane']?.entries.length, listing.length);
});

test('widok: appendMailboxPage z para blizniakow w obrebie strony dokleja OBU', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([OTHER]));
  const added = s.appendMailboxPage('odebrane', [TWIN_A, TWIN_B], false);
  assert.equal(added, 2, 'dwa wystapienia = dwa nowe wiersze');
  assert.equal(s.state.boxes['odebrane']?.entries.length, 3);
});

test('widok: appendMailboxPage zdejmuje wpis juz widoczny (sonda sciany)', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A]));
  // Sonda sciany odpytuje ponownie dzien graniczny: ten sam list.
  const added = s.appendMailboxPage('odebrane', [entry({ number: 40, party: 'Goniec' })], true);
  assert.equal(added, 0, 'wpis juz pokazany w widoku - bez drugiego wiersza');
  assert.equal(s.state.boxes['odebrane']?.entries.length, 1);
});

test('sync: swieza strona z 2 blizniakami przy 1 wierszu DOKLADA drugi wiersz', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A, OTHER]));
  // Serwer teraz pokazuje obu blizniakow (drugi dotarl).
  const r = s.syncMailboxPage('odebrane', [TWIN_A, TWIN_B, OTHER], false);
  assert.deepEqual(
    r && { added: r.added, removed: r.removed },
    { added: 1, removed: 0 },
    'jeden wiersz doklejony',
  );
  assert.equal(s.state.boxes['odebrane']?.entries.length, 3, 'para blizniakow = 2 wiersze');
});

test('sync: kompletny listing bez jednego blizniaka = jeden wiersz mniej', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A, TWIN_B, OTHER]));
  // Jeden blizniak czytany i skasowany - serwer raportuje 1 z 2.
  const r = s.syncMailboxPage('odebrane', [TWIN_A, OTHER], false);
  assert.deepEqual(
    r && { added: r.added, removed: r.removed },
    { added: 0, removed: 1 },
    'brakujacy blizniak usuniety z widoku',
  );
  assert.equal(s.state.boxes['odebrane']?.entries.length, 2);
});
