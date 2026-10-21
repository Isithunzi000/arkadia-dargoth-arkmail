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

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  waitRt,
  click,
  notifyText,
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

test('skrzynka z mieleniem kotwicy jest pomijana, reszta dojezdza, raport ja wymienia', async () => {
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
    replaySameWyslane(); // identyczna strona = freshCount 0
    // Fala 20b: pojedynczy duplikat to incydent - plugin powtarza
    // kotwice RAZ; dopiero drugi duplikat z rzedu potwierdza mielenie.
    await waitRt(
      () => f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length === 2,
      'retry kotwicy wyslane',
    );
    replaySameWyslane(); // drugi duplikat z rzedu = trwale mielenie
    // niewyslane: puste - pominiecie wyslanych nie moze zabic petli.
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane po pominieciu');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    // Raport: niekompletne, wymienia wyslane z powodem; brama kontaktow
    // nadal zamknieta (3/4 flagi).
    await waitRt(
      () => notifyText(f, 'pominiete: wyslane (kotwica bez postepu)'),
      'raport z powodem pomieciecia',
    );
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'brama nadal zamknieta');
    assert.ok(!h.content.querySelector('.arkmail-contact'), 'licznikow brak przy 3/4');
  } finally {
    await stopHarness();
  }
});

test('incydentalny duplikat strony kotwicowej: retry ratuje skrzynke (Fala 20b)', async () => {
  // Zgloszenie 2026-10-21 "pominiete wyslane / 3-4": duplikat strony
  // (np. powtorka odpowiedzi serwera) byl traktowany jak trwale
  // mielenie kotwicy i skrzynka byla pomijana. Jeden duplikat =
  // incydent (retry kotwicy); dopiero drugi z rzedu = mielenie.
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
    // ...plugin powtarza kotwice zamiast pomijac skrzynke...
    await waitRt(
      () => f.sent.filter((c) => c === 'listy wyslane przed 21 XII 2025').length === 2,
      'retry kotwicy po duplikacie',
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
