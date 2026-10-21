/**
 * Masowe pobieranie tresci do archiwum (Fala 16i).
 *
 * Zgloszenie 2026-10-19 pkt 10: przycisk "Pobierz tresci do archiwum"
 * z ostrzezeniem, ze moze potrwac bardzo dlugo, z postepem i Przerwij.
 *
 * Kontrakt:
 *  - pierwszy klik tylko uzbraja (ostrzezenie o dlugim czasie), zadna
 *    komenda nie wylatuje; drugi klik startuje petle;
 *  - petla czyta kolejne listy bez tresci (re-kotwica po dacie, jak
 *    przy kliku w wpis archiwum), kazda przeczytana tresc laduje
 *    w archiwum i na dysku;
 *  - w trakcie petli przycisk zamienia sie w Przerwij z postepem;
 *    przerwanie konczy petle po biezacym liscie, toast podsumowuje;
 *  - gdy nie ma czego pobrac: toast, zero komend.
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
  textOf,
  type Harness,
} from './harness';

/** Swiezy element przycisku pobierania (rerender tworzy nowy DOM). */
const downloadBtn = (h: Harness): { textContent: string; dispatchEvent(e: unknown): void } => {
  const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
    textContent: string;
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(b, 'przycisk pobierania istnieje');
  return b;
};

const clickDownload = (h: Harness): void =>
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));

/** Klik w wiersz archiwum z zadanym fragmentem tematu. */
function clickArchiveRow(h: Harness, fragment: string): void {
  const rows = Array.from(
    h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
      textContent?: string;
      dispatchEvent(e: unknown): void;
    }>,
  );
  const row = rows.find((r) => String(r.textContent ?? '').includes(fragment));
  assert.ok(row, `wiersz archiwum "${fragment}" istnieje`);
  row.dispatchEvent(new h.window.Event('click'));
}

/** Widok listu otwarty i pokazuje zadany fragment tresci. */
const letterBodyShows = (h: Harness, fragment: string): boolean =>
  !!h.content.querySelector('.arkmail-letter-body') &&
  textOf(h, '.arkmail-letter-body').includes(fragment);

/** Listing z trzema wpisami prologu (numery jak na starcie). */
function replayListing3(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

/** Pager: naglowki + body + prompt pagera i gry. */
function replayLetter(h: Harness, numer: number, subject: string, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('archiwum: pobieranie tresci - uzbrojenie, petla, podsumowanie, cache', async () => {
  const h = await startHarness();
  const { f, waitFor: wf, content } = h;
  try {
    await loadTruncatedBox(h); // archiwum ma 3 wpisy BEZ tresci
    click(h, '[data-tab="archiwum"]');

    // Uzbrojenie: pierwszy klik tylko ostrzega, zero komend.
    const base = f.sent.length;
    assert.equal(downloadBtn(h).textContent, 'Pobierz tresci do archiwum');
    clickDownload(h);
    assert.ok(
      downloadBtn(h).textContent.includes('dlugo'),
      'ostrzezenie o dlugim czasie po pierwszym kliku',
    );
    assert.equal(f.sent.length, base, 'uzbrojenie nie wysyla komend');

    // Drugi klik startuje petle: kazdy list przez re-kotwice po dacie.
    clickDownload(h);
    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica najnowszego');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt najnowszego');
    replayLetter(h, 1, 'najnowszy', 'Tresc pierwszego.');

    await waitRt(() => f.sent.includes('listy odebrane przed 23 XII 2025'), 're-kotwica srodkowego');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt srodkowego');
    replayLetter(h, 2, 'srodkowy', 'Tresc drugiego.');

    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 're-kotwica najstarszego');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'odczyt najstarszego');
    replayLetter(h, 3, 'najstarszy', 'Tresc trzeciego.');

    await waitRt(() => notifyText(f, 'Pobrano tresci'), 'toast podsumowania');
    await waitRt(
      () => downloadBtn(h).textContent === 'Pobierz tresci do archiwum',
      'przycisk wrocil do etykiety bazowej',
    );
    assert.ok(!content.querySelector('.arkmail-busy'), 'pasek busy zgaszony');

    // Tresc w cache: klik w wiersz = podglad z pamieci, zero komend.
    const base2 = f.sent.length;
    clickArchiveRow(h, 'srodkowy');
    await wf(() => letterBodyShows(h, 'Tresc drugiego.'), 'list z cache po pobraniu');
    assert.equal(f.sent.length, base2, 'podglad z cache bez komend');

    // Brak kandydatow: kolejny start = toast, zero komend.
    click(h, '[data-tab="archiwum"]');
    const base3 = f.sent.length;
    clickDownload(h); // uzbrojenie
    clickDownload(h); // start
    // Fala 18c (swiadoma zmiana pinu): jasny toast o kompletnej bazie
    // zamiast "brak listow bez tresci".
    await wf(() => notifyText(f, 'Wszystkie listy w bazie maja tresci.'), 'toast o kompletnym archiwum');
    assert.equal(f.sent.length, base3, 'bez komend, gdy nie ma czego pobrac');
  } finally {
    await stopHarness();
  }
});

test('archiwum: pobieranie tresci - Przerwij konczy petle po biezacym liscie', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    clickDownload(h); // uzbrojenie
    clickDownload(h); // start
    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt pierwszego');

    // W trakcie petli przycisk zamienia sie w Przerwij z postepem.
    assert.ok(
      downloadBtn(h).textContent.startsWith('Przerwij'),
      'etykieta Przerwij w trakcie pobierania',
    );
    clickDownload(h); // przerwij (odczyt pierwszego listu jeszcze trwa)
    replayLetter(h, 1, 'najnowszy', 'Tresc pierwszego.');

    await waitRt(() => notifyText(f, 'Przerwano'), 'toast przerwania');
    await waitRt(
      () => downloadBtn(h).textContent === 'Pobierz tresci do archiwum',
      'koniec petli po przerwaniu',
    );
    assert.ok(!f.sent.includes('przeczytaj list 2'), 'petla stala po przerwaniu');
    assert.ok(
      !f.sent.includes('listy odebrane przed 23 XII 2025'),
      'brak kolejnej re-kotwicy po przerwaniu',
    );
  } finally {
    await stopHarness();
  }
});
