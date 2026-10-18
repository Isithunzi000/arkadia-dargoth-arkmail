/**
 * MailUiStore: czysty view-model UI (zero DOM). Zakladki, skrzynki,
 * badge nieprzeczytanych, pasek "operacja w toku", otwarty list,
 * tryb wide (split >= 900px): na waskim otwarcie listu przelacza
 * zakladke na 'list', na szerokim list zostaje w podziale obok.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxResult } from '../src/arkmail/core/session/mailbox';
import type { LetterContent } from '../src/arkmail/core/session/pager';

function lista(box: 'odebrane' | 'nieprzeczytane', entries: Partial<import('../src/arkmail/core/session/mailbox').MailboxEntry>[]): MailboxResult {
  return {
    kind: 'lista',
    header: { box, truncated: false },
    entries: entries.map((e, i) => ({
      number: i + 1,
      isRead: true,
      subject: `t${i}`,
      forwarded: false,
      party: 'X',
      partyKind: 'nadawca',
      date: null,
      ...e,
    })),
  };
}

function letter(): LetterContent {
  return { number: 3, from: 'Foo', subject: 'Perly', to: 'Gracz', cc: null, date: null, body: ['czesc'] };
}

test('ui: stan poczatkowy', () => {
  const s = new MailUiStore();
  assert.equal(s.state.tab, 'listy');
  assert.equal(s.state.activeBox, 'odebrane');
  assert.equal(s.state.badge, 0);
  assert.equal(s.state.busy, null);
  assert.equal(s.state.letter, null);
  assert.equal(s.state.wide, false);
});

test('ui: setTab emituje do subskrybenta, unsubscribe odcina', () => {
  const s = new MailUiStore();
  const seen: string[] = [];
  const off = s.subscribe((st) => seen.push(st.tab));
  s.setTab('napisz');
  s.setTab('kontakty');
  off();
  s.setTab('archiwum');
  assert.deepEqual(seen, ['napisz', 'kontakty']);
});

test('ui: badge z listingu nieprzeczytanych ma pierwszenstwo', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista('odebrane', [{ isRead: false }, { isRead: false }, {}]));
  assert.equal(s.state.badge, 2, 'fallback: nieprzeczytane z odebranych');
  s.applyMailbox('nieprzeczytane', lista('nieprzeczytane', [{ isRead: false }]));
  assert.equal(s.state.badge, 1, 'listing nieprzeczytanych wygrywa');
});

test('ui: pusta skrzynka ustawia znacznik i zeruje badge gdy dotyczy', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista('odebrane', [{ isRead: false }]));
  assert.equal(s.state.badge, 1);
  s.applyMailbox('nieprzeczytane', { kind: 'pusta', box: 'nieprzeczytane', reason: 'puste' });
  const view = s.state.boxes.nieprzeczytane;
  assert.ok(view);
  assert.equal(view.empty, 'puste');
  assert.equal(view.entries.length, 0);
  assert.equal(s.state.badge, 0);
});

test('ui: openLetter na waskim przelacza na zakladke list', () => {
  const s = new MailUiStore();
  s.openLetter('odebrane', letter());
  assert.equal(s.state.tab, 'list');
  assert.equal(s.state.letter?.from, 'Foo');
  assert.equal(s.state.letter?.box, 'odebrane');
  s.closeLetter();
  assert.equal(s.state.tab, 'listy');
  assert.equal(s.state.letter, null);
});

test('ui: openLetter na szerokim zostaje w podziale (tab bez zmian)', () => {
  const s = new MailUiStore();
  s.setWide(true);
  s.openLetter('odebrane', letter());
  assert.equal(s.state.tab, 'listy');
  assert.ok(s.state.letter);
});

test('ui: setWide(false) w trakcie czytania przenosi list do zakladki list', () => {
  const s = new MailUiStore();
  s.setWide(true);
  s.openLetter('odebrane', letter());
  assert.equal(s.state.tab, 'listy');
  s.setWide(false);
  assert.equal(s.state.wide, false);
  assert.equal(s.state.tab, 'list', 'na waskim czytany list ma pelny panel');
  assert.ok(s.state.letter, 'list nie ginie przy flipie');
});

test('ui: setWide(true) w trakcie czytania wraca do podzialu', () => {
  const s = new MailUiStore();
  s.openLetter('odebrane', letter());
  assert.equal(s.state.tab, 'list');
  s.setWide(true);
  assert.equal(s.state.tab, 'listy', 'na szerokim list wraca do podzialu');
  assert.ok(s.state.letter, 'list nie ginie przy flipie');
});

test('ui: setWide bez otwartego listu nie rusza zakladki', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  s.setWide(true);
  assert.equal(s.state.tab, 'kontakty');
  s.setWide(false);
  assert.equal(s.state.tab, 'kontakty');
});

test('ui: busy ustawia i czysci opis operacji', () => {
  const s = new MailUiStore();
  s.setBusy('Czytam list 3...');
  assert.equal(s.state.busy, 'Czytam list 3...');
  s.setBusy(null);
  assert.equal(s.state.busy, null);
});

test('ui: preferencje compose (szablon, szerokosc)', () => {
  const s = new MailUiStore();
  assert.equal(s.state.composeTemplate, 'plain');
  assert.equal(s.state.composeWidth, 60);
  s.setCompose({ template: 'parchment', width: 80 });
  assert.equal(s.state.composeTemplate, 'parchment');
  assert.equal(s.state.composeWidth, 80);
});

test('ui: kontakty i archiwum trafiaja do stanu', () => {
  const s = new MailUiStore();
  s.setContacts([{ name: 'Foo', sources: ['korespondencja'], lettersReceived: 2, lettersSent: 1 }]);
  s.setArchive([]);
  assert.equal(s.state.contacts[0].name, 'Foo');
  assert.deepEqual(s.state.archive, []);
});

test('ui: appendMailboxPage dokleja starsza strone PRZED istniejace (dedup, kolejnosc serwera)', () => {
  const s = new MailUiStore();
  const d = (raw: string) => ({
    raw,
    weekday: raw.slice(0, 2),
    day: 1,
    month: 12,
    year: 2025,
    time: '10:00:00',
  });
  s.applyMailbox('odebrane', lista('odebrane', [
    { number: 2, party: 'Foo', subject: 'B', date: d('Pn, 22 XII 2025, 02:20:05') },
    { number: 1, party: 'Corge', subject: 'A', date: d('Wt, 23 XII 2025, 00:11:12') },
  ]));
  // strona starszych: jeden nowy (C) + duplikat istniejacego (B)
  s.appendMailboxPage('odebrane', [
    {
      number: 50, isRead: true, subject: 'C', forwarded: false,
      party: 'Waldo', partyKind: 'nadawca', date: d('N, 14 XII 2025, 10:00:00'),
    },
    {
      number: 49, isRead: true, subject: 'B', forwarded: false,
      party: 'Foo', partyKind: 'nadawca', date: d('Pn, 22 XII 2025, 02:20:05'),
    },
  ], true);
  const v = s.state.boxes.odebrane!;
  assert.equal(v.entries.length, 3);
  assert.equal(v.entries[0].subject, 'C', 'starsza strona laduje PRZED (kolejnosc serwera: najstarszy pierwszy)');
  assert.equal(v.entries[1].subject, 'B');
  assert.equal(v.truncated, true, 'strona pelna - sa dalsze');
  s.appendMailboxPage('odebrane', [], false);
  assert.equal(s.state.boxes.odebrane!.truncated, false, 'koniec starszych - przycisk znika');
});

test('setLoadAll: stan petli wczytywania wszystkich (skrzynka + strona)', () => {
  const s = new MailUiStore();
  assert.equal(s.state.loadAll, null, 'domyslnie brak petli');
  s.setLoadAll({ box: 'odebrane', pages: 2 });
  assert.deepEqual(s.state.loadAll, { box: 'odebrane', pages: 2 });
  s.setLoadAll(null);
  assert.equal(s.state.loadAll, null);
});

// --- Fala 8g: tryb wynikow szukania (stash pelnego widoku) --------------------

test('search: applySearchResults chowa pelny widok, clearSearch go przywraca', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista('odebrane', [{ subject: 'A' }, { subject: 'B' }]));
  s.setSearch({ box: 'odebrane', label: 'odebrane, nadawca: Bar' });
  s.applySearchResults('odebrane', lista('odebrane', [{ subject: 'A' }]));
  assert.equal(s.state.boxes.odebrane!.entries.length, 1, 'widok = wyniki szukania');
  assert.equal(s.state.search?.box, 'odebrane');
  assert.equal(s.state.search?.label, 'odebrane, nadawca: Bar');

  // Powtorne szukanie na tej samej skrzynce NIE nadpisuje schowka wynikami.
  s.applySearchResults('odebrane', lista('odebrane', []));
  assert.equal(s.state.boxes.odebrane!.entries.length, 0);
  s.clearSearch('odebrane');
  assert.equal(s.state.boxes.odebrane!.entries.length, 2, 'przywrocony PELNY widok (bez refetchu)');
  assert.equal(s.state.boxes.odebrane!.entries[0].subject, 'A');
  assert.equal(s.state.search, null);
});

test('search: clearSearchBoxes kasuje szukanie bez przywracania (swiezy refresh nadpisuje)', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', lista('odebrane', [{ subject: 'A' }]));
  s.setSearch({ box: 'odebrane', label: 'x' });
  s.applySearchResults('odebrane', lista('odebrane', []));
  s.clearSearchBoxes(['odebrane']);
  assert.equal(s.state.search, null, 'szukanie skasowane');
  s.applyMailbox('odebrane', lista('odebrane', [{ subject: 'NOWY' }]));
  assert.equal(s.state.boxes.odebrane!.entries[0].subject, 'NOWY', 'refresh pisze po czystym widoku');
});
