/**
 * Idempotentne pobieranie tresci do archiwum (Fala 17c + Fala 41).
 *
 * Fala 17c: po przerwaniu petla nie mielila od nowa zombie-wpisow
 * listow, ktorych serwer juz nie ma.
 *
 * Kontrakt (Fala 41, per rekord):
 *  - kandydatem jest KAZDY rekord z pusta trescia i prawidlowa data;
 *    blizniak o identycznych metadanych ma wlasny odczyt ze swojego
 *    wiersza i tresc laduje dokladnie w swoim rekordzie,
 *  - re-kotwica wybiera wiersz PO archiveId rekordu; brak wiersza o
 *    tej tozsamosci = missing: rekord fizycznie wypada z archiwum
 *    (Fala 28), a petla probuje pozostale skrzynki (replica moze
 *    istniec gdzie indziej); blizniak o tych samych metadanych
 *    zostaje nietkniety,
 *  - blad (timeout, blad serwera) KONCZY proby rekordu - ta sama siec
 *    i serwer obsluguja wszystkie skrzynki,
 *  - podsumowanie petli raportuje znikniete listy osobno.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMailboxEntry,
  purgeGoneLetters,
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import { ANCHOR_RETRY_WAITS_MS } from '../src/arkmail/core/pagination';
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

/**
 * Kompletny listing odebranych (bez suffixu uciecia) z 3 wpisami
 * prologu - odpowiedz na indeksacje poprzedzajaca kazde pobieranie
 * tresci (decyzja 2026-10-23).
 */
const LISTING3_FULL = [
  'Listy odebrane:',
  ' 3. *R* Temat: najstarszy',
  'Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04',
  ' 2. *R* Temat: srodkowy',
  'Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05',
  ' 1. *R* Temat: najnowszy',
  'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12',
];

const ENTRY: MailboxEntry = {
  number: 1,
  isRead: true,
  subject: 'najnowszy',
  forwarded: false,
  party: 'Corge',
  partyKind: 'nadawca',
  date: {
    raw: 'Wt, 24 VIII 1999, 00:11:12',
    weekday: 'Wt',
    day: 24,
    month: 8,
    year: 1999,
    time: '00:11:12',
  },
};

test('archiwum: list purgowany wraca listingiem (upsert odtwarza rekord)', () => {
  const gone: ArchiveLetter = { ...fromMailboxEntry('odebrane', ENTRY), missingOnServer: true };
  const purged = purgeGoneLetters([gone], 'odebrane', new Set());
  assert.equal(purged.letters.length, 0, 'zombie fizycznie usuniety');
  const back = fromMailboxEntry('odebrane', ENTRY); // list znowu w listingu
  const res = upsertLetters(purged.letters, [back]);
  assert.equal(res.updated, 0, 'czysty insert - nie bylo czego aktualizowac');
  assert.equal(res.letters.length, 1, 'rekord odtworzony listingiem');
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
  f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

function replayLetter(h: Harness, numer: number, subject: string, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
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

test('archiwum: blizniak nieprzeczytane/odebrane - per rekord, kazdy z wlasna trescia', async () => {
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
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec listingu');

    click(h, '[data-tab="archiwum"]');
    // Widok ZWIJA blizniaki do jednego wiersza (reprezentant grupy),
    // ale w danych sa DWA rekordy i kazdy z nich jest kandydatem
    // do pobrania (Fala 41: per rekord, nie per grupa).
    assert.equal(archiveRows(h, 'najnowszy').length, 1, 'blizniak zwiniety do jednego wiersza');

    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start

    // Napedzanie zalezne od kolejnosci kandydatow (blizniaki maja te
    // sama date, wiec ich kolejnosc po id - obie prawidlowe). Kierunek
    // odpowiedzi: nieprzeczytane pierwszy raz = listing z listem, kazde
    // kolejne = pusto (po odczycie listu nieprzeczytanych juz nie ma);
    // odebrane = pelny listing; pozostale skrzynki = pusto.
    let unreadAnswered = false;
    let idx = f.sent.length;
    const subjectOf = (n: number): string =>
      n === 1 ? 'najnowszy' : n === 2 ? 'srodkowy' : 'najstarszy';
    const bodyOf = (n: number): string =>
      n === 1 ? 'Tresc najnowszego.' : n === 2 ? 'Tresc srodkowego.' : 'Tresc najstarszego.';
    for (let guard = 0; ; guard++) {
      assert.ok(guard < 4000, 'napedzanie pobierania nie dokonczylo sie');
      if (notifyText(f, 'Pobrano tresci')) break;
      if (f.sent.length <= idx) {
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      const cmd = f.sent[idx]!;
      idx++;
      if (cmd.startsWith('listy nieprzeczytane przed')) {
        if (!unreadAnswered) {
          unreadAnswered = true;
          f.fire('Listy nieprzeczytane:', 'mail');
          f.fire(' 1. Temat: najnowszy', 'mail');
          f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
        } else {
          f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
        }
        f.fire('> ', 'prompt');
      } else if (cmd.startsWith('listy odebrane przed')) {
        replayListing3(h);
      } else if (cmd.startsWith('listy wyslane przed')) {
        f.fire('Nie masz zadnych wyslanych listow.', 'mail');
        f.fire('> ', 'prompt');
      } else if (cmd.startsWith('listy niewyslane przed')) {
        f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
        f.fire('> ', 'prompt');
      } else if (cmd.startsWith('przeczytaj list')) {
        const n = Number(cmd.split(' ').pop());
        replayLetter(h, n, subjectOf(n), bodyOf(n));
      }
    }

    // 4 kandydaci = 4 odczyty (replica NIE jest zasypywana trescia
    // brata - ma wlasny odczyt ze swojej skrzynki).
    await waitRt(() => notifyText(f, 'Pobrano tresci do archiwum (4 listy)'), 'podsumowanie');
    assert.ok(
      notifyText(f, 'Pobrano tresci do archiwum (4 listy)'),
      'kazdy rekord-blizniak pobrany osobno',
    );

    // Tresc w cache rekordu reprezentanta (klik = podglad, zero komend).
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


test('archiwum: list znikniety z serwera jest purgowany i pomijany przy restarcie', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start

    // Listing BEZ najnowszego listu - serwer go juz nie ma (i nie
    // wraca: gdyby wrocil w kolejnym listingu, upsert odtworzylby
    // purgowany rekord).
    const replayListingBezNajnowszego = (): void => {
      f.fire('Listy odebrane:', 'mail');
      f.fire(' 2. *R* Temat: najstarszy', 'mail');
      f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
      f.fire(' 1. *R* Temat: srodkowy', 'mail');
      f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
      f.fire('> ', 'prompt');
    };

    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica 1');
    replayListingBezNajnowszego();

    // Fala 41: missing z odebranych zamyka sie dopiero po probie
    // pozostalych skrzynek (replica moze istniec gdzie indziej) - 3
    // kolejne kotwice z pustymi listingami.
    const emptyLine: Record<string, string> = {
      nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
      wyslane: 'Nie masz zadnych wyslanych listow.',
      niewyslane: 'Nie masz zadnych niewyslanych listow.',
    };
    for (const box of ['nieprzeczytane', 'wyslane', 'niewyslane']) {
      await waitRt(
        () => f.sent.some((c) => c.startsWith(`listy ${box} przed`)),
        `kotwica missing: ${box}`,
      );
      f.fire(emptyLine[box]!, 'mail');
      f.fire('> ', 'prompt');
    }

    // Petla jedzie dalej: srodkowy i najstarszy pobierane normalnie
    // (numery z listingu bez najnowszego: srodkowy = 1, najstarszy = 2).
    await waitRt(() => f.sent.includes('listy odebrane przed 24 VIII 1999'), 're-kotwica 2');
    replayListingBezNajnowszego();
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt srodkowego');
    replayLetter(h, 1, 'srodkowy', 'Tresc srodkowego.');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 're-kotwica 3');
    replayListingBezNajnowszego();
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt najstarszego');
    replayLetter(h, 2, 'najstarszy', 'Tresc najstarszego.');

    await waitRt(() => notifyText(f, 'nie ma juz w skrzynce: 1'), 'podsumowanie ze zniknietym');

    // Restart: rekord purgowany nie istnieje, kandydatow brak, zadna
    // nowa re-kotwica nie wylatuje.
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start
    await waitRt(() => notifyText(f, 'Wszystkie listy w bazie maja tresci.'), 'brak kandydatow po znaczniku');
    assert.equal(
      f.sent.filter((s) => s === 'listy odebrane przed 25 VIII 1999').length,
      1,
      'znikniety list nie jest mielony ponownie',
    );
    // 6 kotwic pobierania: 3 proby odebrane (kazdy kandydat) + 3 kotwice
    // missing po pozostalych skrzynkach. Restart nie dodaje zadnej.
    assert.equal(
      f.sent.filter((s) => / przed \d+ [IVX]+ \d{4}$/.test(s)).length,
      6,
      'restart bez nowych re-kotwic pobierania',
    );
  } finally {
    await stopHarness();
  }
});


test('archiwum: luka podczas re-kotwicy jest bledem, nie zniknieciem listu', async () => {
  const retries = ANCHOR_RETRY_WAITS_MS.splice(0);
  const h = await startHarness();
  const { f } = h;
  const first = 'listy odebrane przed 25 VIII 1999';
  const second = 'listy odebrane przed 24 VIII 1999';
  const count = (command: string): number => f.sent.filter((c) => c === command).length;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    downloadBtn(h).dispatchEvent(new h.window.Event('click'));
    downloadBtn(h).dispatchEvent(new h.window.Event('click'));

    await waitRt(() => count(first) === 1, 're-kotwica przy luce');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 4. *R* Temat: inny', 'mail');
    f.fire('Nadawca: Foo Wt, 24 VIII 1999, 01:00:00', 'mail');
    f.fire('> ', 'prompt');

    await waitRt(() => count(first) === 2 || count(second) === 1, 'powtorzenie strony albo stary brak listu');
    if (count(first) === 2) {
      f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 4. *R* Temat: inny', 'mail');
      f.fire('Nadawca: Foo Wt, 24 VIII 1999, 01:00:00', 'mail');
      f.fire('> ', 'prompt');
      await waitRt(() => count(second) === 1, 'sonda wykluczajaca dzien');
      f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
      f.fire('> ', 'prompt');
      await waitRt(() => count(second) === 2, 're-kotwica srodkowego po luce');
    }

    f.fire('Listy odebrane:', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt srodkowego');
    replayLetter(h, 2, 'srodkowy', 'Tresc srodkowego.');

    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 're-kotwica najstarszego');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'odczyt najstarszego');
    replayLetter(h, 3, 'najstarszy', 'Tresc najstarszego.');

    await waitRt(() => notifyText(f, 'Pobrano tresci (2 z 3;'), 'podsumowanie po luce');
    assert.ok(notifyText(f, 'nieudane: 1'), 'luka jest nieudana lokalizacja');
    assert.ok(!notifyText(f, 'nie ma juz w skrzynce'), 'luka nie jest dowodem znikniecia');
    assert.equal(archiveRows(h, 'najnowszy').length, 1, 'list pozostaje widoczny w Archiwum');
  } finally {
    ANCHOR_RETRY_WAITS_MS.push(...retries);
    await stopHarness();
  }
});
