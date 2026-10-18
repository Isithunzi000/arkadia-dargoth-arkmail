/**
 * Cache archiwum (Fala 8f) - integracja przez skompilowany index.ts.
 *
 * Decyzje:
 * - KAZDE pobranie listingu (pelne skrzynki i strony starsze) dokleja
 *   wpisy do archiwum - po to jest cache, zeby nie odswiezac w kolko.
 * - Otwarcie listu dokleja jego TRESC pod id zgodnym z wpisem listingu
 *   (flaga forwarded z wpisu; fallback: naglowki pagera, strona listu
 *   po kierunku skrzynki).
 * - Widok skrzynek NIE jest hydratowany z cache (ryzyko przesuniecia
 *   numeracji - numery zyja w kontekscie ostatniego listingu serwera).
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

const setInput = (h: Harness, selector: string, value: string): void => {
  const el = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  el.value = value;
  el.dispatchEvent(new h.window.Event('input'));
};

test('cache: pelny listing skrzynki dokleja wpisy do archiwum (bez paginacji)', async () => {
  const h = await startHarness();
  const { waitFor, content } = h;
  try {
    await loadTruncatedBox(h); // samo pobranie listingow, zadnej paginacji
    click(h, '[data-tab="archiwum"]');
    await waitFor(
      () => content.querySelectorAll('.arkmail-arch-entry').length === 3,
      'trzy wpisy z listingu w archiwum',
    );
    const rows = [...content.querySelectorAll('.arkmail-arch-entry')] as {
      textContent?: string;
    }[];
    assert.ok(
      rows.some((r) => String(r.textContent ?? '').includes('Corge')),
      'wpisy maja strony listu z listingu',
    );
  } finally {
    await stopHarness();
  }
});

test('cache: otwarcie listu dokleja jego tresc do archiwum (id zgodne z listingiem)', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);

    // Otwieramy list numer 1 (najnowszy, od Corge) - pager flow z logow.
    const firstRow = content.querySelector('.arkmail-entry') as {
      dispatchEvent(e: unknown): void;
    };
    firstRow.dispatchEvent(new h.window.Event('click'));
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'komenda czytania listu');
    f.fire('List : 1', 'mail');
    f.fire('Od   : Corge', 'mail');
    f.fire('Temat: najnowszy', 'mail');
    f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('', 'mail');
    f.fire('Unikalna tresc karteczki 4242.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'widok listu otwarty');

    // Tresc trafila do archiwum: filtr tresci znajduje DOKLADNIE ten list.
    click(h, '[data-tab="archiwum"]');
    await waitFor(
      () => content.querySelectorAll('.arkmail-arch-entry').length === 3,
      'archiwum dalej ma 3 wpisy (upsert po id, bez duplikatu)',
    );
    setInput(h, '[data-filter="tresc"]', '4242');
    await waitFor(
      () => content.querySelectorAll('.arkmail-arch-entry').length === 1,
      'filtr tresci trafia w zcacheowane body',
    );
    assert.ok(
      textOf(h, '.arkmail-arch-entry').includes('Corge'),
      'trafiony wpis to otwarty list',
    );
  } finally {
    await stopHarness();
  }
});
