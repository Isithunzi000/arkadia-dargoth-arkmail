/** Nieaktualny wynik filtra korzysta ze wspolnego odnajdywania po dacie i archiveId. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types';
import { click, notifyText, startHarness, stopHarness, type Harness } from './harness';

const BOXES = ['odebrane', 'nieprzeczytane', 'wyslane', 'niewyslane'] as const;
const DATE = 'Wt, 24 VIII 1999, 00:11:12';
const ANCHOR_DAY = '25 VIII 1999';

interface Row {
  number: number;
  subject?: string;
  party?: string;
  read?: boolean;
}

const setInput = (h: Harness, selector: string, value: string): void => {
  const element = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(event: unknown): void;
  };
  element.value = value;
  element.dispatchEvent(new h.window.Event('input'));
};

const emptyLine: Record<MailBox, string> = {
  odebrane: 'Nie masz zadnych odebranych listow.',
  nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
  wyslane: 'Nie masz zadnych wyslanych listow.',
  niewyslane: 'Nie masz zadnych niewyslanych listow.',
};

const searchCommand = (box: MailBox, person = 'corge'): string =>
  `listy ${box} ${box === 'odebrane' || box === 'nieprzeczytane' ? 'od' : 'do'} ${person}`;
const anchorCommand = (box: MailBox): string => `listy ${box} przed ${ANCHOR_DAY}`;

function replyListing(
  h: Harness,
  box: MailBox,
  rows: readonly Row[],
  filtered = true,
): void {
  h.f.fire(filtered ? `Wybrane listy ${box}:` : `Listy ${box} (prezentowane jest pierwsze 50):`, 'mail');
  for (const row of rows) {
    h.f.fire(` ${row.number}. ${row.read === false ? '' : '*R* '}Temat: ${row.subject ?? 'wybrany'}`, 'mail');
    const label = box === 'odebrane' || box === 'nieprzeczytane' ? 'Nadawca' : 'Odbiorca';
    h.f.fire(`${label}: ${row.party ?? 'Corge'}                       ${DATE}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

async function selectEmptyBox(h: Harness, box: MailBox): Promise<void> {
  click(h, `[data-box="${box}"]`);
  await h.waitFor(() => h.f.sent.includes(`listy ${box}`), `poczatkowy listing ${box}`);
  h.f.fire(emptyLine[box], 'mail');
  h.f.fire('> ', 'prompt');
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, `koniec poczatkowego listingu ${box}`);
}

async function preparePersonSearch(
  h: Harness,
  box: MailBox,
  rows: readonly Row[] = [{ number: 1 }],
): Promise<void> {
  await selectEmptyBox(h, box);
  setInput(h, '[data-search="osoba"]', 'Corge');
  click(h, '.arkmail-search-go');
  await h.waitFor(() => h.f.sent.includes(searchCommand(box)), `wyszukiwanie ${box}`);
  replyListing(h, box, rows);
  await h.waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === rows.length, `wynik ${box}`);
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, `koniec wyszukiwania ${box}`);
}

async function expireServerListing(h: Harness, resultBox: MailBox): Promise<void> {
  const other = resultBox === 'wyslane' || resultBox === 'niewyslane' ? 'odebrane' : 'wyslane';
  click(h, `[data-box="${other}"]`);
  await h.waitFor(() => h.f.sent.includes(`listy ${other}`), 'listing zmieniajacy kontekst');
  h.f.fire(emptyLine[other], 'mail');
  h.f.fire('> ', 'prompt');
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, 'koniec listingu zmieniajacego kontekst');
}

interface ClickableEntry {
  dispatchEvent(event: unknown): void;
}

function selectedEntry(h: Harness, number = 1): ClickableEntry {
  const row = h.content.querySelector(`.arkmail-entry[data-number="${number}"]`) as unknown as ClickableEntry | null;
  assert.ok(row, 'wybrany wpis istnieje przed zmiana kontekstu');
  return row;
}

function clickEntry(h: Harness, row: ClickableEntry): void {
  row.dispatchEvent(new h.window.Event('click'));
}

test('nieaktualny filtr: kazda skrzynka uzywa listingu po dacie i swiezego numeru serwera', async () => {
  for (const box of BOXES) {
    const h = await startHarness({ autoRefreshEnabled: false });
    try {
      await preparePersonSearch(h, box, [
        { number: 2, subject: 'inny' },
        { number: 1, subject: 'wybrany' },
      ]);
      setInput(h, '[data-search="osoba"]', 'Waldo');
      const selected = selectedEntry(h);
      await expireServerListing(h, box);
      clickEntry(h, selected);

      await h.waitFor(() => h.f.sent.includes(anchorCommand(box)), `kotwica po dacie ${box}`);
      assert.equal(h.f.sent.filter((command) => command === searchCommand(box)).length, 1, 'bez ponawiania filtra');
      assert.equal(h.f.sent.filter((command) => command.startsWith('przeczytaj list')).length, 0);

      replyListing(h, box, [
        { number: 4, subject: 'wybrany' },
        { number: 3, subject: 'inny' },
      ], false);
      await h.waitFor(() => h.f.sent.includes('przeczytaj list 4'), `swiezy odczyt ${box}`);
      assert.ok(!h.f.sent.includes('przeczytaj list 1'), `stary numer nie jest uzyty ${box}`);
      assert.ok(!h.f.sent.some((command) => command.includes('waldo')));
    } finally {
      await stopHarness();
    }
  }
});

test('nieaktualny filtr: pierwszy zly numer ma jedna ponowna kotwice, drugi konczy operacje', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    await preparePersonSearch(h, 'odebrane');
    const selected = selectedEntry(h);
    await expireServerListing(h, 'odebrane');
    clickEntry(h, selected);

    await h.waitFor(() => h.f.sent.includes(anchorCommand('odebrane')), 'pierwsza kotwica');
    replyListing(h, 'odebrane', [{ number: 1 }], false);
    await h.waitFor(() => h.f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');
    h.f.fire('Zly numer listu: 1.', 'mail');
    h.f.fire('> ', 'prompt');

    await h.waitFor(
      () => h.f.sent.filter((command) => command === anchorCommand('odebrane')).length === 2,
      'jedyna ponowna kotwica',
    );
    replyListing(h, 'odebrane', [{ number: 2 }], false);
    await h.waitFor(() => h.f.sent.includes('przeczytaj list 2'), 'drugi odczyt ze swiezym numerem');
    h.f.fire('Zly numer listu: 2.', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(() => notifyText(h.f, 'Nie udalo sie odczytac listu.'), 'koniec po drugim bledzie');

    assert.equal(h.f.sent.filter((command) => command === anchorCommand('odebrane')).length, 2);
    assert.deepEqual(
      h.f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 1', 'przeczytaj list 2'],
    );
  } finally {
    await stopHarness();
  }
});
