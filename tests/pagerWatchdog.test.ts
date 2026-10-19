/**
 * Straznik sierocych pagerow (Fala 11g): prompt pagera, ktory przychodzi
 * poza jakakolwiek transakcja (blokada sesji wolna), oznacza pager
 * otwarty na serwerze bez naszej kontroli (np. po timeoutcie sesji).
 * Taki pager konsumuje WSZYSTKIE komendy gracza - straznik zamyka go
 * automatycznym "q". Prompt pod blokada (legalna sesja) zostaje
 * nietkniety.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, loadTruncatedBox, click, type Harness } from './harness';

/** Odtwarza otwarcie listu numer N w pagerze i wyjscie. */
function replayLetter(h: Harness, n: number): void {
  const { f } = h;
  f.fire(`List : ${n}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire('Tresc karteczki.', 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${n}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('straznik: pager prompt bez aktywnej sesji -> automatyczne q', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    const qBefore = f.sent.filter((c) => c === 'q').length;
    // Sierocy pager na serwerze: prompt poza jakakolwiek transakcja.
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await waitFor(
      () => f.sent.filter((c) => c === 'q').length === qBefore + 1,
      'straznik wyslal q',
    );
  } finally {
    await stopHarness();
  }
});

test('straznik: prompt pagera pod blokada (legalny odczyt) bez dodatkowego q', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    // Fala 14f: prolog konczy sie pustym listingiem nieprzeczytanych -
    // wpis ma stary kontekst, wiec otwarcie idzie przez re-kotwice.
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.includes('listy odebrane przed 24 XII 2025'),
      're-kotwica przed otwarciem',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'przeczytaj list 1');
    replayLetter(h, 1);
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'list otwarty');
    // Obsluga refreshu po odczycie (Fala 11f) - blokada schodzi do zera.
    await waitFor(() => f.sent.filter((c) => c === 'listy odebrane').length === 2, 'refresh 11f');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');
    await new Promise((r) => setTimeout(r, 300));
    // Dokladnie jedno q - z legalnej sesji; straznik nie dorzucil swojego.
    assert.equal(f.sent.filter((c) => c === 'q').length, 1, 'tylko q z sesji odczytu');
  } finally {
    await stopHarness();
  }
});
