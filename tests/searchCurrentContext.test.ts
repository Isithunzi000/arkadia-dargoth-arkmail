/** Aktualny wynik wyszukiwania zachowuje numer nadany przez serwer. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { click, startHarness, stopHarness, type Harness } from './harness';

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

function replySearch(h: Harness, rows: readonly number[]): void {
  h.f.fire('Wybrane listy odebrane:', 'mail');
  for (const number of rows) {
    h.f.fire(` ${number}. *R* Temat: wynik ${number}`, 'mail');
    h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

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
  replySearch(h, rows);
  await h.waitFor(
    () => h.content.querySelectorAll('.arkmail-entry').length === rows.length,
    'wyniki wyszukiwania',
  );
}

function clickVisibleRow(h: Harness, index: number): void {
  const row = h.content.querySelectorAll('.arkmail-entry')[index] as unknown as {
    dispatchEvent(event: unknown): void;
  };
  row.dispatchEvent(new h.window.Event('click'));
}

const readCommands = (h: Harness): string[] =>
  h.f.sent.filter((command) => command.startsWith('przeczytaj list'));

for (const [visibleIndex, serverNumber] of [[0, 4], [1, 9]] as const) {
  test(`aktualny wynik: widoczny wiersz ${visibleIndex + 1} czyta numer serwera ${serverNumber}`, async () => {
    const h = await startHarness({ autoRefreshEnabled: false });
    try {
      await prepareSearch(h, [9, 4]);
      const rows = h.content.querySelectorAll('.arkmail-entry');
      const row = rows[visibleIndex] as unknown as {
        querySelector(selector: string): { textContent: string | null } | null;
      };
      assert.equal(row.querySelector('.arkmail-entry-num')?.textContent, `${visibleIndex + 1}.`);

      clickVisibleRow(h, visibleIndex);
      await drain();

      assert.equal(h.f.sent.filter((command) => command === SEARCH).length, 1, 'bez drugiego listingu');
      assert.deepEqual(readCommands(h), [`przeczytaj list ${serverNumber}`]);
    } finally {
      await stopHarness();
    }
  });
}
