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
import { letterId, type ArchiveLetter } from '../src/arkmail/core/archive';
import { INDEX_ANCHOR_RETRY_WAITS_MS, LOAD_ALL_PACE_MS } from '../src/arkmail/index';
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
    olderListingCommand('wyslane', parseMailDate('Pn, 27 IX 1999, 12:00:00')!),
    'listy wyslane przed 27 IX 1999',
  );
  assert.equal(
    olderListingCommand('odebrane', parseMailDate('Nd, 22 VIII 1999, 01:15:04')!),
    'listy odebrane przed 22 VIII 1999',
  );
  // kotwica paginacji: najstarsza data + 1 dzien
  const oldest = parseMailDate('Nd, 22 VIII 1999, 01:15:04')!;
  assert.equal(olderListingCommand('odebrane', nextDay(oldest)), 'listy odebrane przed 23 VIII 1999');
});

test('paginacja: wczytaj starsze dokleja strone "Wybrane" do widoku i archiwum', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);

    // Klik 1: kotwica = najstarszy (21 XII) + 1 dzien = 23 VIII 1999.
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda paginacji wstecz',
    );
    assert.equal(
      f.sent.find((c) => c.startsWith('listy odebrane przed')),
      'listy odebrane przed 23 VIII 1999',
    );

    // Pelna strona "Wybrane" (suffix) - doklejana przed istniejace wpisy.
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          Nd, 15 VIII 1999, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 4, 'merge strony');
    await waitFor(() => notifyText(f, 'dodanych do listy: 1'), 'notify o dopisaniu starszych do archiwum');

    // Klik 2: kotwica = 14 XII + 1 dzien = 16 VIII 1999.
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length === 2,
      'druga komenda paginacji',
    );
    assert.equal(
      f.sent.filter((c) => c.startsWith('listy odebrane przed'))[1],
      'listy odebrane przed 16 VIII 1999',
    );

    // Strona niepelna (bez suffixu) = koniec starszych -> przycisk znika.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 9 VIII 1999, 09:00:00', 'mail');
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

test('wczytaj wszystkie: pauza miedzy stronami bez sztywnego limitu', () => {
  assert.equal(LOAD_ALL_PACE_MS, 400, 'pauza miedzy stronami');
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
      'listy odebrane przed 23 VIII 1999',
    );

    // Strona 1 (dalej ucieta) -> petla leci dalej po pacingu.
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          Nd, 15 VIII 1999, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-older-all').includes('Przerwij'), 'Przerwij w petli');
    assert.ok(textOf(h, '.arkmail-busy').includes('strona 1'), 'pasek operacji: postep (strona 1)');

    await waitRt(
      () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length === 2,
      'komenda petli 2 (po pacingu)',
    );
    assert.equal(
      f.sent.filter((c) => c.startsWith('listy odebrane przed'))[1],
      'listy odebrane przed 16 VIII 1999',
      'kotwica przesunela sie na najstarszy znany + 1 dzien',
    );

    // Strona 2 niepelna (bez suffixu) = koniec starszych -> petla staje.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 9 VIII 1999, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (dodanych do listy: 2)'),
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
    f.fire('Nadawca: Waldo                          Nd, 15 VIII 1999, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-older-all').includes('Przerwij'), 'Przerwij w petli');

    click(h, '.arkmail-older-all'); // = Przerwij
    await waitRt(() => notifyText(f, 'Przerwano (dodanych do listy: 1)'), 'notify przerwania');

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

test('wczytaj wszystkie: ponad 50 listow jednego dnia zapisuje luke zamiast kompletu', async () => {
  const waits = [...INDEX_ANCHOR_RETRY_WAITS_MS];
  INDEX_ANCHOR_RETRY_WAITS_MS.splice(0);
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli 1',
    );
    const cmd = () => f.sent.filter((c) => c === 'listy odebrane przed 23 VIII 1999').length;
    const sameDay = () => {
      f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
      f.fire(' 2. *R* Temat: ranny jeden', 'mail');
      f.fire('Nadawca: Bar                          Nd, 22 VIII 1999, 00:45:00', 'mail');
      f.fire(' 1. *R* Temat: ranny dwa', 'mail');
      f.fire('Nadawca: Bar                          Nd, 22 VIII 1999, 00:30:00', 'mail');
      f.fire('> ', 'prompt');
    };
    sameDay();
    await waitRt(() => cmd() === 2, 'powtorka tej samej strony');
    sameDay();
    await waitRt(
      () => f.sent.includes('listy odebrane przed 22 VIII 1999'),
      'sprawdzenie starszych dni',
    );
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Wczytano dostepne listy'), 'uczciwe podsumowanie');
    assert.ok(notifyText(f, '1999-08-22'), 'komunikat wskazuje dzien z luka');
    assert.ok(!notifyText(f, 'Wczytano wszystkie'), 'brak falszywego kompletu');
    assert.equal(cmd(), 2, 'petla nie powtarza tej samej strony');
  } finally {
    INDEX_ANCHOR_RETRY_WAITS_MS.splice(0, INDEX_ANCHOR_RETRY_WAITS_MS.length, ...waits);
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
    f.fire('Nadawca: Baz                          Pn, 9 VIII 1999, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => notifyText(f, 'dodanych do listy: 1'), 'notify o dopisaniu starszych');

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
    f.fire('Nadawca: Baz                          Pn, 9 VIII 1999, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (dodanych do listy: 1)'),
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


// --- Fala 24c: loadAll domykajacy skrzynke stempluje indexMeta -------------

test('wczytaj wszystkie: naturalne domkniecie skrzynki stempluje indexMeta (Fala 24c)', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli',
    );
    // Strona niepelna (bez suffixu) = koniec starszych: petla staje
    // naturalnie, skrzynka przeczesana w calosci.
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 9. *R* Temat: pradawny', 'mail');
    f.fire('Nadawca: Baz                          Pn, 9 VIII 1999, 09:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (dodanych do listy: 1)'),
      'notify konca petli',
    );

    // Jedna kompletna skrzynka nie wystarcza do kompletnego indeksu.
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-foot'), 'opis indeksacji');
    assert.match(
      textOf(h, '.arkmail-index-foot'),
      /^Indeksacja niekompletna/,
      'naturalne domkniecie loadAll zachowuje date skrzynki',
    );
  } finally {
    await stopHarness();
  }
});

test('wczytaj wszystkie: przerwanie petli NIE stempluje indexMeta (Fala 24c)', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda petli 1',
    );
    // Strona 1 ucieta -> petla leci dalej; gracz klika Przerwij.
    f.fire('Wybrane listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          Nd, 15 VIII 1999, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-older-all').includes('Przerwij'), 'Przerwij w petli');
    click(h, '.arkmail-older-all');
    await waitRt(() => notifyText(f, 'Przerwano'), 'notify przerwania');

    // Petla przerwana = brak pewnosci kompletu -> bez daty skrzynki.
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-foot'), 'opis indeksacji');
    assert.ok(
      textOf(h, '.arkmail-index-foot').startsWith('Indeksacja niekompletna |'),
      'brak daty po przerwanym loadAll',
    );
  } finally {
    await stopHarness();
  }
});


test('wczytaj wszystkie: przechodzi poza 40 stron i konczy dopiero na pelnej odpowiedzi', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    const anchors = () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length;
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const weekdays = ['N', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So'];
    const firePage = (page: number, truncated: boolean) => {
      const d = new Date(Date.UTC(2025, 11, 20) - (page - 1) * 86400000);
      const raw = `${weekdays[d.getUTCDay()]}, ${d.getUTCDate()} ${romans[d.getUTCMonth()]} ${d.getUTCFullYear()}, 08:00:00`;
      f.fire(`Wybrane listy odebrane${truncated ? ' (prezentowane jest pierwsze 50)' : ''}:`, 'mail');
      f.fire('50. *R* Temat: starszy wpis', 'mail');
      f.fire(`Nadawca: Foo                          ${raw}`, 'mail');
      f.fire('> ', 'prompt');
    };
    for (let page = 1; page <= 41; page++) {
      await waitRt(() => anchors() === page, `strona ${page}`);
      firePage(page, true);
    }
    await waitRt(() => anchors() === 42, 'strona 42 poza dawny limit');
    firePage(42, false);
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (dodanych do listy: 42)'),
      'komplet po 42 stronach',
    );
  } finally {
    await stopHarness();
  }
});

test('wczytaj wszystkie: komunikat liczy wpisy dodane do widoku, nie tylko nowe rekordy', async () => {
  const dateRaw = 'So, 21 VIII 1999, 08:00:00';
  const existing: ArchiveLetter = {
    id: letterId('odebrane', 'Foo', 'juz w archiwum', false, dateRaw),
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject: 'juz w archiwum',
    forwarded: false,
    dateRaw,
    sortKey: '1999-08-21 08:00:00',
    read: true,
    body: [],
  };
  const h = await startHarness({ archive: [existing] });
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitRt(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'strona z rekordem juz obecnym w archiwum',
    );
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: juz w archiwum', 'mail');
    f.fire(`Nadawca: Foo                        ${dateRaw}`, 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => notifyText(f, 'Wczytano wszystkie (dodanych do listy: 1)'),
      'licznik nowych wierszy widoku',
    );
  } finally {
    await stopHarness();
  }
});
