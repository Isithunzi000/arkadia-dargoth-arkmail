/** Aktualny kontekst wyszukiwania nie wymaga drugiego listingu. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  click,
  startHarness,
  stopHarness,
  type Harness,
} from './harness';

const DATE = 'Wt, 24 VIII 1999, 00:11:12';
const SEARCH = 'listy odebrane od corge';

const drain = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const setInput = (h: Harness, selector: string, value: string): void => {
  const element = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(event: unknown): void;
  };
  element.value = value;
  element.dispatchEvent(new h.window.Event('input'));
};

async function prepareSearch(h: Harness, rows: readonly number[]): Promise<void> {
  click(h, '[data-box="odebrane"]');
  await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'poczatkowy listing');
  h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
  h.f.fire('> ', 'prompt');
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, 'koniec poczatkowego listingu');

  setInput(h, '[data-search="osoba"]', 'Corge');
  click(h, '.arkmail-search-go');
  await h.waitFor(() => h.f.sent.includes(SEARCH), 'wyszukiwanie');
  h.f.fire('Wybrane listy odebrane:', 'mail');
  for (const number of rows) {
    h.f.fire(` ${number}. *R* Temat: blizniak`, 'mail');
    h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
  await h.waitFor(
    () => h.content.querySelectorAll('.arkmail-entry').length === rows.length,
    'wyniki wyszukiwania',
  );
}

for (const rows of [[1, 2], [2, 1]] as const) {
  for (const selected of rows) {
    test(`aktualny wynik ${rows.join(',')}: wiersz ${selected} czyta od razu wlasciwy numer`, async () => {
      const h = await startHarness({ autoRefreshEnabled: false });
      try {
        await prepareSearch(h, rows);
        click(h, `.arkmail-entry[data-number="${selected}"]`);
        await drain();

        assert.equal(h.f.sent.filter((command) => command === SEARCH).length, 1, 'bez drugiego listingu');
        assert.deepEqual(
          h.f.sent.filter((command) => command.startsWith('przeczytaj list')),
          [`przeczytaj list ${selected}`],
          'numer pochodzi z kliknietego aktualnego wiersza',
        );
      } finally {
        await stopHarness();
      }
    });
  }
}
