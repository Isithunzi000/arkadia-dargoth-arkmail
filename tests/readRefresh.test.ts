/**
 * Odswiezenie po odczycie (Fala 11f): po pomyslnym przeczytaniu listu
 * skrzynka pobiera swiezy listing - znacznik przeczytania i badge to
 * prawda serwerowa, plugin niczego nie zaznacza lokalnie. Wyjatek:
 * tryb wynikow szukania - refresh nie wywala gracza z wynikow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  textOf,
  type Harness,
} from './harness';

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

/** Laduje odebrane z NIEPRZECZYTANYM najnowszym listem (numer 1). */
async function loadBoxWithUnread(h: Harness): Promise<void> {
  const { f, waitFor, content } = h;
  f.fire(' [ POCZTA ] Masz nowa poczte od Corge.');
  await waitFor(() => f.sent.includes('listy odebrane'), 'komenda listy odebrane');
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire(' 1. Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'komenda listy nieprzeczytane');
  // Pusta odpowiedz: bez stampEntries kontekst listingu zostaje przy
  // odebranych, wiec klik w wpis nie strzela re-kotwica (jak 9a).
  f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 3, '3 wiersze');
  // Fala 13a: koniec prologu = sesja zamknieta (jak w loadTruncatedBox) -
  // wiersze renderuja sie przed koncem fetchu nieprzeczytanych.
  await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec sesji prologu');
}

test('odczyt listu odswieza skrzynke - znacznik R przychodzi z serwera', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadBoxWithUnread(h);
    const row = () =>
      content.querySelector('.arkmail-entry') as unknown as { className: string } | null;
    assert.ok(row()!.className.includes('arkmail-unread'), 'najnowszy nieprzeczytany');
    const listingsBefore = f.sent.filter((c) => c === 'listy odebrane').length;

    click(h, '.arkmail-entry'); // najnowszy (numer 1, biezacy kontekst)
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'przeczytaj list 1');
    replayLetter(h, 1);
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'list otwarty');

    // Po odczycie plugin pobiera swiezy listing tej skrzynki.
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === listingsBefore + 1,
      'refresh skrzynki po odczycie',
    );
    // Serwer potwierdza przeczytanie - dopiero TO zmienia widok.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    // Powrot do listingu (waski: 'Zamknij list') - znacznik z serwera.
    click(h, '.arkmail-older');
    await waitFor(() => {
      const r = row();
      return !!r && !r.className.includes('arkmail-unread');
    }, 'znacznik nieprzeczytany zniknal po potwierdzeniu serwera');
  } finally {
    await stopHarness();
  }
});

test('odczyt w trybie wynikow szukania NIE odswieza (wyniki zostaja)', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    const setInput = (selector: string, value: string): void => {
      const el = content.querySelector(selector) as unknown as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      el.value = value;
      el.dispatchEvent(new h.window.Event('input'));
    };
    setInput('[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await waitFor(() => f.sent.includes('listy odebrane od Corge'), 'komenda szukania');
    f.fire('Wybrane listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 1, 'wynik w widoku');

    click(h, '.arkmail-entry');
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'przeczytaj z wynikow');
    replayLetter(h, 1);
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'list otwarty');

    // Powrot do wynikow: banner i selekcja zostaja, zero refreshu.
    click(h, '.arkmail-older'); // waski: 'Zamknij list'
    await waitFor(
      () => textOf(h, '.arkmail-search-banner').includes('Corge'),
      'banner wynikow zostaje po odczycie',
    );
    assert.equal(content.querySelectorAll('.arkmail-entry').length, 1, 'wyniki nietkniete');
    assert.ok(
      !f.sent.some((c) => c === 'listy odebrane' && f.sent.indexOf(c) > f.sent.indexOf('przeczytaj list 1')),
      'brak refreshu pelnego listingu po odczycie w trybie wynikow',
    );
  } finally {
    await stopHarness();
  }
});
