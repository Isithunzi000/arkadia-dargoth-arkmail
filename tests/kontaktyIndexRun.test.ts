import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click } from './harness';
import type { Harness } from './harness';

/**
 * Fala 25 (blad 2): kontakty nie widzialy statusu indeksacji.
 *
 * Zgloszenie: po zrobieniu indeksacji w zakladce Archiwum i przejsciu
 * do Kontaktow status indeksacji pokazywal inny stan niz Archiwum -
 * stopka kontaktow ignorowala state.indexRun (pokazywala tylko
 * flagowy "niekompletna"/"Kompletna..."), a brama z przyciskiem
 * "Przerwij indeksowanie" znikala, gdy indexMeta bylo kompletne,
 * wiec przy ponownej indeksacji nie dalo sie jej przerwac z tej
 * zakladki.
 *
 * Oczekiwanie (decyzja D3): gdy pedzel indeksacji dziala, stopka
 * kontaktow pokazuje "Indeksowanie w toku: <skrzynka> (N/4), stron: M"
 * (jak "W toku: ..." w archiwum - oba panele sie zgadzaja), a przycisk
 * "Przerwij indeksowanie" jest widoczny ZAWSZE, gdy pedzel dziala,
 * takze przy kompletnym indexMeta.
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
  await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec indeksacji');
}

test('blad 2 (D3): kontakty pokazuja "Indeksowanie w toku" podczas pedzla (zgodnie z archiwum)', async () => {
  const h = await startHarness();
  try {
    const { f, waitFor } = h;
    click(h, '[data-tab="kontakty"]');
    click(h, '.arkmail-index-all');
    await waitFor(() => f.sent.includes('listy odebrane'), 'start indeksacji');
    // Odswiezenie zakladki = render z biezacego stanu (indexRun aktywny).
    click(h, '[data-tab="kontakty"]');
    assert.match(
      paneText(h),
      /Indeksowanie trwa: odebrane \(1\/4\), stron: \d+/,
      'stopka kontaktow widzi pedzel',
    );
    // Zgodnosc z archiwum: ten sam przebieg pokazuje "W toku" i tam.
    click(h, '[data-tab="archiwum"]');
    assert.match(paneText(h), /W toku: odebrane, stron: \d+/, 'archiwum widzi ten sam pedzel');
    click(h, '[data-tab="kontakty"]');
    await finishIndexAll(h);
    assert.match(
      paneText(h),
      /Kompletna indeksacja od: \d{4}-\d{2}-\d{2}/,
      'po pedzlu znow pelny status',
    );
  } finally {
    await stopHarness();
  }
});

test('blad 2 (D3): ponowna indeksacja przy kompletnym indexMeta - "Przerwij" widoczne w kontaktach', async () => {
  const h = await startHarness({
    indexMeta: {
      odebrane: '2025-12-01T00:00:00.000Z',
      nieprzeczytane: '2025-12-01T00:00:00.000Z',
      wyslane: '2025-12-01T00:00:00.000Z',
      niewyslane: '2025-12-01T00:00:00.000Z',
    },
  });
  try {
    const { f, waitFor, content } = h;
    click(h, '[data-tab="kontakty"]');
    assert.match(paneText(h), /Kompletna indeksacja od: 2025-12-01/, 'setup: kompletny stan');
    // Ponowna indeksacja startuje z archiwum (tam przycisk jest zawsze).
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-index-all');
    await waitFor(() => f.sent.includes('listy odebrane'), 'start ponownej indeksacji');
    click(h, '[data-tab="kontakty"]');
    assert.match(
      paneText(h),
      /Indeksowanie trwa: odebrane \(1\/4\)/,
      'stopka widzi pedzel mimo kompletnego indexMeta',
    );
    assert.ok(
      content.querySelector('.arkmail-index-all'),
      'przycisk Przerwij widoczny podczas ponownej indeksacji',
    );
    assert.match(
      (content.querySelector('.arkmail-index-all') as unknown as HTMLElement).textContent ?? '',
      /Przerwij indeksowanie \(1\/4\)/,
      'przycisk to Przerwij, nie "Indeksuj wszystkie"',
    );
    await finishIndexAll(h);
  } finally {
    await stopHarness();
  }
});
