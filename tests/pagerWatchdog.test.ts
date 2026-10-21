/**
 * Straznik sierocych pagerow (Fala 11g, przebudowa Fala 24g).
 *
 * Fala 11g: kazdy prompt pagera poza blokada sesji dostawal automatyczne
 * "q" - ale tryb czytania poczty GRACZA ma identyczny prompt
 * ("[1-50 ...] (aktualny: N) -- "), wiec straznik zabijal reczne sesje
 * (log 2026-10-21: gracz wpisal "d" w trybie poczty i wyszedl na dol,
 * "?" dawalo pomoc gry zamiast pomocy edytora; zarzadzanie listami
 * recznie bylo niemozliwe bez odinstalowania wtyczki).
 *
 * Fala 24g: straznik odpala "q" WYLACZNIE przy pozytywnym podejrzeniu
 * sieroty (flaga stawiana przez wlasne awaryjne sesje pagera/listingu -
 * patrz core/session/orphanPager.ts). Prompt bez podejrzenia to sesja
 * gracza - nietknieta. Echo komendy wchodzacej w tryb poczty ("list",
 * "listy", "przeczytaj", "poczta") czysci podejrzenie prewencyjnie.
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

test('straznik: prompt pagera bez podejrzenia sieroty zostaje nietkniety (reczna sesja gracza)', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    const qBefore = f.sent.filter((c) => c === 'q').length;
    // Gracz sam wszedl w tryb czytania poczty - prompt pagera poza
    // transakcja pluginu, ale BEZ podejrzenia sieroty. Straznik NIE
    // wysyla q (Fala 24g: to zabijalo reczne sesje, log 2026-10-21).
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      f.sent.filter((c) => c === 'q').length,
      qBefore,
      'bez podejrzenia sieroty straznik nie wysyla q',
    );
  } finally {
    await stopHarness();
  }
});

test('straznik: echo komendy pocztowej gracza + prompt pagera -> bez q', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    const qBefore = f.sent.filter((c) => c === 'q').length;
    // Gracz wpisuje "list 1" (echo klienta) i serwer otwiera tryb
    // czytania - dokladnie sekwencja z loga 2026-10-21.
    f.fire('→ list 1', 'command');
    f.fire('List : 1', 'mail');
    f.fire('Od   : Gracz', 'mail');
    f.fire('Temat: Test01', 'mail');
    f.fire('Data : Sr, 21 X 2026, 18:20:59', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      f.sent.filter((c) => c === 'q').length,
      qBefore,
      'sesja czytania gracza zostaje nietknieta',
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
