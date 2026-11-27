/** Regresje odczytu i recznej poczty. Wszystkie dane sa syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  click,
  loadTruncatedBox,
  notifyText,
  startHarness,
  stopHarness,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const DATE = 'Wt, 24 VIII 1999, 00:11:12';
const SEARCH = 'listy odebrane od corge';

const drain = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const setInput = (h: Harness, value: string): void => {
  const element = h.content.querySelector('[data-search="osoba"]') as unknown as {
    value: string;
    dispatchEvent(event: unknown): void;
  };
  element.value = value;
  element.dispatchEvent(new h.window.Event('input'));
};

function feedLetter(h: Harness, number: number, subject: string): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Corge', 'mail');
  h.f.fire(`Temat: ${subject}`, 'mail');
  h.f.fire(`Data : ${DATE}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire(`Tresc: ${subject}`, 'mail');
  h.f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
  h.f.fire('> ', 'prompt');
}

async function prepareCurrentOrdinaryListing(h: Harness): Promise<void> {
  click(h, '[data-box="odebrane"]');
  await waitRt(() => h.f.sent.includes('listy odebrane'), 'zwykly listing');
  h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  h.f.fire(' 1. *R* Temat: zwykly', 'mail');
  h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
  h.f.fire('> ', 'prompt');
  await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec zwyklego listingu');
}

test('zwykly odczyt: echo wlasnej komendy nie moze anulowac odczytu ani wypuscic tresci do konsoli', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    await prepareCurrentOrdinaryListing(h);
    click(h, '.arkmail-entry');
    await waitRt(() => h.f.sent.includes('przeczytaj list 1'), 'komenda odczytu');

    // Wariant strumienia, w ktorym klient dostarcza linie komendy mimo echo=false.
    h.f.fire('→ przeczytaj list 1', 'command');
    await drain(); // odpowiedz serwera przychodzi juz po anulowaniu sesji
    feedLetter(h, 1, 'zwykly');
    await drain();

    const state = JSON.stringify({
      body: textOf(h, '.arkmail-letter-body'),
      gagged: h.f.gagged,
      sent: h.f.sent,
      modalHookActive: h.f.hookCb !== null,
    });
    assert.ok(
      textOf(h, '.arkmail-letter-body').includes('Tresc: zwykly'),
      `list ma zostac otwarty w ArkMailu; stan=${state}`,
    );
    assert.ok(h.f.gagged.includes('Tresc: zwykly'), 'tresc ma zostac zagagowana');
    assert.ok(
      !h.f.shown.some((entry) => String(entry).includes('Reczna poczta w grze przerwala')),
      'wlasny odczyt nie jest reczna poczta gracza',
    );
  } finally {
    await stopHarness();
  }
});

for (const withEcho of [true, false]) {
  test(`reczne q bez aktywnego modalu odblokowuje interfejs (echo=${withEcho})`, async () => {
    const h = await startHarness({ autoRefreshEnabled: false });
    try {
      await prepareCurrentOrdinaryListing(h);
      h.f.fire('→ przeczytaj list 1', 'info');
      await drain();
      const shownBefore = h.f.shown.length;

      await h.f.api.command.send('q', false);
      if (withEcho) h.f.fire('→ q', 'info');
      await drain();
      click(h, '[data-box="wyslane"]');
      await drain();

      const state = JSON.stringify({
        sent: h.f.sent,
        shown: h.f.shown.slice(shownBefore),
        modalHookActive: h.f.hookCb !== null,
      });
      assert.equal(h.f.sent.filter((command) => command === 'q').length, 1, 'q przechodzi dokladnie raz');
      assert.ok(
        h.f.sent.includes('listy wyslane'),
        `samo q ma odblokowac reczna operacje bez czekania na prompt; stan=${state}`,
      );
      assert.ok(
        !notifyText(h.f, 'Najpierw zakoncz reczna sesje poczty w grze'),
        'po q nie moze zostac blokada recznej poczty',
      );
    } finally {
      h.f.fire('> ', 'prompt');
      await stopHarness();
    }
  });
}

test('drugi wynik filtra: domyslne automatyczne odswiezanie, bez zdarzenia ubocznego', async () => {
  const h = await startHarness();
  try {
    click(h, '[data-box="odebrane"]');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'listing przed filtrem');
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec listingu przed filtrem');

    setInput(h, 'Corge');
    click(h, '.arkmail-search-go');
    await waitRt(() => h.f.sent.includes(SEARCH), 'filtr');
    h.f.fire('Wybrane listy odebrane:', 'mail');
    for (const [number, subject] of [[2, 'pierwszy'], [1, 'drugi']] as const) {
      h.f.fire(` ${number}. *R* Temat: ${subject}`, 'mail');
      h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
    }
    h.f.fire('> ', 'prompt');
    await waitRt(() => h.content.querySelectorAll('.arkmail-entry').length === 2, 'dwa wyniki');

    const second = h.content.querySelectorAll('.arkmail-entry')[1] as {
      dispatchEvent(event: unknown): void;
    };
    second.dispatchEvent(new h.window.Event('click'));
    await drain();

    assert.deepEqual(
      h.f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 2'],
    );
    assert.equal(h.f.sent.filter((command) => command === SEARCH).length, 1, 'bez nowej kotwicy');
  } finally {
    await stopHarness();
  }
});

test('drugi wynik filtra po GMCP: serwer akceptuje tylko numer z ostatniego listingu', async () => {
  const h = await startHarness();
  let lastListing: readonly number[] = [];
  const rejected: string[] = [];
  h.f.sendImpl = async (command) => {
    const match = /^przeczytaj list (\d+)$/.exec(command);
    if (!match) return;
    const number = Number(match[1]);
    if (lastListing.includes(number)) return;
    rejected.push(command);
    h.f.fire(`Zly numer listu: ${number}.`, 'mail');
    h.f.fire('> ', 'prompt');
  };
  try {
    click(h, '[data-box="odebrane"]');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'listing przed filtrem stanowym');
    lastListing = [];
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec listingu przed filtrem stanowym');

    setInput(h, 'Corge');
    click(h, '.arkmail-search-go');
    await waitRt(() => h.f.sent.includes(SEARCH), 'filtr stanowy');
    lastListing = [2, 1];
    h.f.fire('Wybrane listy odebrane:', 'mail');
    for (const [number, subject] of [[2, 'pierwszy'], [1, 'drugi']] as const) {
      h.f.fire(` ${number}. *R* Temat: ${subject}`, 'mail');
      h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
    }
    h.f.fire('> ', 'prompt');
    await waitRt(() => h.content.querySelectorAll('.arkmail-entry').length === 2, 'dwa wyniki stanowe');

    // Listing innej skrzynki uniewaznia kontekst filtra takze na serwerze.
    h.f.fireEvent('gmcp.mail.state', { unread: false, unreceived: false, unsent: true });
    for (const box of ['niewyslane', 'wyslane'] as const) {
      await waitRt(() => h.f.sent.includes(`listy ${box}`), `kontekst uboczny: ${box}`);
      lastListing = [];
      h.f.fire(box === 'niewyslane'
        ? 'Nie masz zadnych niewyslanych listow.'
        : 'Nie masz zadnych wyslanych listow.', 'mail');
      h.f.fire('> ', 'prompt');
    }
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec kontekstu ubocznego');

    const second = h.content.querySelectorAll('.arkmail-entry')[1] as {
      dispatchEvent(event: unknown): void;
    };
    second.dispatchEvent(new h.window.Event('click'));
    await waitRt(() => h.f.sent.includes('listy odebrane przed 25 VIII 1999'), 'swieza kotwica po GMCP');

    lastListing = [3, 2];
    h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    for (const [number, subject] of [[3, 'pierwszy'], [2, 'drugi']] as const) {
      h.f.fire(` ${number}. *R* Temat: ${subject}`, 'mail');
      h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
    }
    h.f.fire('> ', 'prompt');
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt po swiezej kotwicy');
    feedLetter(h, 3, 'pierwszy');
    await waitRt(() => textOf(h, '.arkmail-letter-body').includes('Tresc: pierwszy'), 'list otwarty po GMCP');

    assert.deepEqual(rejected, [], 'zadna komenda nie moze uzyc numeru spoza ostatniego listingu');
    assert.deepEqual(
      h.f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 3'],
    );
  } finally {
    await stopHarness();
  }
});
