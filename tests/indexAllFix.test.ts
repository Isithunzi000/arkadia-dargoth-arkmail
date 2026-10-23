/**
 * Fala 19a (zgloszenie 2026-10-20, wieczor): indeksacja stawala na
 * "2 z 4" i nigdy nie dojezdzala.
 *
 * Przyczyny (zweryfikowane w kodzie i logach):
 * - pusta odpowiedz z reason 'filtr' ("Nie znaleziono zadnych takich
 *   wyslanych listow.") byla traktowana jako niepowodzenie, a jest
 *   kompletna prawda: na pustej skrzynce (wariant serwera) albo na
 *   pustej stronie kotwicowej (brak starszych = koniec paginacji,
 *   jak w loadAll). Straznik desynchronizacji w mailbox.fetch i tak
 *   odfiltrowuje odpowiedzi za inne skrzynki;
 * - skrzynka niedomknieta (mielenie kotwicy / limit stron) zabijala
 *   cala petle bez wyjasnienia - teraz petla jedzie dalej, a raport
 *   koncowy wymienia pominiete skrzynki z powodem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_PACE_MS, INDEX_ANCHOR_RETRY_WAITS_MS } from '../src/arkmail/index';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  waitRt,
  click,
  notifyText,
  textOf,
  type Harness,
} from './harness';

/** Indeksacja z klikiem w przycisk archiwum; zwraca nic - replay leci w tescie. */
async function startIndexing(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
  click(h, '.arkmail-index-all');
}

test('pusta skrzynka wariantem "Nie znaleziono..." tez dostaje flage (4/4)', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    // odebrane (2. wystapienie komendy - pierwsze z prologu): kompletne
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 2. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // nieprzeczytane (2. wystapienie): puste wariantem bazowym
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    // wyslane: puste WARIANTEM FILTROWANYM (realne zachowanie serwera -
    // "Wybrane listy wyslane" w logach 2026-10-18) - przed Fala 19a
    // zabijalo petle bez flagi.
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    f.fire('Nie znaleziono zadnych takich wyslanych listow.', 'mail');
    // niewyslane: puste wariantem bazowym
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'toast 4/4');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
    // Kontakty odblokowane (wszystkie 4 flagi).
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'kontakty po 4/4');
  } finally {
    await stopHarness();
  }
});

test('pusta strona kotwicowa (reason "filtr") domyka skrzynke z flaga', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    // odebrane: strona 1 TRUNCATED (suffix), potem kotwica pusta
    // wariantem filtrowanym = brak starszych = koniec skrzynki.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'kotwica odebrane');
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    // reszta pusta wariantem bazowym
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'toast 4/4');
  } finally {
    await stopHarness();
  }
});

test('skrzynka z mieleniem kotwicy: 3 proby z klepnieciem + sonda wykluczajaca dzien, potem pomijana (Fala 24d/26c)', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    // odebrane: kompletne od razu.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // nieprzeczytane: puste.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    // wyslane: truncated, a kotwica zwraca IDENTYCZNA strone (te same
    // id) - straznik mielenia. Skrzynka pomijana BEZ flagi, petla
    // musi dojechac niewyslane.
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    const replaySameWyslane = () => {
      f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 1. Temat: paczka', 'mail');
      f.fire('Odbiorcy: Bar                           Wt, 20 XII 2025, 09:00:00', 'mail');
      f.fire('> ', 'prompt');
    };
    replaySameWyslane();
    await waitRt(() => f.sent.includes('listy wyslane przed 21 XII 2025'), 'kotwica wyslane');
    // Fala 24d: kazdy duplikat strony dostaje probe: pauza (2,5 s, potem
    // 4 s) + klepniecie listingu bazowego (odswieza kontekst serwera),
    // dopiero potem powtorka kotwicy. Trzy proby; czwarty duplikat
    // z rzedu = serwer muli, skrzynka pomijana.
    const proba = async (nr: number) => {
      replaySameWyslane(); // duplikat strony kotwicowej (freshCount 0)
      await waitRt(
        () => f.sent.filter((c) => c === 'listy wyslane').length === 1 + nr,
        `klepniecie ${nr} (listing bazowy wyslane)`,
      );
      replaySameWyslane(); // odpowiedz na klepniecie (wynik pomijany)
      await waitRt(
        () => f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length === 1 + nr,
        `powtorka kotwicy ${nr}`,
      );
    };
    await proba(1);
    await proba(2);
    await proba(3);
    replaySameWyslane(); // czwarty duplikat z rzedu
    // Fala 26c: zanim plugin uzna mielenie, strzela SONDE kotwica
    // wykluczajaca dzien graniczny ("przed 20 XII" zamiast "przed
    // 21 XII"). Tu serwer odpowiada na nia TYM SAMYM dniem, ktory
    // sonda wyklucza - zlamany filtr daty = dopiero to jest trwale
    // mielenie.
    await waitRt(
      () => f.sent.includes('listy wyslane przed 20 XII 2025'),
      'sonda wykluczajaca dzien graniczny (Fala 26c)',
    );
    replaySameWyslane(); // serwer ignoruje wykluczenie dnia = muli naprawde
    // niewyslane: puste - pominiecie wyslanych nie moze zabic petli.
    // (prolog NIE pobiera niewyslanych - pierwsze 'listy niewyslane'
    // jest z indeksacji).
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane po pominieciu');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    // Raport: niekompletne, wymienia wyslane z powodem; brama kontaktow
    // nadal zamknieta (3/4 flagi). Fala 20c: powod PO LUDZKU, zero
    // zargonu ("kotwica", "postep") w komunikatach dla gracza.
    await waitRt(
      () => notifyText(f, 'pominiete: wyslane (serwer chwilowo muli - sprobuj ponownie za chwile)'),
      'raport z powodem pomieciecia',
    );
    assert.ok(
      !notifyText(f, 'kotwica') && !notifyText(f, 'postepu'),
      'raport bez zargonu technicznego',
    );
    // Fala 24d: test trwa > 10 s (pauzy prob 2,5 + 4 + 4 s), wiec z
    // prologu odpala sie opozniony retry skrzynki odbiorczej
    // (DELAYED_INBOX_RETRY_MS = 10 s) - kolejkuje sie pod blokada i
    // wychodzi po indeksacji. Odpowiadamy na niego, inaczej pasek
    // busy nigdy nie zniknie.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 3,
      'opozniony retry: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 3,
      'opozniony retry: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'brama nadal obecna');
    // Fala 24a: kontakty sa widoczne ZAWSZE (brama = wskazowka nad
    // lista, nie zamiast niej) - przy 3/4 flag lista juz pokazuje
    // kontakty z czesciowego archiwum.
    assert.ok(h.content.querySelector('.arkmail-contact'), 'kontakty widoczne przy 3/4 (Fala 24a)');
  } finally {
    await stopHarness();
  }
});

test('tempo stron w indeksacji: 400 ms miedzy stronami (Fala 24d)', async () => {
  // Fala 20d podniosla tempo indeksacji do 800 ms, bo petla mielila
  // wolny serwer (throttle "Listy sa w tej chwili ladowane.",
  // zgloszenie 2026-10-21). Fala 24d zdejmuje przyczyne: duplikat
  // strony dostaje do 3 prob z klepnieciem listingu bazowego i pauzami
  // 2,5 s -> 4 s, wiec tempo stron wraca do 400 ms (jak loadAll).
  assert.equal(INDEX_PACE_MS, 400, 'stala tempa indeksacji');
  assert.deepEqual(
    INDEX_ANCHOR_RETRY_WAITS_MS,
    [2500, 4000, 4000],
    'pauzy prob powtorki kotwicy (Fala 24d)',
  );
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    const t0 = Date.now();
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'kotwica odebrane');
    const dt = Date.now() - t0;
    assert.ok(dt >= 350, `pauza przed kotwica ${dt} ms < 350 ms`);
    // Domkniecie: kotwica pusta, reszta skrzynek pusta - czysty koniec.
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'toast 4/4');
  } finally {
    await stopHarness();
  }
});

test('incydentalny duplikat strony kotwicowej: klepniecie + retry ratuja skrzynke (Fala 24d)', async () => {
  // Zgloszenie 2026-10-21 "pominiete wyslane / 3-4": duplikat strony
  // (np. powtorka odpowiedzi serwera) byl traktowany jak trwale
  // mielenie kotwicy i skrzynka byla pomijana. Fala 20b: jeden
  // duplikat = incydent (retry kotwicy). Fala 24d: przed powtorka
  // kotwicy plugin klepie listing bazowy (odswieza kontekst serwera,
  // Fala 14f) po pauzie 2,5 s; do 3 prob, potem pominiecie.
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    // odebrane: kompletne od razu.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // nieprzeczytane: puste.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    // wyslane: strona 1 truncated...
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    const pageOne = () => {
      f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 1. Temat: paczka', 'mail');
      f.fire('Odbiorcy: Bar                           Wt, 20 XII 2025, 09:00:00', 'mail');
      f.fire('> ', 'prompt');
    };
    pageOne();
    await waitRt(() => f.sent.includes('listy wyslane przed 21 XII 2025'), 'kotwica wyslane');
    // ...kotwica #1: DUPLIKAT strony (incydent, freshCount 0)...
    pageOne();
    // ...plugin NIE powtarza kotwicy od razu: najpierw pauza 2,5 s
    // i klepniecie listingu bazowego (kolejnosc komend ma znaczenie).
    const t0 = Date.now();
    await waitRt(
      () => f.sent.filter((c) => c === 'listy wyslane').length === 2,
      'klepniecie listingu bazowego przed powtorka kotwicy',
    );
    const dt = Date.now() - t0;
    assert.ok(dt >= 2400, `pauza przed klepnieciem ${dt} ms < 2400 ms`);
    assert.equal(
      f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length,
      1,
      'powtorka kotwicy dopiero PO klepnieciu',
    );
    pageOne(); // odpowiedz na klepniecie (wynik pomijany)
    // ...dopiero teraz powtorka kotwicy...
    await waitRt(
      () => f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length === 2,
      'retry kotwicy po klepnieciu',
    );
    // ...kotwica #2: dobra strona z NOWYM wpisem (truncated)...
    f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. Temat: stara paczka', 'mail');
    f.fire('Odbiorcy: Gracz                           Pn, 19 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    // ...paginacja jedzie dalej, kotwica #3 pusta = koniec skrzynki.
    await waitRt(() => f.sent.includes('listy wyslane przed 20 XII 2025'), 'kotwica 2 wyslane');
    f.fire('Nie znaleziono zadnych takich wyslanych listow.', 'mail');
    // niewyslane: puste - pelne 4/4 mimo incydentu na wyslanych.
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'toast 4/4');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
  } finally {
    await stopHarness();
  }
});

test('ponad 50 listow jednego dnia: starsze dni sa pobierane, a luka jest zapisana', async () => {
  // Zgloszenie 2026-10-22: strona jednodniowa + ucieta ("pierwsze 50",
  // wszystkie wpisy z 20 XII) - kotwica "przed 21 XII" strukturalnie
  // zwraca TA SAMA strone (serwer wyklucza tylko dzien graniczny),
  // wiec strażnik mielenia pomijal skrzynke z komunikatem "serwer
  // chwilowo muli", mimo ze dane byly kompletne. Fala 26c: po
  // wyczerpaniu prob z klepnieciem plugin strzela sonde kotwica
  // WYKLUCZAJACA dzien graniczny ("przed 20 XII"). Swieze starsze
  // wpisy = to byla sciana, nie mielenie - paginacja jedzie dalej.
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    // odebrane: kompletne od razu.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // nieprzeczytane: puste.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    // wyslane: strona jednodniowa ucieta, kotwica zwraca duplikaty.
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    const replaySameWyslane = () => {
      f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 1. Temat: paczka', 'mail');
      f.fire('Odbiorcy: Bar                           Wt, 20 XII 2025, 09:00:00', 'mail');
      f.fire('> ', 'prompt');
    };
    replaySameWyslane();
    await waitRt(() => f.sent.includes('listy wyslane przed 21 XII 2025'), 'kotwica wyslane');
    const proba = async (nr: number) => {
      replaySameWyslane();
      await waitRt(
        () => f.sent.filter((c) => c === 'listy wyslane').length === 1 + nr,
        `klepniecie ${nr} (listing bazowy wyslane)`,
      );
      replaySameWyslane();
      await waitRt(
        () => f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length === 1 + nr,
        `powtorka kotwicy ${nr}`,
      );
    };
    await proba(1);
    await proba(2);
    await proba(3);
    replaySameWyslane(); // czwarty duplikat z rzedu
    // Sonda wykluczajaca dzien graniczny.
    await waitRt(
      () => f.sent.includes('listy wyslane przed 20 XII 2025'),
      'sonda "przed D" (Fala 26c)',
    );
    // ...odpowiada SWIEZA starsza strona (nieucieta) = sciana
    // pokonana, skrzynka kompletna.
    f.fire('Listy wyslane:', 'mail');
    f.fire(' 1. Temat: stara paczka', 'mail');
    f.fire('Odbiorcy: Gracz                           Pn, 19 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    // niewyslane: puste.
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    // Starsze dni sa dostepne, ale czesc dnia granicznego pozostaje nieznana.
    await waitRt(() => notifyText(f, 'Indeksowanie niekompletne'), 'uczciwy raport');
    assert.ok(notifyText(f, 'ponad 50 listow z dnia 2025-12-20'), 'raport wskazuje luke');
    assert.ok(!notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'brak falszywego kompletu');
    assert.ok(!notifyText(f, 'muli'), 'bez falszywego komunikatu o mieleniu');
    // Opozniony retry skrzynki odbiorczej z prologu (test > 10 s).
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 3,
      'opozniony retry: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 3,
      'opozniony retry: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-gaps'), 'zapisana luka w widoku');
    assert.ok(textOf(h, '.arkmail-index-gaps').includes('wyslane: 2025-12-20'), 'dzien i skrzynka luki');
  } finally {
    await stopHarness();
  }
});

test('ponad 50 listow jednego dnia bez starszych wpisow: luka, nie komplet', async () => {
  // Dokladny przypadek ze zgloszenia 2026-10-22: strona jednodniowa
  // ucieta, starszych listow na serwerze NIE MA - sonda wykluczajaca
  // dzien graniczny dostaje pusta odpowiedz wariantem filtrowanym
  // ("Nie znaleziono..."), co jest kompletna prawda o skrzynce
  // (Fala 19a). Skrzynka dostaje flage, raport koncowy jest pelny -
  // zadne "pominiete: wyslane (serwer chwilowo muli...)".
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await startIndexing(h);
    // odebrane: kompletne od razu.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // nieprzeczytane: puste.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    // wyslane: strona jednodniowa ucieta, kotwica zwraca duplikaty.
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    const replaySameWyslane = () => {
      f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 1. Temat: paczka', 'mail');
      f.fire('Odbiorcy: Bar                           Wt, 20 XII 2025, 09:00:00', 'mail');
      f.fire('> ', 'prompt');
    };
    replaySameWyslane();
    await waitRt(() => f.sent.includes('listy wyslane przed 21 XII 2025'), 'kotwica wyslane');
    const proba = async (nr: number) => {
      replaySameWyslane();
      await waitRt(
        () => f.sent.filter((c) => c === 'listy wyslane').length === 1 + nr,
        `klepniecie ${nr} (listing bazowy wyslane)`,
      );
      replaySameWyslane();
      await waitRt(
        () => f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length === 1 + nr,
        `powtorka kotwicy ${nr}`,
      );
    };
    await proba(1);
    await proba(2);
    await proba(3);
    replaySameWyslane(); // czwarty duplikat z rzedu
    // Sonda wykluczajaca dzien graniczny dostaje PUSTA odpowiedz =
    // brak starszych listow = skrzynka zindeksowana w calosci.
    await waitRt(
      () => f.sent.includes('listy wyslane przed 20 XII 2025'),
      'sonda "przed D" (Fala 26c)',
    );
    f.fire('Nie znaleziono zadnych takich wyslanych listow.', 'mail');
    // niewyslane: puste.
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Indeksowanie niekompletne'), 'uczciwy raport');
    assert.ok(notifyText(f, 'ponad 50 listow z dnia 2025-12-20'), 'raport wskazuje luke');
    assert.ok(!notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'brak falszywego kompletu');
    assert.ok(!notifyText(f, 'muli'), 'bez falszywego komunikatu o mieleniu');
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-gaps'), 'zapisana luka w widoku');
    assert.ok(textOf(h, '.arkmail-index-gaps').includes('wyslane: 2025-12-20'), 'dzien i skrzynka luki');
    // Opozniony retry skrzynki odbiorczej z prologu (test > 10 s).
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 3,
      'opozniony retry: odebrane',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 3,
      'opozniony retry: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
  } finally {
    await stopHarness();
  }
});
