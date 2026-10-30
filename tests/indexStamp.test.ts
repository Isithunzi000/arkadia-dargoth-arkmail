import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click } from './harness';
import type { Harness } from './harness';

/**
 * Fala 25 (blad 1): status indeksacji ma odzwierciedlac rzeczywistosc.
 *
 * Zgloszenie: po "Odswiez + Wczytaj wszystkie" ze skrzynki w zakladce
 * Listy status indeksacji w Archiwum i Kontaktach pokazywal stan
 * flagowy zamiast faktow - skrzynki zweryfikowane w calosci nie
 * dostawaly stempla indexMeta, bo stempel nadawal tylko pedzel
 * indeksacji (indexAllBoxes) i "Wczytaj wszystkie" (loadAll).
 *
 * Decyzja D1: jeden stempel = "skrzynka zweryfikowana w calosci",
 * nadawany przez KAZDA sciezke pelnej wiedzy: nieuciety listing
 * fetchBoxes (refresh), pusta skrzynka (fetchBoxes reason "puste"),
 * loadAll (juz bylo), pelna indeksacja (juz bylo) oraz - decyzja D2 -
 * naturalne zakorczenie paginacji wstecz (loadOlder doszedl do dna).
 * NIE stempluja: listing uciety ani listingi filtrowane/szukane.
 */

const EMPTY_LINE: Record<string, string> = {
  odebrane: 'Nie masz zadnych odebranych listow.',
  nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
  wyslane: 'Nie masz zadnych wyslanych listow.',
  niewyslane: 'Nie masz zadnych niewyslanych listow.',
};

/**
 * Pelny refresh 4 skrzynek przez proxy.session (Fala 25: wznowienie
 * sesji odswieza wszystkie skrzynki): odebrane + wyslane z jednym
 * listem, dwie puste.
 */
async function fullRefresh4Boxes(h: Harness): Promise<void> {
  const { f, waitFor, content } = h;
  f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
  await waitFor(() => f.sent.includes('listy odebrane'), 'listing odebrane');
  f.fire('Listy odebrane:', 'mail');
  f.fire(' 1. *R* Temat: jedyny', 'mail');
  f.fire('Nadawca: Foo                        Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'listing nieprzeczytane');
  f.fire(EMPTY_LINE.nieprzeczytane, 'mail');
  await waitFor(() => f.sent.includes('listy wyslane'), 'listing wyslane');
  f.fire('Listy wyslane:', 'mail');
  f.fire(' 1. Temat: wyslany', 'mail');
  f.fire('Odbiorcy: Foo                         Wt, 23 XII 2025, 01:00:00', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => f.sent.includes('listy niewyslane'), 'listing niewyslane');
  f.fire(EMPTY_LINE.niewyslane, 'mail');
  await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');
}

const paneText = (h: Harness): string =>
  (h.content as unknown as HTMLElement).textContent ?? '';

test('blad 1 (D1): pelny refresh 4 skrzynek = kompletna indeksacja w kontaktach i archiwum', async () => {
  const h = await startHarness();
  try {
    await fullRefresh4Boxes(h);
    click(h, '[data-tab="kontakty"]');
    assert.match(
      paneText(h),
      /Kompletna indeksacja od: \d{4}-\d{2}-\d{2}/,
      'kontakty widza kompletny stan po refreshu',
    );
    click(h, '[data-tab="archiwum"]');
    assert.match(
      paneText(h),
      /Gotowe: wszystkie skrzynki zapisane\./,
      'archiwum widzi kompletny stan po refreshu',
    );
  } finally {
    await stopHarness();
  }
});

test('blad 1 (D1): same puste skrzynki w refreshu tez stempluja indeksacje', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor, content } = h;
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
    for (const box of ['odebrane', 'nieprzeczytane', 'wyslane', 'niewyslane']) {
      await waitFor(() => f.sent.includes(`listy ${box}`), `listing ${box}`);
      f.fire(EMPTY_LINE[box], 'mail');
    }
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');
    click(h, '[data-tab="kontakty"]');
    assert.match(
      paneText(h),
      /Kompletna indeksacja od: \d{4}-\d{2}-\d{2}/,
      'same puste skrzynki = kompletna wiedza o skrzynkach',
    );
  } finally {
    await stopHarness();
  }
});

test('blad 1 (D2): loadOlder do dna stempluje skrzynke i czysci luki', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor, content } = h;
    // Refresh, w ktorym odebrane wraca uciete (brak stempla), pozostale
    // trzy puste (stempel przez sciezke "puste").
    f.fireEvent('proxy.session', { resumed: true, upstreamClosed: false });
    await waitFor(() => f.sent.includes('listy odebrane'), 'listing odebrane');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Foo                        Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    for (const box of ['nieprzeczytane', 'wyslane', 'niewyslane']) {
      await waitFor(() => f.sent.includes(`listy ${box}`), `listing ${box}`);
      f.fire(EMPTY_LINE[box], 'mail');
    }
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');
    click(h, '[data-tab="archiwum"]');
    assert.match(paneText(h), /Czesciowo: 3 z 4 skrzynek/, 'ucieta skrzynka bez stempla');

    // Paginacja wstecz do pustej odpowiedzi = dno skrzynki osiagniete.
    click(h, '[data-tab="listy"]');
    click(h, '.arkmail-older');
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda paginacji wstecz',
    );
    f.fire(EMPTY_LINE.odebrane, 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec paginacji');
    click(h, '[data-tab="archiwum"]');
    assert.match(
      paneText(h),
      /Gotowe: wszystkie skrzynki zapisane\./,
      'dno skrzynki = pelna wiedza, luki wyczyszczone',
    );
  } finally {
    await stopHarness();
  }
});

test('blad 1 (D1): uciety listing NIE stempluje skrzynki', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor, content } = h;
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(() => f.sent.includes('listy odebrane'), 'listing odebrane');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Foo                        Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'listing nieprzeczytane');
    f.fire(EMPTY_LINE.nieprzeczytane, 'mail');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');
    click(h, '[data-tab="archiwum"]');
    assert.match(
      paneText(h),
      /Czesciowo: 1 z 4 skrzynek/,
      'tylko nieprzeczytane (puste) ma stempel - uciety listing nie',
    );
  } finally {
    await stopHarness();
  }
});
