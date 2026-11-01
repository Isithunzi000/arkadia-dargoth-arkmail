/**
 * Klikalne archiwum (Fala 16h).
 *
 * Zgloszenie 2026-10-19 pkt 9: "po co archiwum, jesli nie moge kliknac".
 * Wpisy archiwum byly tylko do ogladu - nie dalo sie otworzyc listu.
 *
 * Kontrakt:
 *  - wpis z trescia w cache otwiera list NATYCHMIAST z pamieci (zero
 *    komend do serwera);
 *  - wpis bez tresci idzie przez re-kotwice po dacie (jak stary wpis
 *    skrzynki) i czyta z serwera; przeczytana tresc laduje w cache;
 *  - wpis bez tresci I bez parsowalnej daty = toast lokalizacji, zadna
 *    komenda nie wylatuje na slepo.
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
import type { ArchiveLetter } from '../src/arkmail/core/archive';

/** Klik w wiersz archiwum z zadanym fragmentem tematu. */
function clickArchiveRow(h: Harness, fragment: string): void {
  const { content } = h;
  const rows = Array.from(
    content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
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

/** Pager: naglowki + body + prompt pagera i gry. */
function replayLetter(h: Harness, numer: number, subject: string, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('archiwum: wpis z trescia otwiera sie z cache, zero komend', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    // Nabijamy cache: otwieramy najnowszy list (re-kotwica po prologu).
    click(h, '.arkmail-entry');
    await waitFor(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'odczyt');
    replayLetter(h, 1, 'najnowszy', 'Tresc z cache 777.');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'list otwarty');
    // Domykamy refresh po odczycie (Fala 11f).
    await waitFor(() => f.sent.filter((c) => c === 'listy odebrane').length >= 2, 'refresh');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');

    // Archiwum: klik w wpis z trescia = podglad z pamieci, zero komend.
    click(h, '[data-tab="archiwum"]');
    const base = f.sent.length;
    clickArchiveRow(h, 'najnowszy');
    await waitFor(() => letterBodyShows(h, 'Tresc z cache 777.'), 'list otwarty z cache');
    assert.equal(f.sent.length, base, 'zadna komenda nie wyleciala');
  } finally {
    await stopHarness();
  }
});

test('archiwum: wpis bez tresci = re-kotwica po dacie i odczyt z serwera', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h); // archiwum ma 3 wpisy BEZ tresci
    click(h, '[data-tab="archiwum"]');
    const base = f.sent.length;
    clickArchiveRow(h, 'najnowszy');
    await waitFor(
      () => f.sent.slice(base).includes('listy odebrane przed 25 VIII 1999'),
      're-kotwica po dacie listu z archiwum',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.slice(base).includes('przeczytaj list 2'), 'odczyt ze swiezym numerem');
    replayLetter(h, 2, 'najnowszy', 'Tresc doczytana z serwera.');
    await waitFor(
      () => letterBodyShows(h, 'Tresc doczytana z serwera.'),
      'list otwarty z serwera',
    );

    // Tresc trafila do cache: ponowny klik = zero komend.
    click(h, '[data-tab="archiwum"]');
    const base2 = f.sent.length;
    clickArchiveRow(h, 'najnowszy');
    await waitFor(
      () => letterBodyShows(h, 'Tresc doczytana z serwera.'),
      'list otwarty z cache po doczytaniu',
    );
    assert.equal(f.sent.length, base2, 'drugie otwarcie bez komend');
  } finally {
    await stopHarness();
  }
});

test('archiwum: odzyskany rekord z dluga lista osob i jedna spacja przed data otwiera list', async () => {
  const party = 'Foo, Bar, Corge, Waldo, Baz, Grault';
  const raw = 'Pn, 20 IX 1999, 01:02:03';
  const damaged: ArchiveLetter = {
    id: 'stary-identyfikator',
    box: 'odebrane',
    number: 8,
    party: `${party} ${raw}`,
    subject: 'odzyskany',
    forwarded: false,
    dateRaw: null,
    sortKey: '0000-00-00 00:00:00',
    read: true,
    body: [],
  };
  const h = await startHarness({ archive: [damaged] });
  const { f } = h;
  try {
    click(h, '[data-tab="archiwum"]');
    clickArchiveRow(h, 'odzyskany');
    await waitRt(() => f.sent.includes('listy odebrane przed 21 IX 1999'), 're-kotwica odzyskanego listu');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 8. *R* Temat: odzyskany', 'mail');
    f.fire(`Nadawca: ${party} ${raw}`, 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 8'), 'odczyt odzyskanego listu');
    replayLetter(h, 8, 'odzyskany', 'Tresc odzyskanego listu.');
    await waitRt(() => letterBodyShows(h, 'Tresc odzyskanego listu.'), 'widok odzyskanego listu');
  } finally {
    await stopHarness();
  }
});

test('archiwum: re-kotwica znajduje list na kolejnej stronie', async () => {
  const h = await startHarness();
  const { f } = h;
  const command = 'listy odebrane przed 23 VIII 1999';
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    clickArchiveRow(h, 'najstarszy');
    await waitRt(() => f.sent.includes(command), 'pierwsza strona re-kotwicy');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 9. *R* Temat: inny', 'mail');
    f.fire('Nadawca: Foo Nd, 22 VIII 1999, 02:00:00', 'mail');
    f.fire('> ', 'prompt');

    await waitRt(() => f.sent.filter((c) => c === command).length === 2, 'druga strona re-kotwicy');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 7. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 7'), 'odczyt z drugiej strony');
    replayLetter(h, 7, 'najstarszy', 'Tresc z drugiej strony.');
    await waitRt(() => letterBodyShows(h, 'Tresc z drugiej strony.'), 'list z drugiej strony otwarty');
  } finally {
    await stopHarness();
  }
});

test('archiwum: re-kotwica nie ma dawnego limitu 40 stron', async () => {
  const h = await startHarness();
  const { f } = h;
  const command = 'listy odebrane przed 23 VIII 1999';
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    clickArchiveRow(h, 'najstarszy');
    for (let page = 1; page <= 41; page++) {
      await waitRt(
        () => f.sent.filter((c) => c === command).length === page,
        `strona ${page} re-kotwicy`,
      );
      f.fire(
        page < 41 ? 'Listy odebrane (prezentowane jest pierwsze 50):' : 'Listy odebrane:',
        'mail',
      );
      f.fire(` 7. *R* Temat: ${page === 41 ? 'najstarszy' : `inny ${page}`}`, 'mail');
      f.fire(
        `Nadawca: Foo Nd, 22 VIII 1999, ${page === 41 ? '01:15:04' : '02:00:00'}`,
        'mail',
      );
      f.fire('> ', 'prompt');
    }
    await waitRt(() => f.sent.includes('przeczytaj list 7'), 'odczyt po 41 stronach');
    replayLetter(h, 7, 'najstarszy', 'Tresc poza dawnym limitem.');
    await waitRt(() => letterBodyShows(h, 'Tresc poza dawnym limitem.'), 'list poza dawnym limitem otwarty');
  } finally {
    await stopHarness();
  }
});

test('archiwum: wpis bez tresci i bez daty = toast, zadna komenda nie wylatuje', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    // Wpis bez daty (linia strony bez daty): refresh dokleja do archiwum.
    click(h, '[data-box="odebrane"]');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length >= 2,
      'refresh odebranych',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 4. Temat: bezdatny', 'mail');
    f.fire('Nadawca: Bezdatny', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');

    click(h, '[data-tab="archiwum"]');
    const base = f.sent.length;
    clickArchiveRow(h, 'bezdatny');
    await waitFor(
      // Fala 17f: komunikat po ludzku ("zlokalizowac" zastapione).
      () => notifyText(f, 'Nie moge znalezc tego listu'),
      'toast o braku lokalizacji',
    );
    assert.equal(f.sent.length, base, 'zadna komenda nie wyleciala');
  } finally {
    await stopHarness();
  }
});
