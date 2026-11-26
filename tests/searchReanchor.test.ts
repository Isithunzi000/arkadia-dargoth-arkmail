/** Bezpieczna ponowna kotwica wynikow wyszukiwania. Wszystkie dane sa syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types';
import {
  click,
  notifyText,
  startHarness,
  stopHarness,
  type Harness,
} from './harness';

const BOXES = ['odebrane', 'nieprzeczytane', 'wyslane', 'niewyslane'] as const;
const DATE = 'Wt, 24 VIII 1999, 00:11:12';

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

function replyListing(
  h: Harness,
  box: MailBox,
  rows: readonly Row[],
  prompt = true,
  filtered = true,
): void {
  h.f.fire(filtered ? `Wybrane listy ${box}:` : `Listy ${box} (prezentowane jest pierwsze 50):`, 'mail');
  for (const row of rows) {
    h.f.fire(` ${row.number}. ${row.read === false ? '' : '*R* '}Temat: ${row.subject ?? 'wybrany'}`, 'mail');
    const label = box === 'odebrane' || box === 'nieprzeczytane' ? 'Nadawca' : 'Odbiorca';
    h.f.fire(`${label}: ${row.party ?? 'Corge'}                       ${DATE}`, 'mail');
  }
  if (prompt) h.f.fire('> ', 'prompt');
}

async function expireServerListing(h: Harness, resultBox: MailBox): Promise<void> {
  const incoming = resultBox === 'wyslane' || resultBox === 'niewyslane';
  const boxes = incoming
    ? ['odebrane', 'nieprzeczytane'] as const
    : ['niewyslane', 'wyslane'] as const;
  h.f.fireEvent('gmcp.mail.state', {
    unread: incoming,
    unreceived: incoming,
    unsent: !incoming,
  });
  for (const box of boxes) {
    await h.waitFor(() => h.f.sent.includes(`listy ${box}`), `listing zmieniajacy kontekst: ${box}`);
    h.f.fire(emptyLine[box], 'mail');
    h.f.fire('> ', 'prompt');
  }
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, 'koniec listingu zmieniajacego kontekst');
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

function replayLetter(h: Harness, number: number): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Corge', 'mail');
  h.f.fire('Temat: wybrany', 'mail');
  h.f.fire(`Data : ${DATE}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Syntetyczna tresc.', 'mail');
  h.f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
  h.f.fire('> ', 'prompt');
}

test('wyszukiwanie: kazda skrzynka ponawia pierwotny filtr i czyta dopiero swiezy numer', async () => {
  for (const box of BOXES) {
    const h = await startHarness();
    try {
      const initialRows = [
        { number: 2, subject: 'inny' },
        { number: 1, subject: 'wybrany' },
      ] as const;
      await preparePersonSearch(h, box, initialRows);
      setInput(h, '[data-search="osoba"]', 'Waldo');
      setInput(h, '[data-search="temat"]', 'pozniejsza zmiana');
      await expireServerListing(h, box);
      click(h, '.arkmail-entry[data-number="1"]');
      await h.waitFor(
        () => h.f.sent.filter((command) => command === searchCommand(box)).length === 2,
        `ponowna kotwica pierwotnego filtra ${box}`,
      );
      assert.equal(h.f.sent.filter((command) => command.startsWith('przeczytaj list')).length, 0);
      assert.ok(!h.f.sent.some((command) => command.includes('przed 25 VIII 1999')));

      replyListing(h, box, [
        { number: 2, subject: 'wybrany' },
        { number: 1, subject: 'inny' },
      ]);
      await h.waitFor(() => h.f.sent.includes('przeczytaj list 2'), `swiezy odczyt ${box}`);
      assert.ok(!h.f.sent.includes('przeczytaj list 1'), `stary numer nie jest uzyty ${box}`);
      assert.ok(!h.f.sent.some((command) => command.includes('waldo')));
    } finally {
      await stopHarness();
    }
  }
});

test('wyszukiwanie: znikniecie wpisu po archiveId przerywa bez odczytu', async () => {
  const h = await startHarness();
  try {
    await preparePersonSearch(h, 'odebrane');
    await expireServerListing(h, 'odebrane');
    click(h, '.arkmail-entry');
    await h.waitFor(
      () => h.f.sent.filter((command) => command === searchCommand('odebrane')).length === 2,
      'ponowna kotwica',
    );
    replyListing(h, 'odebrane', [{ number: 1, subject: 'inny wpis' }]);
    await h.waitFor(() => notifyText(h.f, 'Nie mozna odnalezc tego listu'), 'komunikat o zniknieciu');
    assert.ok(!h.f.sent.some((command) => command.startsWith('przeczytaj list')));
  } finally {
    await stopHarness();
  }
});

test('wyszukiwanie: blizniacze wpisy na swiezej kotwicy przerywaja przed odczytem', async () => {
  const h = await startHarness();
  try {
    await selectEmptyBox(h, 'odebrane');
    setInput(h, '[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes(searchCommand('odebrane')), 'pierwotne wyszukiwanie');
    replyListing(h, 'odebrane', [
      { number: 3, subject: 'blizniak' },
      { number: 2, subject: 'inny' },
      { number: 1, subject: 'blizniak' },
    ]);
    await h.waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === 3, 'dwa blizniaki');
    await expireServerListing(h, 'odebrane');
    click(h, '.arkmail-entry[data-number="1"]');
    await h.waitFor(
      () => h.f.sent.filter((command) => command === searchCommand('odebrane')).length === 2,
      'kotwica blizniaka',
    );
    replyListing(h, 'odebrane', [
      { number: 3, subject: 'blizniak' },
      { number: 2, subject: 'blizniak' },
      { number: 1, subject: 'inny' },
    ]);
    await h.waitFor(
      () => notifyText(h.f, 'identyczne wpisy') || h.f.sent.some((command) => command.startsWith('przeczytaj list')),
      'zakonczenie niejednoznacznej kotwicy',
    );
    assert.ok(notifyText(h.f, 'identyczne wpisy'), 'komunikat o niejednoznacznej kotwicy');
    assert.equal(
      h.f.sent.filter((command) => command.startsWith('przeczytaj list')).length,
      0,
      'nie wolno zgadywac numeru jednego z blizniakow',
    );
  } finally {
    await stopHarness();
  }
});

test('wyszukiwanie: pierwszy zly numer daje jedna ponowna kotwice, drugi konczy bez trzeciej', async () => {
  const h = await startHarness();
  try {
    await preparePersonSearch(h, 'odebrane');
    await expireServerListing(h, 'odebrane');
    click(h, '.arkmail-entry');
    await h.waitFor(
      () => h.f.sent.filter((command) => command === searchCommand('odebrane')).length === 2,
      'pierwsza kotwica',
    );
    replyListing(h, 'odebrane', [{ number: 1 }]);
    await h.waitFor(() => h.f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');
    h.f.fire('Zly numer listu: 1.', 'mail');
    h.f.fire('> ', 'prompt');

    await h.waitFor(
      () => h.f.sent.filter((command) => command === searchCommand('odebrane')).length === 3,
      'jedyna ponowna kotwica po bledzie',
    );
    assert.equal(h.f.sent.filter((command) => command.startsWith('przeczytaj list')).length, 1);
    replyListing(h, 'odebrane', [{ number: 1 }]);
    await h.waitFor(() => h.f.sent.filter((command) => command === 'przeczytaj list 1').length === 2, 'drugi odczyt');
    h.f.fire('Zly numer listu: 1.', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(() => notifyText(h.f, 'Nie udalo sie odczytac listu.'), 'koniec po drugim bledzie');

    assert.equal(h.f.sent.filter((command) => command === searchCommand('odebrane')).length, 3);
    assert.deepEqual(
      h.f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 1', 'przeczytaj list 1'],
    );
  } finally {
    await stopHarness();
  }
});

test('wyszukiwanie: utrata wyboru listingu ponawia filtr i odczytuje swiezy numer', async () => {
  const h = await startHarness();
  try {
    await preparePersonSearch(h, 'odebrane');
    await expireServerListing(h, 'odebrane');
    click(h, '.arkmail-entry');
    await h.waitFor(
      () => h.f.sent.filter((command) => command === searchCommand('odebrane')).length === 2,
      'pierwsza kotwica',
    );
    replyListing(h, 'odebrane', [{ number: 1 }]);
    await h.waitFor(() => h.f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');
    h.f.fire('Zadne listy nie zostaly wybrane.', 'mail');
    h.f.fire('> ', 'prompt');

    await h.waitFor(
      () => h.f.sent.filter((command) => command === searchCommand('odebrane')).length === 3,
      'kotwica po utracie wyboru',
    );
    replyListing(h, 'odebrane', [{ number: 1 }]);
    await h.waitFor(() => h.f.sent.filter((command) => command === 'przeczytaj list 1').length === 2, 'odczyt po ponownej kotwicy');
    replayLetter(h, 1);
    await h.waitFor(() => h.content.querySelector('.arkmail-letter-body') !== null, 'otwarty list');
  } finally {
    await stopHarness();
  }
});

test('produkcja: prompt i cisza koncza listing, a aktualny wynik czyta bez drugiej kotwicy', async (context) => {
  const h = await startHarness();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = async (): Promise<void> => {
    await new Promise<void>((resolve) => { setImmediate(resolve); });
  };
  try {
    setInput(h, '[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes(searchCommand('odebrane')), 'wyszukiwanie z promptem');
    replyListing(h, 'odebrane', [{ number: 1, subject: 'natychmiast' }]);
    await h.waitFor(() => h.content.querySelector('.arkmail-entry[data-number="1"]') !== null, 'natychmiastowy wynik');

    setInput(h, '[data-search="osoba"]', 'Waldo');
    click(h, '.arkmail-search-go');
    await h.waitFor(() => h.f.sent.includes(searchCommand('odebrane', 'waldo')), 'wyszukiwanie bez promptu');
    replyListing(h, 'odebrane', [
      { number: 2, subject: 'po ciszy' },
      { number: 1, subject: 'inny' },
    ], false);
    context.mock.timers.tick(499);
    await flush();
    assert.equal(h.content.querySelector('.arkmail-entry[data-number="2"]'), null, '499 ms nadal czeka');
    context.mock.timers.tick(1);
    await h.waitFor(() => h.content.querySelector('.arkmail-entry[data-number="2"]') !== null, 'wynik przy 500 ms');

    click(h, '.arkmail-entry[data-number="2"]');
    await h.waitFor(() => h.f.sent.includes('przeczytaj list 2'), 'odczyt aktualnego wyniku');
    assert.equal(
      h.f.sent.filter((command) => command === searchCommand('odebrane', 'waldo')).length,
      1,
      'aktualny kontekst nie dostaje drugiego listingu',
    );
    replayLetter(h, 2);
    await h.waitFor(() => h.content.querySelector('.arkmail-letter-body') !== null, 'otwarty list');
  } finally {
    context.mock.timers.reset();
    await stopHarness();
  }
});
