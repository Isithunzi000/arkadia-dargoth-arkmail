/**
 * Pobieranie tresci zawsze po pelnej indeksacji skrzynek (decyzja
 * 2026-10-23: kazde pobranie wszystkich tresci = najpierw pelna
 * kontrola indeksu, wtedy nie ma ryzyka pracy na nieswiezej liscie).
 *
 * Kontrakt:
 *  - klik "Pobierz tresci do archiwum" (po uzbrojeniu) NAJPIERW
 *    indeksuje wszystkie skrzynki; petla pobierania startuje dopiero
 *    po kompletnej indeksacji (zaden re-kotwica nie wylatuje wczesniej);
 *  - kontynuacja jest bramkowana wynikiem BIEZACEGO przebiegu
 *    indeksacji: przerwanie (Przerwij) albo pominieta skrzynka =
 *    pobieranie NIE startuje, nawet gdy znaczniki indeksu sa kompletne
 *    z wczesniejszego przebiegu;
 *  - niekompletny indeks konczy sie rzeczowym komunikatem wymieniajacym
 *    pominiete skrzynki.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  driveIndexAll,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const INDEX_FIRST_MSG = 'najpierw indeksuje wszystkie skrzynki';
const ERROR_LINE = 'Data zostala podana w zlym formacie.';

/** Komendy re-kotwic petli pobierania (listy ... przed <data>). */
const anchors = (h: Harness): string[] =>
  h.f.sent.filter((c) => / przed \d+ [IVX]+ \d{4}$/.test(c));

/** Swiezy przycisk pobierania (rerender tworzy nowy DOM). */
const downloadBtn = (h: Harness): { textContent: string; dispatchEvent(e: unknown): void } => {
  const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
    textContent: string;
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(b, 'przycisk pobierania istnieje');
  return b;
};

/** Uzbraja i startuje pobieranie tresci z zakladki Archiwum. */
function clickDownloadTwice(h: Harness): void {
  click(h, '[data-tab="archiwum"]');
  downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
  downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start
}

/** Kompletny listing odebranych z trzema wpisami prologu (bez uciecia). */
const LISTING3_FULL = [
  'Listy odebrane:',
  ' 3. *R* Temat: najstarszy',
  'Nadawca: Foo                        N, 21 XII 2025, 01:15:04',
  ' 2. *R* Temat: srodkowy',
  'Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05',
  ' 1. *R* Temat: najnowszy',
  'Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12',
];

test('pobieranie tresci: najpierw pelna indeksacja, dopiero potem re-kotwice', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h); // archiwum: 3 wpisy odebranych bez tresci
    clickDownloadTwice(h);

    // Komunikat o kolejnosci operacji; zadna re-kotwica pobierania
    // nie moze wyprzedzic indeksacji.
    await waitRt(() => notifyText(f, INDEX_FIRST_MSG), 'komunikat o indeksacji przed pobieraniem');
    assert.equal(anchors(h).length, 0, 'zero re-kotwic przed indeksacja');

    // Pierwszy krok driveIndexAll czeka na NOWY listing odebranych -
    // dowod, ze indeksacja ruszyla przed pobieraniem.
    await driveIndexAll(h, { odebrane: LISTING3_FULL });
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'koniec indeksacji');

    // Dopiero teraz startuje petla pobierania.
    await waitRt(() => anchors(h).length === 1, 'pierwsza re-kotwica po indeksacji');

    // Domkniecie petli: 3 bledy z rzedu zatrzymuja ja breakerem, zeby
    // test nie zostawial wiszacej sesji.
    for (let n = 1; n <= 3; n++) {
      await waitRt(() => anchors(h).length === n, `re-kotwica ${n}`);
      f.fire(ERROR_LINE, 'mail');
    }
    await waitRt(
      () => notifyText(f, 'Przerwano pobieranie - serwer poczty nie odpowiada'),
      'breaker domyka petle',
    );
  } finally {
    await stopHarness();
  }
});

test('przerwana indeksacja NIE odpala pobierania, mimo kompletnych znacznikow z wczesniej', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    // Pelna reczna indeksacja: znaczniki wszystkich skrzynek kompletne.
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');
    await driveIndexAll(h, { odebrane: LISTING3_FULL });
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'pelna indeksacja');

    // Start pobierania -> najpierw indeksacja -> Przerwij w trakcie.
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
    downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start
    await waitRt(() => notifyText(f, INDEX_FIRST_MSG), 'komunikat o indeksacji');
    const odbBefore = f.sent.filter((c) => c === 'listy odebrane').length;
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === odbBefore + 1,
      'druga indeksacja ruszyla',
    );
    click(h, '.arkmail-index-all'); // Przerwij indeksowanie
    // Odpowiedz na wiszacy listing, zeby petla indeksacji mogla sie
    // domknac (skrzynka liczy sie jako zindeksowana, reszta odpada
    // przez flage przerwania).
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => notifyText(f, 'Przerwano indeksowanie'), 'komunikat przerwania');

    // Pobieranie NIE rusza: zero re-kotwic, brak paska pobierania.
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(anchors(h).length, 0, 'przerwana indeksacja bez pobierania');
    assert.ok(!notifyText(f, 'Pobrano tresci'), 'brak podsumowania pobierania');
    assert.ok(
      !String(downloadBtn(h).textContent).startsWith('Przerwij'),
      'przycisk pobierania nie wszedl w tryb petli',
    );
  } finally {
    await stopHarness();
  }
});

test('niekompletny indeks (pominieta skrzynka) NIE odpala pobierania', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    clickDownloadTwice(h);
    await waitRt(() => notifyText(f, INDEX_FIRST_MSG), 'komunikat o indeksacji');

    // Odebrane: uciety listing bez ani jednego wpisu = skrzynka
    // pominieta od razu ("brak daty w wpisach"), reszta pusta.
    await driveIndexAll(h, {
      odebrane: ['Listy odebrane (prezentowane jest pierwsze 50):'],
    });

    await waitRt(() => notifyText(f, 'Indeksowanie niekompletne'), 'komunikat niekompletnego indeksu');
    assert.ok(notifyText(f, 'pominiete: odebrane'), 'komunikat wymienia pominieta skrzynke');
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(anchors(h).length, 0, 'niekompletny indeks bez pobierania');
    assert.ok(!notifyText(f, 'Pobrano tresci'), 'brak podsumowania pobierania');
  } finally {
    await stopHarness();
  }
});
