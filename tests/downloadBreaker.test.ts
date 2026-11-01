/**
 * Circuit breaker petli "Pobierz tresci do archiwum" (Fala 31a).
 *
 * Blad: przy padnietej sieci/serwerze petla mielila WSZYSTKIE listy
 * do konca (kazdy = blad + pacing), zamiast przerwac po serii porazek.
 *
 * Kontrakt:
 *  - 3 bledy (kind 'error') Z RZEDU przerywaja petle komunikatem o
 *    nieodpowiadajacym serwerze; pobrane tresci zostaja (sa zapisywane
 *    przyrostowo po kazdym liscie);
 *  - sukces ('ok') resetuje licznik kolejnych bledow;
 *  - 'missing' (list zniknal z serwera - serwer odpowiedzial) tez
 *    resetuje licznik, NIE liczy sie jako blad;
 *  - po przerwie breakerowej nie leca juz zadne komendy kolejnych
 *    kandydatow.
 *
 * Symulacja bledu: odpowiedz na re-kotwice linia bledu serwera
 * ("Data zostala podana w zlym formacie.") - fetch odrzuca od razu,
 * bez timeoutu; regex drugiej szansy (listingGone) jej nie lapi,
 * wiec wynik to czyste kind 'error' po JEDNEJ komendzie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const BREAKER_MSG = 'Przerwano pobieranie - serwer poczty nie odpowiada';
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

/** Laduje skrzynke wyslane z 2 listami (dni 24 i 26 VIII 1999). */
async function loadWyslane(h: Harness): Promise<void> {
  const { f } = h;
  click(h, '[data-box="wyslane"]');
  await waitRt(() => f.sent.includes('listy wyslane'), 'komenda listy wyslane');
  f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 2. Temat: paczka', 'mail');
  f.fire('Odbiorcy: Bar                           Sr, 25 VIII 1999, 10:00:00', 'mail');
  f.fire(' 1. Temat: wyjsciowy', 'mail');
  f.fire('Odbiorcy: Bar                           Cz, 26 VIII 1999, 11:00:00', 'mail');
  f.fire('> ', 'prompt');
  await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji wyslanych');
}

/** Uzbraja i startuje petle pobierania z zakladki Archiwum. */
async function startDownload(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  downloadBtn(h).dispatchEvent(new h.window.Event('click')); // uzbrojenie
  downloadBtn(h).dispatchEvent(new h.window.Event('click')); // start
  await waitRt(() => anchors(h).length === 1, 'pierwsza re-kotwica petli');
}

/** Odpowiada bledem serwera na kolejna re-kotwice (numer 1-based). */
async function answerError(h: Harness, n: number): Promise<void> {
  await waitRt(() => anchors(h).length === n, `re-kotwica ${n}`);
  h.f.fire(ERROR_LINE, 'mail');
}

/** Odpowiada listingu bez szukanego listu (kind 'missing'). */
async function answerMissing(h: Harness, n: number): Promise<void> {
  await waitRt(() => anchors(h).length === n, `re-kotwica ${n}`);
  const { f } = h;
  f.fire('Listy odebrane:', 'mail');
  f.fire(' 1. *R* Temat: inny', 'mail');
  f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
  f.fire('> ', 'prompt');
}

/** Odpowiada pustym listingiem wlasnej skrzynki (missing per skrzynka). */
async function answerEmptyBox(h: Harness, n: number): Promise<void> {
  await waitRt(() => anchors(h).length === n, `re-kotwica ${n}`);
  const box = anchors(h).at(-1)!.split(' ')[1]!;
  const line =
    box === 'nieprzeczytane'
      ? 'Nie masz zadnych nieprzeczytanych listow.'
      : box === 'wyslane'
        ? 'Nie masz zadnych wyslanych listow.'
        : 'Nie masz zadnych niewyslanych listow.';
  h.f.fire(line, 'mail');
  h.f.fire('> ', 'prompt');
}

/** Odpowiada poprawnym odczytem (listing + tresc, kind 'ok'). */
async function answerOk(h: Harness, n: number): Promise<void> {
  await waitRt(() => anchors(h).length === n, `re-kotwica ${n}`);
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
  await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt listu');
  f.fire('List : 1', 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire('Tresc najnowszego.', 'mail');
  f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
  f.fire('> ', 'prompt');
}

test('breaker: 3 bledy z rzedu przerywaja petle, 4. kandydat nie ruszany', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h); // 3 listy odebrane (dni 21-23 XII)
    await loadWyslane(h); // +1 kandydat wiecej niz prog breakera (dni 24-25 XII)
    await startDownload(h);

    await answerError(h, 1);
    await answerError(h, 2);
    await answerError(h, 3);

    await waitRt(() => notifyText(f, BREAKER_MSG), 'komunikat breakera');
    // Petla staje w miejscu: 4. re-kotwica NIE wylatuje.
    await new Promise((r) => setTimeout(r, 1200)); // > pacing petli
    assert.equal(anchors(h).length, 3, 'po breakerze zadna kolejna re-kotwica');
    assert.ok(
      !f.sent.some((c) => c.startsWith('przeczytaj list')),
      'breaker przed jakimkolwiek odczytem',
    );
    assert.ok(!notifyText(f, 'Pobrano tresci'), 'brak zwyklego podsumowania');
  } finally {
    await stopHarness();
  }
});

test('breaker: sukces resetuje licznik - petla konczy sie zwyklym podsumowaniem', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await loadWyslane(h);
    await startDownload(h);

    // Kolejnosc kandydatow po dacie malejaco: 25, 24, 23, 22, 21 XII.
    // err, err, OK, err, err -> nigdzie 3 bledow z rzedu.
    await answerError(h, 1); // wyslane 25 XII
    await answerError(h, 2); // wyslane 24 XII
    await answerOk(h, 3); // odebrane 23 XII -> reset licznika
    await answerError(h, 4); // odebrane 22 XII
    await answerError(h, 5); // odebrane 21 XII

    await waitRt(
      () => notifyText(f, 'Pobrano tresci (1 z 5; nieudane: 4)'),
      'zwykle podsumowanie po resecie',
    );
    assert.ok(!notifyText(f, BREAKER_MSG), 'breaker nie strzelil po resecie');
  } finally {
    await stopHarness();
  }
});

test('breaker: znikniety list (missing) resetuje licznik bledow', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    await loadWyslane(h);
    await startDownload(h);

    // err, err, MISSING, err, err -> gdyby missing liczyl sie jako blad,
    // breaker strzelilby na 3. kandydacie.
    await answerError(h, 1);
    await answerError(h, 2);
    // Kandydat 24 VIII zniknal z serwera: missing zamyka sie dopiero
    // po probie WSZYSTKICH skrzynek (replica moze istniec gdzie
    // indziej) - kotwice 3-6, potem dalsi kandydaci normalnie.
    await answerMissing(h, 3); // odebrane 24 VIII: listu nie ma
    await answerEmptyBox(h, 4); // nieprzeczytane
    await answerEmptyBox(h, 5); // wyslane
    await answerEmptyBox(h, 6); // niewyslane
    await answerError(h, 7); // odebrane 23 VIII
    await answerError(h, 8); // odebrane 22 VIII

    await waitRt(
      () => notifyText(f, 'Pobrano tresci (0 z 5; nieudane: 4; nie ma juz w skrzynce: 1)'),
      'podsumowanie ze zniknietym i bez breakera',
    );
    assert.ok(!notifyText(f, BREAKER_MSG), 'missing nie jest bledem breakera');
  } finally {
    await stopHarness();
  }
});
