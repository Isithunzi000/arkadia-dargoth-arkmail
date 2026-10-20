/**
 * Idempotentne pobieranie tresci do archiwum (Fala 17c, zgloszenie
 * 2026-10-19/20 pkt 3).
 *
 * Blad z sesji: petla "Pobierz tresci" po przerwaniu zaczynala mielic
 * od nowa - w tym blizniacze rekordy tego samego listu (letterId
 * zawiera skrzynke, wiec list nieprzeczytany istnieje w archiwum
 * podwojnie: nieprzeczytane + odebrane) oraz zombie-wpisy listow,
 * ktorych serwer juz nie ma (kazdy restart petli mielil je do
 * timeoutu).
 *
 * Kontrakt:
 *  - kandydaci grupowani po kluczu TRESCI (party|subject|forwarded|
 *    dateRaw, bez skrzynki): blizniak pobierany RAZ, tresc laduje
 *    we wszystkich rekordach grupy; pobranie idzie przez skrzynke
 *    kanoniczna (odebrane dla listow przychodzacych) - rekord z
 *    "nieprzeczytane" po przeczytaniu znika z tego listingu, wiec
 *    re-kotwica po nim bylaby falszywym chybiem;
 *  - list, ktorego re-kotwica nie znajduje na swiezym listingu,
 *    dostaje znacznik missingOnServer i jest POMIJANY w kolejnych
 *    uruchomieniach petli; powrot listu do listingu (upsert) znacznik
 *    czysci;
 *  - podsumowanie petli raportuje znikniete listy osobno.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMailboxEntry,
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  textOf,
  type Harness,
} from './harness';

const ENTRY: MailboxEntry = {
  number: 1,
  isRead: true,
  subject: 'najnowszy',
  forwarded: false,
  party: 'Corge',
  partyKind: 'nadawca',
  date: {
    raw: 'Wt, 23 XII 2025, 00:11:12',
    weekday: 'Wt',
    day: 23,
    month: 12,
    year: 2025,
    time: '00:11:12',
  },
};

test('archiwum: powrot listu do listingu czysci znacznik missingOnServer', () => {
  const gone: ArchiveLetter = { ...fromMailboxEntry('odebrane', ENTRY), missingOnServer: true };
  const back = fromMailboxEntry('odebrane', ENTRY); // list znowu w listingu
  const res = upsertLetters([gone], [back]);
  assert.equal(res.updated, 1, 'aktualizacja, nie duplikat');
  assert.ok(res.letters[0].missingOnServer !== true, 'znacznik wyczyszczony po powrocie');
});

/** Swiezy przycisk pobierania (rerender tworzy nowy DOM). */
const downloadBtn = (h: Harness): { textContent: string; dispatchEvent(e: unknown): void } => {
  const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
    textContent: string;
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(b, 'przycisk pobierania istnieje');
  return b;
};

function replayListing3(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

function replayLetter(h: Harness, numer: number, subject: string, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

const letterBodyShows = (h: Harness, fragment: string): boolean =>
  !!h.content.querySelector('.arkmail-letter-body') &&
  textOf(h, '.arkmail-letter-body').includes(fragment);

/** Wszystkie wiersze archiwum z danym fragmentem tematu. */
function archiveRows(h: Harness, fragment: string): Array<{ dispatchEvent(e: unknown): void }> {
  const rows = Array.from(
    h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
      textContent?: string;
      dispatchEvent(e: unknown): void;
    }>,
  ).filter((r) => String(r.textContent ?? '').includes(fragment));
  return rows;
}

test('archiwum: blizniak nieprzeczytane/odebrane pobierany RAZ, tresc w obu rekordach', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h); // 3 rekordy odebranych BEZ tresci

    // Blizniak: ten sam list jeszcze nieprzeczytany = drugi rekord.
    // Uwaga: prolog juz raz pobieral nieprzeczytane - czekamy na NOWA
    // komende, nie na obecnosc w historii.
    const listingsBefore = f.sent.filter((c) => c === 'listy nieprzeczytane').length;
    click(h, '[data-box="nieprzeczytane"]');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === listingsBefore + 1,
      'nowy listing nieprzeczytanych',
    );
    f.fire('Listy nieprzeczytane:', 'mail');
    f.fire(' 1. Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec listingu');

    click(h, '[data-tab="archiwum"]');
    // Fala 18a: widok ZWIJA blizniaki do jednego wiersza (reprezentant
    // grupy) - rekordy w danych sa nadal dwa, dowodzi tego petla
    // pobierania (grupa = 1 kandydat) i cache ponizej.
    assert.equal(archiveRows(h, 'najnowszy').length, 1, 'blizniak zwiniety do jednego wiersza');

    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start
    // Grupa blizniakow = JEDEN kandydat: total 3, nie 4.
    await waitRt(
      () => downloadBtn(h).textContent.includes('(0/3)') || f.sent.length > 0,
      'start petli',
    );
    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica grupy');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt grupy blizniakow');
    replayLetter(h, 1, 'najnowszy', 'Tresc najnowszego.');

    await waitRt(() => f.sent.includes('listy odebrane przed 23 XII 2025'), 're-kotwica 2');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt 2');
    replayLetter(h, 2, 'srodkowy', 'Tresc srodkowego.');

    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 're-kotwica 3');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'odczyt 3');
    replayLetter(h, 3, 'najstarszy', 'Tresc najstarszego.');

    // Dokladnie 3 odczyty (blizniak NIE jest pobierany drugi raz).
    await waitRt(() => notifyText(f, 'Pobrano tresci do archiwum (listow: 3)'), 'podsumowanie');
    assert.equal(
      f.sent.filter((s) => s.startsWith('przeczytaj list')).length,
      3,
      'blizniak nie generuje drugiego odczytu',
    );
    assert.ok(
      !f.sent.some((s) => s.startsWith('listy nieprzeczytane przed')),
      'zadnej re-kotwicy po skrzynce nieprzeczytanych',
    );

    // Tresc w cache OBU rekordow blizniaczy (klik = podglad, zero komend).
    const base = f.sent.length;
    for (const row of archiveRows(h, 'najnowszy')) {
      row.dispatchEvent(new h.window.Event('click'));
      await waitRt(() => letterBodyShows(h, 'Tresc najnowszego.'), 'tresc z cache w blizniaku');
      click(h, '[data-tab="archiwum"]'); // powrot do listy archiwum
    }
    assert.equal(f.sent.length, base, 'podglad blizniakow bez komend');
  } finally {
    await stopHarness();
  }
});

test('archiwum: list znikniety z serwera dostaje znacznik i jest pomijany przy restarcie', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start

    // Listing BEZ najnowszego listu - serwer go juz nie ma (i nie
    // wraca: gdyby wrocil w kolejnym listingu, upsert zdjalby znacznik).
    const replayListingBezNajnowszego = (): void => {
      f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 2. *R* Temat: najstarszy', 'mail');
      f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
      f.fire(' 1. *R* Temat: srodkowy', 'mail');
      f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
      f.fire('> ', 'prompt');
    };

    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica 1');
    replayListingBezNajnowszego();

    // Petla jedzie dalej: srodkowy i najstarszy pobierane normalnie
    // (numery z listingu bez najnowszego: srodkowy = 1, najstarszy = 2).
    await waitRt(() => f.sent.includes('listy odebrane przed 23 XII 2025'), 're-kotwica 2');
    replayListingBezNajnowszego();
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt srodkowego');
    replayLetter(h, 1, 'srodkowy', 'Tresc srodkowego.');
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 're-kotwica 3');
    replayListingBezNajnowszego();
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt najstarszego');
    replayLetter(h, 2, 'najstarszy', 'Tresc najstarszego.');

    await waitRt(() => notifyText(f, 'zniknely z serwera: 1'), 'podsumowanie ze zniknietym');

    // Restart petli: znikniety list jest POMIJANY (znacznik), kandydatow
    // brak - toast o kompletnym archiwum, zadna re-kotwica nie wylatuje.
    const sentBefore = f.sent.length;
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start
    // Fala 18c (swiadoma zmiana pinu): jasny toast o kompletnej bazie.
    await waitRt(() => notifyText(f, 'Wszystkie listy w bazie maja tresci.'), 'brak kandydatow po znaczniku');
    assert.equal(
      f.sent.filter((s) => s === 'listy odebrane przed 24 XII 2025').length,
      1,
      'znikniety list nie jest mielony ponownie',
    );
    assert.equal(f.sent.length, sentBefore, 'restart bez komend');
  } finally {
    await stopHarness();
  }
});
