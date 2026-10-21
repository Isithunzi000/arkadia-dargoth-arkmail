/**
 * Paginacja wstecz (Fale 7a/8b/8e) - integracja przez skompilowany index.ts.
 * Harness wspoldzielony: tests/harness.ts.
 *
 * Dowody z logow sesji testowych 2026-10-17 i 2026-10-18:
 * 1) Serwer wymaga WIELKIEJ litery miesiaca rzymskiego: "Data zostala
 *    podana w zlym formacie. Przykladowy format to: 13 X 2007."
 * 2) Listing skrzynki idzie od NAJSTARSZEGO listu (gora) do najnowszego
 *    (dol, numer 1) -> kotwica paginacji to najstarszy widoczny wpis.
 * 3) Strona z filtrem przychodzi z naglowkiem "Wybrane listy <skrzynka>"
 *    i RENUMERUJE wpisy (1..N wewnatrz selekcji) -> ID archiwum bez
 *    numeru, wpisy strony doklejamy PRZED istniejace (dedup).
 * 4) "przed <data>" ma granulacje dnia i wyklucza caly dzien graniczny
 *    -> kotwica = najstarsza data + 1 dzien (kalendarz gregorianski,
 *    serwer odrzuca nieistniejace daty, np. 30 II).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { olderListingCommand, nextDay } from '../src/arkmail/core/protocol/commands';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import { LOAD_ALL_MAX_PAGES, LOAD_ALL_PACE_MS } from '../src/arkmail/index';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  textOf,
} from './harness';

test('paginacja: miesiac rzymski WIELKA litera (wymog serwera)', () => {
  assert.equal(
    olderListingCommand('wyslane', parseMailDate('Cz, 9 III 2026, 12:00:00')!),
    'listy wyslane przed 9 III 2026',
  );
  assert.equal(
    olderListingCommand('odebrane', parseMailDate('N, 21 XII 2025, 01:15:04')!),
    'listy odebrane przed 21 XII 2025',
  );
  // kotwica paginacji: najstarsza data + 1 dzien
  const oldest = parseMailDate('N, 21 XII 2025, 01:15:04')!;
  assert.equal(olderListingCommand('odebrane', nextDay(oldest)), 'listy odebrane przed 22 XII 2025');
});

test('paginacja: wczytaj starsze dokleja strone "Wybrane" do widoku i archiwum', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);

    // Klik 1: kotwica = najstarszy (21 XII) + 1 dzien = 22 XII 2025.
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda paginacji wstecz',
    );
    assert.equal(
      f.sent.find((c) => c.startsWith('listy odebrane przed')),
      'listy odebrane przed 22 XII 2025',
    );

    // Pelna strona "Wybrane" (suffix) - doklejana przed istniejace wpisy.
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          N, 14 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 4, 'merge strony');
    await waitFor(() => notifyText(f, 'nowych: 1'), 'notify o dopisaniu starszych do archiwum');

    // Klik 2: kotwica = 14 XII + 1 dzien = 15 XII 2025.
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length === 2,
      'druga komenda paginacji',
    );
    assert.equal(
      f.sent.filter((c) => c.startsWith('listy odebrane przed'))[1],
      'listy odebrane przed 15 XII 2025',
    );

    // Strona niepelna (bez suffixu) = koniec starszych -> przycisk znika.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 1 XII 2025, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 5, 'merge koncowy');
    await waitFor(() => !content.querySelector('.arkmail-older'), 'przycisk zniknal');
  } finally {
    await stopHarness();
  }
});

test('paginacja: linia-blad serwera konczy sesje z komunikatem (bez cichego timeoutu)', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda paginacji wstecz',
    );
    f.fire('Data zostala podana w zlym formacie. Przykladowy format to: 13 X 2007.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => notifyText(f, 'zlym formacie'), 'notify z komunikatem serwera');
  } finally {
    await stopHarness();
  }
});

// --- Fala 8e: "Wczytaj wszystkie" - petla stron pod jedna blokada -------------

test('wczytaj wszystkie: bezpieczniki petli (limit stron i pacing)', () => {
  assert.equal(LOAD_ALL_MAX_PAGES, 40, 'twardy limit stron na jedno klikniecie');
  assert.equal(LOAD_ALL_PACE_MS, 400, 'pauza miedzy stronami (grzecznosc wobec serwera)');
});

test('wczytaj wszystkie: petla stron az do konca (kotwica przesuwa sie co strone)', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli 1',
    );
    assert.equal(
      f.sent.find((c) => c.startsWith('listy odebrane przed')),
      'listy odebrane przed 22 XII 2025',
    );

    // Strona 1 (dalej ucieta) -> petla leci dalej po pacingu.
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          N, 14 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-older-all').includes('Przerwij'), 'Przerwij w petli');
    assert.ok(textOf(h, '.arkmail-busy').includes('strona 1'), 'pasek operacji: postep (strona 1)');

    await waitRt(
      () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length === 2,
      'komenda petli 2 (po pacingu)',
    );
    assert.equal(
      f.sent.filter((c) => c.startsWith('listy odebrane przed'))[1],
      'listy odebrane przed 15 XII 2025',
      'kotwica przesunela sie na najstarszy znany + 1 dzien',
    );

    // Strona 2 niepelna (bez suffixu) = koniec starszych -> petla staje.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 1 XII 2025, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (nowych listow: 2)'),
      'notify podsumowania petli',
    );
    assert.equal(content.querySelectorAll('.arkmail-entry').length, 5, '3 + 2 wpisy po merge');
    await waitRt(
      () =>
        !content.querySelector('.arkmail-older') &&
        (content.querySelector('.arkmail-older-all') as HTMLButtonElement | null)?.disabled === true,
      'paginacja zamknieta: Wczytaj starsze znika, zbiorczy wylaczony (koniec starszych)',
    );
  } finally {
    await stopHarness();
  }
});

test('wczytaj wszystkie: Przerwij zatrzymuje petle miedzy stronami', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli 1',
    );

    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          N, 14 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-older-all').includes('Przerwij'), 'Przerwij w petli');

    click(h, '.arkmail-older-all'); // = Przerwij
    await waitRt(() => notifyText(f, 'Przerwano (nowych listow: 1)'), 'notify przerwania');

    // Pacing by minal - komendy paginacji nie leca dalej.
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(
      f.sent.filter((c) => c.startsWith('listy odebrane przed')).length,
      1,
      'po przerwaniu petla nie wysyla kolejnych stron',
    );
    await waitRt(
      () => textOf(h, '.arkmail-older-all').includes('Wczytaj wszystkie'),
      'przyciski paginacji wrocily (listing dalej uciety)',
    );
  } finally {
    await stopHarness();
  }
});

// --- Fala 9d: straznik mielenia - strona bez nowych wpisow zatrzymuje petle --

test('wczytaj wszystkie: strona bez nowych wpisow zatrzymuje petle', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli 1',
    );
    const cmd = () => f.sent.filter((c) => c === 'listy odebrane przed 22 XII 2025').length;

    // Strona z listami TEGO SAMEGO dnia co najstarszy widoczny (21 XII):
    // wpisy sa nowe, ale kotwica (najstarsza data + 1 dzien) NIE cofa sie.
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: ranny jeden', 'mail');
    f.fire('Nadawca: Bar                          N, 21 XII 2025, 00:45:00', 'mail');
    f.fire(' 2. *R* Temat: ranny dwa', 'mail');
    f.fire('Nadawca: Bar                          N, 21 XII 2025, 00:30:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => cmd() === 2, 'komenda petli 2 (ta sama kotwica)');

    // Serwer zwraca TA SAMA strone (50 najnowszych <= kotwicy juz znamy):
    // zero nowych wpisow = koniec sensownej roboty, petla ma STAC mimo
    // suffixu uciecia (ogon ponad 50 listow jednego dnia - znane
    // ograniczenie, do ktorego sluzy szukanie).
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: ranny jeden', 'mail');
    f.fire('Nadawca: Bar                          N, 21 XII 2025, 00:45:00', 'mail');
    f.fire(' 2. *R* Temat: ranny dwa', 'mail');
    f.fire('Nadawca: Bar                          N, 21 XII 2025, 00:30:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => notifyText(f, 'Wczytano wszystkie (nowych listow: 2)'), 'notify konca');

    // Pacing by minal kilka razy - zadna kolejna komenda nie wylatuje.
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(cmd(), 2, 'petla stanela na stronie bez nowych wpisow');
  } finally {
    await stopHarness();
  }
});


// --- Fala 24b: kontakty odbudowywane po doczytaniu starszych stron --------

test('kontakty: wczytaj starsze odbudowuje kontakty z dopisanej strony (Fala 24b)', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda paginacji wstecz',
    );
    // Strona niepelna z NOWYM nadawca (Baz) - trafia do archiwum.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 1 XII 2025, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => notifyText(f, 'nowych: 1'), 'notify o dopisaniu starszych');

    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'wiersze kontaktow');
    const names = Array.from(
      h.content.querySelectorAll('.arkmail-contact-name') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(names.includes('Foo'), 'kontakt z prologu');
    assert.ok(names.includes('Baz'), 'kontakt z dopisanej strony starszych');
  } finally {
    await stopHarness();
  }
});

test('kontakty: wczytaj wszystkie odbudowuje kontakty po zakonczeniu petli (Fala 24b)', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli',
    );
    // Jedyna strona niepelna = koniec starszych, petla staje.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 1 XII 2025, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (nowych listow: 1)'),
      'notify konca petli',
    );

    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'wiersze kontaktow');
    const names = Array.from(
      h.content.querySelectorAll('.arkmail-contact-name') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(names.includes('Baz'), 'kontakt z petli wczytaj-wszystkie');
  } finally {
    await stopHarness();
  }
});
