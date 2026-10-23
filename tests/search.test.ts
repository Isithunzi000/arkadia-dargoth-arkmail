/**
 * Szukanie serwerowe (Fala 8g) - komenda "listy" z filtrami + integracja UI.
 *
 * Skladnia z helpu w grze (?listy, log 2026-10-18):
 *   listy [nieprzeczytane/otrzymane/wyslane/niewyslane] [do kogo] [od kogo]
 *         [dzis|wczoraj|przedwczoraj | dnia data | przed data | po data]
 *         [o temacie temat] [o tresci tresc]
 *   Argumenty mozna dowolnie laczyc. Zawsze max 50 najnowszych.
 * Potwierdzone w grze 2026-10-23: "o temacie" to chciwy ogon (wartosc =
 * reszta linii) - musi byc OSTATNIM argumentem; "o tresci" i daty sa
 * tokenizowane, lacza sie ze soba i z tematem (AND).
 * Uwaga: help mowi "otrzymane", ale komenda "listy odebrane ..." dziala
 * (dowod: logi paginacji 2026-10-17/18) - trzymamy sie "odebrane".
 * Wynik filtra przychodzi z naglowkiem "Wybrane listy <skrzynka>"
 * i RENUMERUJE wpisy (parser obsluguje od Fali 8b).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchListingCommand,
  searchDescription,
  fromISODate,
} from '../src/arkmail/core/protocol/commands';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  textOf,
  type Harness,
} from './harness';

test('szukaj: komenda listy z filtrami serwera (skladnia ?listy)', () => {
  assert.equal(
    searchListingCommand('odebrane', { osoba: 'Bar' }),
    'listy odebrane od Bar',
  );
  assert.equal(
    searchListingCommand('wyslane', { osoba: 'Bar' }),
    'listy wyslane do Bar',
    'kierunek po skrzynce: wyslane/niewyslane szukaja po adresacie (do)',
  );
  assert.equal(
    searchListingCommand('odebrane', {
      odDaty: { day: 1, month: 4, year: 2026 },
      doDaty: { day: 30, month: 4, year: 2026 },
    }),
    'listy odebrane po 31 III 2026 przed 1 V 2026',
    'zakres WLACZNIE: OBIE granice wykluczaja dzien graniczny (potwierdzone w grze) - po dostaje -1 dzien, przed +1 dzien',
  );
  // Fala 29: "po <data>" jest WYLACZNE jak "przed" (potwierdzone w grze
  // 2026-10-23). Wlaczna dolna granica UI = po dzien WCZESNIEJ.
  assert.equal(
    searchListingCommand('odebrane', { odDaty: { day: 7, month: 10, year: 2026 } }),
    'listy odebrane po 6 X 2026',
    'po wylaczne: srodek miesiaca',
  );
  assert.equal(
    searchListingCommand('odebrane', { odDaty: { day: 1, month: 3, year: 2026 } }),
    'listy odebrane po 28 II 2026',
    'po wylaczne: granica miesiaca (2026 nieprzestepny)',
  );
  assert.equal(
    searchListingCommand('odebrane', { odDaty: { day: 1, month: 3, year: 2024 } }),
    'listy odebrane po 29 II 2024',
    'po wylaczne: granica miesiaca (2024 przestepny)',
  );
  assert.equal(
    searchListingCommand('odebrane', { odDaty: { day: 1, month: 1, year: 2026 } }),
    'listy odebrane po 31 XII 2025',
    'po wylaczne: granica roku',
  );
  assert.equal(
    searchListingCommand('wyslane', {
      osoba: 'Alvin',
      doDaty: { day: 7, month: 3, year: 2002 },
      temat: 'pomoc',
    }),
    'listy wyslane do Alvin przed 8 III 2002 o temacie pomoc',
    'temat zawsze ostatni (wzorzec z helpu: listy wyslane do alvina przed 7 III 2002 o temacie pomoc)',
  );
  // Fala 30d (potwierdzone w grze 2026-10-23): "o temacie" jest
  // chciwym ogonem (wartosc = reszta linii) i MUSI byc ostatnie;
  // "o tresci" jest tokenizowane. Kolejnosc temat->tresc dawala pusty
  // wynik mimo pasujacego listu; tresc->temat dziala (AND obu filtrow).
  assert.equal(
    searchListingCommand('odebrane', { temat: 'perly', tresc: 'morze' }),
    'listy odebrane o tresci morze o temacie perly',
    'tresc przed tematem - temat chciwy ogon, zawsze ostatni (gra 2026-10-23)',
  );
  assert.equal(
    searchListingCommand('nieprzeczytane', {}),
    'listy nieprzeczytane',
    'puste zapytanie = zwykly listing',
  );
});

test('szukaj: fromISODate parsuje pole type=date; smieci odrzuca', () => {
  assert.deepEqual(fromISODate('2026-04-01'), { day: 1, month: 4, year: 2026 });
  assert.deepEqual(fromISODate('2026-12-31'), { day: 31, month: 12, year: 2026 });
  assert.deepEqual(fromISODate('2024-02-29'), { day: 29, month: 2, year: 2024 }, 'przestepny');
  assert.equal(fromISODate(''), null);
  assert.equal(fromISODate('01.04.2026'), null);
  assert.equal(fromISODate('2026-13-01'), null);
  assert.equal(fromISODate('2026-02-30'), null, 'walidacja kalendarza (serwer odrzuca 30 II)');
});

test('szukaj: opis zapytania do bannera wynikow', () => {
  assert.equal(
    searchDescription('odebrane', { osoba: 'Bar', temat: 'perly' }),
    'odebrane, nadawca: Bar, temat: "perly"',
  );
  assert.equal(
    searchDescription('wyslane', {
      osoba: 'Grault',
      odDaty: { day: 1, month: 4, year: 2026 },
      doDaty: { day: 30, month: 4, year: 2026 },
    }),
    'wyslane, adresat: Grault, od dnia: 2026-04-01, do dnia: 2026-04-30',
  );
  assert.equal(
    searchDescription('odebrane', { tresc: 'morze' }),
    'odebrane, tresc: "morze"',
  );
});

const setInput = (h: Harness, selector: string, value: string): void => {
  const el = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  el.value = value;
  el.dispatchEvent(new h.window.Event('input'));
};

test('szukaj integracja: komenda z UI, wyniki w widoku, Wyczysc bez refetchu', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h); // 3 wpisy odebranych w widoku

    setInput(h, '[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await waitFor(
      () => f.sent.includes('listy odebrane od Corge'),
      'komenda szukania po nadawcy',
    );

    // Wynik: strona "Wybrane" z renumeracja (1 wpis).
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 1, 'wynik w widoku');
    assert.ok(textOf(h, '.arkmail-search-banner').includes('Corge'), 'banner wynikow');
    assert.ok(
      !content.querySelector('.arkmail-older'),
      'w trybie wynikow paginacja schowana (renumeracja)',
    );

    // Wyczysc: pelny widok wraca BEZ strzalu do serwera.
    const sentBefore = f.sent.length;
    click(h, '.arkmail-search-clear');
    await waitFor(
      () => content.querySelectorAll('.arkmail-entry').length === 3,
      'pelny widok przywrocony',
    );
    assert.equal(f.sent.length, sentBefore, 'Wyczysc nie wysyla komend (restore z pamieci)');
    assert.ok(!content.querySelector('.arkmail-search-banner'), 'banner zniknal');
  } finally {
    await stopHarness();
  }
});

test('szukaj integracja: pusty wynik pokazuje komunikat i banner zostaje', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    setInput(h, '[data-search="temat"]', 'nie-ma-tego');
    click(h, '.arkmail-search-go');
    await waitFor(
      () => f.sent.includes('listy odebrane o temacie nie-ma-tego'),
      'komenda szukania po temacie',
    );
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => textOf(h, '.arkmail-pane').includes('Brak pasujacych listow.'),
      'komunikat o pustym wyniku',
    );
    assert.ok(textOf(h, '.arkmail-search-banner').includes('nie-ma-tego'), 'banner dalej widoczny');
    // Wyczysc przywraca listing.
    click(h, '.arkmail-search-clear');
    await waitFor(
      () => content.querySelectorAll('.arkmail-entry').length === 3,
      'powrot do pełnego widoku',
    );
  } finally {
    await stopHarness();
  }
});

test('szukaj integracja: pole Tresc buduje komende "o tresci" (Fala 28a)', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    setInput(h, '[data-search="tresc"]', 'zloto z morza');
    click(h, '.arkmail-search-go');
    await waitFor(
      () => f.sent.includes('listy odebrane o tresci zloto z morza'),
      'komenda szukania po tresci',
    );

    // Tresc laczy sie z innymi filtrami; temat (chciwy ogon) zawsze
    // ostatni - tresc przed tematem (potwierdzone w grze 2026-10-23).
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => h.content.querySelector('.arkmail-search-clear') !== null,
      'banner wynikow po pierwszym szukaniu',
    );
    click(h, '.arkmail-search-clear');
    setInput(h, '[data-search="osoba"]', 'Corge');
    setInput(h, '[data-search="temat"]', 'perly');
    setInput(h, '[data-search="tresc"]', 'morze');
    click(h, '.arkmail-search-go');
    await waitFor(
      () => f.sent.includes('listy odebrane od Corge o tresci morze o temacie perly'),
      'komenda laczona: osoba -> tresc -> temat (temat ostatni)',
    );
  } finally {
    await stopHarness();
  }
});
