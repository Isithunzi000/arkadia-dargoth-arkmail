/** Calosciowy scenariusz regresji przez publiczne sciezki UI. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  click,
  startHarness,
  stopHarness,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const DATE = 'Wt, 24 VIII 1999, 00:11:12';
const SEARCH = 'listy odebrane od corge';
const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';
const PAGER_REJECTION =
  'Nie ma takiej komendy. Wpisz "?", zeby uzyskac pomoc albo "q", zeby wyjsc.';

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

async function prepareSearch(h: Harness): Promise<void> {
  click(h, '[data-box="odebrane"]');
  await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'poczatkowy listing');
  h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
  h.f.fire('> ', 'prompt');
  await h.waitFor(() => textOf(h, '.arkmail-busy') === '', 'koniec poczatkowego listingu');

  setInput(h, '[data-search="osoba"]', 'Corge');
  click(h, '.arkmail-search-go');
  await h.waitFor(() => h.f.sent.includes(SEARCH), 'wyszukiwanie');
  h.f.fire('Wybrane listy odebrane:', 'mail');
  for (const number of [1, 2]) {
    h.f.fire(` ${number}. *R* Temat: blizniak`, 'mail');
    h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
  await h.waitFor(
    () => h.content.querySelectorAll('.arkmail-entry').length === 2,
    'dwa identyczne wyniki',
  );
}

function feedLetter(h: Harness, number: number, body: string): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Corge', 'mail');
  h.f.fire('Temat: blizniak', 'mail');
  h.f.fire(`Data : ${DATE}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire(body, 'mail');
}

function count(h: Harness, command: string): number {
  return h.f.sent.filter((sent) => sent === command).length;
}

test('pelny scenariusz: wlasciwy numer, wlasna sierota i jedno kontrolowane ponowienie', async () => {
  const h = await startHarness({ autoRefreshEnabled: false, wide: true });
  const { f } = h;
  try {
    await prepareSearch(h);
    click(h, '.arkmail-entry[data-number="1"]');
    await waitRt(() => count(h, 'przeczytaj list 1') === 1, 'pierwszy odczyt');
    await drain();
    assert.equal(textOf(h, '.arkmail-letter-body'), '', 'odpowiedz serwera jest opozniona');

    feedLetter(h, 1, 'Tresc pierwszego listu.');
    f.fire(PAGER_PROMPT, 'mail');
    await waitRt(() => count(h, 'q') === 1, 'zamkniecie pierwszego pagera');
    await waitRt(
      () => textOf(h, '.arkmail-letter-body').includes('Tresc pierwszego listu.'),
      'pierwszy list po ciszy bez zwyklego promptu',
    );
    assert.equal(count(h, SEARCH), 1, 'aktualny wynik nie dostaje drugiego listingu');

    click(h, '.arkmail-entry[data-number="2"]');
    await waitRt(() => count(h, 'przeczytaj list 2') === 1, 'kolejny odczyt');
    f.fire(PAGER_REJECTION, 'mail');
    await waitRt(() => count(h, 'q') === 2, 'jedno q dla potwierdzonej wlasnej sieroty');

    f.fire('Opozniona tresc podczas zamykania wlasnej sieroty.', 'mail');
    f.fire(PAGER_PROMPT, 'mail');
    await drain();
    assert.equal(count(h, 'przeczytaj list 2'), 1, 'bez ponowienia przed zwyklym promptem');
    assert.equal(count(h, 'q'), 2, 'prompt pagera nie wytwarza drugiego q');
    assert.ok(
      f.gagged.includes('Opozniona tresc podczas zamykania wlasnej sieroty.'),
      'linia poczty pozostaje przechwycona podczas kontrolowanego zamykania',
    );

    f.fire('> ', 'prompt');
    await waitRt(() => count(h, 'przeczytaj list 2') === 2, 'dokladnie jedno ponowienie');
    feedLetter(h, 2, 'Tresc drugiego listu.');
    f.fire(PAGER_PROMPT.replace('aktualny: 1', 'aktualny: 2'), 'mail');
    await waitRt(() => count(h, 'q') === 3, 'zamkniecie ponowionego odczytu');
    f.fire('> ', 'prompt');
    await waitRt(
      () => textOf(h, '.arkmail-letter-body').includes('Tresc drugiego listu.'),
      'drugi list otwarty po odzyskaniu',
    );

    assert.equal(count(h, SEARCH), 1, 'obiekt nadal pochodzi z aktualnego wyszukiwania');
    assert.deepEqual(
      f.sent.filter((command) => command.startsWith('przeczytaj list')),
      ['przeczytaj list 1', 'przeczytaj list 2', 'przeczytaj list 2'],
      'wybor i jedno ponowienie zachowuja wlasciwe numery',
    );
    assert.ok(f.gagged.includes('Tresc drugiego listu.'), 'tresc nie trafia do konsoli klienta');

    f.fire('Pozna linia po zakonczeniu operacji.', 'mail');
    assert.ok(
      !f.gagged.includes('Pozna linia po zakonczeniu operacji.'),
      'po zakonczeniu nie zostaje globalne przechwytywanie',
    );
  } finally {
    f.fire('> ', 'prompt');
    await stopHarness();
  }
});

test('pelny scenariusz: reczne q przed odpowiedzia przechodzi raz i odblokowuje plugin', async () => {
  const h = await startHarness({ autoRefreshEnabled: false, wide: true });
  const { f } = h;
  try {
    await prepareSearch(h);
    click(h, '.arkmail-entry[data-number="2"]');
    await waitRt(() => count(h, 'przeczytaj list 2') === 1, 'odczyt przed przejeciem');
    await f.api.command.send('q', true);
    assert.equal(count(h, 'q'), 1, 'reczne q przechodzi natychmiast');
    assert.equal(f.sentEcho[f.sent.lastIndexOf('q')], true, 'polecenie zachowuje zrodlo gracza');

    feedLetter(h, 2, 'Opozniona odpowiedz po przejeciu.');
    f.fire(PAGER_PROMPT.replace('aktualny: 1', 'aktualny: 2'), 'mail');
    await drain();
    assert.equal(count(h, 'q'), 1, 'pozna odpowiedz nie wytwarza drugiego q');
    assert.equal(count(h, 'przeczytaj list 2'), 1, 'przejecie anuluje automatyczny odczyt');

    await waitRt(() => f.hookCb === null, 'koniec blokady modalnej od razu po recznym q');
    click(h, '.arkmail-entry[data-number="1"]');
    await waitRt(() => count(h, 'przeczytaj list 1') === 1, 'nowy odczyt przed zwyklym promptem');
    assert.equal(count(h, SEARCH), 1, 'odblokowanie nie wymusza drugiego wyszukiwania');
    f.fire('> ', 'prompt');
    await drain();
    assert.equal(count(h, 'przeczytaj list 1'), 1, 'pozny prompt nie powtarza odczytu');
  } finally {
    f.fire('> ', 'prompt');
    await stopHarness();
  }
});
