/**
 * Fala 29: dedup widoku skrzynki po kluczu tresci.
 *
 * Zgloszenie live 2026-10-31: po tabula rasa liczba wierszy zakladki
 * Listy (634/644) rozjezdza sie z licznikami Kontaktow/Archiwum
 * (631/635). Przyczyna (pelna analiza + sonda): dwie fizycznie rozne
 * listy o identycznych metadanych (nadawca|temat|forwarded|data) daja
 * DWA wiersze widoku (applyMailbox nie deduplikuje wcale,
 * appendMailboxPage nie deduplikuje w obrebie swiezej strony), a
 * archiwum merguje je w JEDNA grupe (upsertLetters po letterId,
 * totalLive liczy grupy contentKeyOf). Rozjazd jest trwaly - sync
 * trzyma wiersze, ktorych klucz jest na swiezej stronie.
 *
 * Ten plik to dowod RED: testy padaja na kodzie sprzed Fali 29.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailUiStore } from '../src/arkmail/ui/store';
import { fromMailboxEntry, upsertLetters } from '../src/arkmail/core/archive';
import { totalLive } from '../src/arkmail/core/archiveStats';
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

test('dedup: applyMailbox z para identycznych metadanych zostawia JEDEN wiersz', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A, TWIN_B, OTHER]));
  assert.equal(
    s.state.boxes['odebrane']?.entries.length,
    2,
    'dwa wiersze: grupa blizniakow + Inny temat',
  );
});

test('dedup: appendMailboxPage z para w obrebie strony dokleja tylko jednego blizniaka', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([OTHER]));
  const added = s.appendMailboxPage('odebrane', [TWIN_A, TWIN_B], false);
  assert.equal(added, 1, 'para o identycznym kluczu liczy sie raz');
  assert.equal(s.state.boxes['odebrane']?.entries.length, 2);
});

test('dedup: appendMailboxPage mieszany - duplikat istniejacy + nowy, dokleja tylko nowy', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A]));
  const added = s.appendMailboxPage('odebrane', [TWIN_B, OTHER], false);
  assert.equal(added, 1, 'TWIN_B znany (ta sama grupa), OTHER nowy');
  assert.equal(s.state.boxes['odebrane']?.entries.length, 2);
});

test('dedup: wiersze widoku == zywe grupy archiwum (zgoda licznikow per skrzynka)', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista([TWIN_A, TWIN_B, OTHER]));
  const letters = [TWIN_A, TWIN_B, OTHER].map((e) => fromMailboxEntry('odebrane', e));
  const merged = upsertLetters(s.state.archive, letters);
  s.setArchive(merged.letters);
  const viewRows = s.state.boxes['odebrane']?.entries.length ?? 0;
  const archiveGroups = totalLive(s.state.archive);
  assert.equal(
    viewRows,
    archiveGroups,
    `widok (${viewRows} wierszy) liczy jak archiwum (${archiveGroups} grup)`,
  );
});
