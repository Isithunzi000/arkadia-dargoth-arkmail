import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click } from './harness';
import type { Harness } from './harness';

/**
 * Fala 25 (blad 2), po kroku 4 UI-2: status indeksacji ma jedno
 * zrodlo prawdy - krok "1. Indeksacja" w zakladce Archiwum. Testy
 * pilnuja dwoch regresji z gloszenia: (1) podczas pedzela status
 * mowi "W toku: <skrzynka>, stron: M" i przycisk to "Przerwij
 * indeksowanie (N/4)", (2) przy ponownej indeksacji z kompletnym
 * indexMeta przycisk dalej pokazuje Przerwij (dawniej brama znikala,
 * bo wisiala na fladze kompletu). Sub-pigulka Osoby z Kontaktow
 * zniknela - panel jest jeden, rozjazd niemozliwy.
 */

const EMPTY_LINE: Record<string, string> = {
  odebrane: 'Nie masz zadnych odebranych listow.',
  nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
  wyslane: 'Nie masz zadnych wyslanych listow.',
  niewyslane: 'Nie masz zadnych niewyslanych listow.',
};

const paneText = (h: Harness): string =>
  (h.content as unknown as HTMLElement).textContent ?? '';

/** Odpowiada na 4 listingi indeksacji pustymi skrzynkami (do konca). */
async function finishIndexAll(h: Harness): Promise<void> {
  const { f, waitFor, content } = h;
  for (const box of ['odebrane', 'nieprzeczytane', 'wyslane', 'niewyslane']) {
    await waitFor(() => f.sent.includes(`listy ${box}`), `listing ${box}`);
    f.fire(EMPTY_LINE[box], 'mail');
    f.fire('> ', 'prompt');
  }
  await waitFor(() => ((content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'koniec indeksacji');
}

const indexButton = (h: Harness): string =>
  (h.content.querySelector('.arkmail-index-all') as unknown as HTMLElement | null)?.textContent ??
  '';

test('blad 2: archiwum pokazuje "W toku" podczas pedzla i Przerwij zamiast Indeksuj', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor } = h;
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-index-all');
    await waitFor(() => f.sent.includes('listy odebrane'), 'start indeksacji');
    // Odswiezenie zakladki = render z biezacego stanu (indexRun aktywny).
    click(h, '[data-tab="archiwum"]');
    assert.match(paneText(h), /W toku: odebrane, stron: \d+/, 'status widzi pedzel');
    assert.match(indexButton(h), /Przerwij indeksowanie \(1\/4\)/, 'przycisk to Przerwij');
    await finishIndexAll(h);
    click(h, '[data-tab="archiwum"]');
    assert.match(paneText(h), /Gotowe: wszystkie skrzynki zapisane/, 'po pedzlu pelny status');
  } finally {
    await stopHarness();
  }
});

test('blad 2: ponowna indeksacja przy kompletnym indexMeta - "Przerwij" widoczne', async () => {
  const h = await startHarness({
    indexMeta: {
      odebrane: '1999-08-09T00:00:00.000Z',
      nieprzeczytane: '1999-08-09T00:00:00.000Z',
      wyslane: '1999-08-09T00:00:00.000Z',
      niewyslane: '1999-08-09T00:00:00.000Z',
    },
  });
  try {
    const { f, waitFor } = h;
    click(h, '[data-tab="archiwum"]');
    assert.match(paneText(h), /Gotowe: wszystkie skrzynki zapisane/, 'setup: kompletny stan');
    click(h, '.arkmail-index-all');
    await waitFor(() => f.sent.includes('listy odebrane'), 'start ponownej indeksacji');
    click(h, '[data-tab="archiwum"]');
    assert.match(paneText(h), /W toku: odebrane, stron: \d+/, 'status widzi pedzel mimo kompletu');
    assert.match(
      indexButton(h),
      /Przerwij indeksowanie \(1\/4\)/,
      'przycisk to Przerwij, nie "Indeksuj wszystkie"',
    );
    await finishIndexAll(h);
  } finally {
    await stopHarness();
  }
});
