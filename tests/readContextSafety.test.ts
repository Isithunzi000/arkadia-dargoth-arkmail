/** Bezpieczenstwo numeracji i granic odpowiedzi. Wszystkie dane sa syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AmbiguousResponseError } from '../src/arkmail/core/session/errors';
import { PagerSession } from '../src/arkmail/core/session/pager';
import { MockTransport } from '../src/arkmail/core/session/transport';
import {
  click,
  notifyText,
  startHarness,
  stopHarness,
  waitRt,
  type Harness,
} from './harness';

const DATE = 'Wt, 24 VIII 1999, 00:11:12';
const SEARCH = 'listy odebrane od corge';

interface Row {
  number: number;
  subject: string;
}

const drain = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const setInput = (h: Harness, selector: string, value: string): void => {
  const element = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(event: unknown): void;
  };
  element.value = value;
  element.dispatchEvent(new h.window.Event('input'));
};

function replyListing(h: Harness, rows: readonly Row[], selected = true): void {
  h.f.fire(selected ? 'Wybrane listy odebrane:' : 'Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  for (const row of rows) {
    h.f.fire(` ${row.number}. *R* Temat: ${row.subject}`, 'mail');
    h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

async function prepareSearch(h: Harness, rows: readonly Row[]): Promise<void> {
  click(h, '[data-box="odebrane"]');
  await waitRt(() => h.f.sent.includes('listy odebrane'), 'poczatkowy listing');
  h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
  h.f.fire('> ', 'prompt');
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, 'koniec poczatkowego listingu');

  setInput(h, '[data-search="osoba"]', 'Corge');
  click(h, '.arkmail-search-go');
  await waitRt(() => h.f.sent.includes(SEARCH), 'pierwotne wyszukiwanie');
  replyListing(h, rows);
  await h.waitFor(
    () => h.content.querySelectorAll('.arkmail-entry').length === rows.length,
    'wyniki wyszukiwania',
  );
}

async function expireServerListing(h: Harness): Promise<void> {
  h.f.fireEvent('gmcp.mail.state', { unread: false, unreceived: false, unsent: true });
  const empty = {
    niewyslane: 'Nie masz zadnych niewyslanych listow.',
    wyslane: 'Nie masz zadnych wyslanych listow.',
  } as const;
  for (const box of ['niewyslane', 'wyslane'] as const) {
    await h.waitFor(() => h.f.sent.includes(`listy ${box}`), `listing zmieniajacy kontekst: ${box}`);
    h.f.fire(empty[box], 'mail');
    h.f.fire('> ', 'prompt');
  }
  await h.waitFor(() => {
    const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
    return busy?.textContent === '';
  }, 'koniec listingu zmieniajacego kontekst');
}

function replayLetter(h: Harness, number: number): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Corge', 'mail');
  h.f.fire('Temat: wybrany', 'mail');
  h.f.fire(`Data : ${DATE}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Syntetyczna tresc.', 'mail');
  h.f.fire(`[1-2 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
  h.f.fire('> ', 'prompt');
}

test('wyszukiwanie: ponowna kotwica po dacie zachowuje swiezy numer serwera', async () => {
  const h = await startHarness();
  try {
    await prepareSearch(h, [
      { number: 2, subject: 'inny' },
      { number: 1, subject: 'wybrany' },
    ]);
    await expireServerListing(h);
    click(h, '.arkmail-entry[data-number="1"]');
    await waitRt(() => h.f.sent.includes('listy odebrane przed 25 VIII 1999'), 'kotwica po dacie');

    replyListing(h, [
      { number: 3, subject: 'wybrany' },
      { number: 2, subject: 'inny' },
    ], false);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt numeru serwera');

    assert.ok(!notifyText(h.f, 'Nie mozna bezpiecznie ustalic numeru listu'));
    assert.ok(!h.f.sent.includes('przeczytaj list 1'), 'stary numer nie trafia do komendy');
    assert.ok(!h.f.sent.includes('q'), 'bez zgadywanego zamkniecia pagera');
    replayLetter(h, 3);
    await h.waitFor(() => h.content.querySelector('.arkmail-letter-body') !== null, 'otwarty list');
  } finally {
    await stopHarness();
  }
});

test('wyszukiwanie: pelny listing jest odrzucany juz przy pierwszym filtrze', async () => {
  const h = await startHarness();
  try {
    click(h, '[data-box="odebrane"]');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'poczatkowy listing');
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(() => {
      const busy = h.content.querySelector('.arkmail-busy') as { textContent?: string } | null;
      return busy?.textContent === '';
    }, 'koniec poczatkowego listingu');

    setInput(h, '[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await waitRt(() => h.f.sent.includes(SEARCH), 'wyszukiwanie');
    replyListing(h, [{ number: 1, subject: 'wybrany' }], false);
    await h.waitFor(
      () => notifyText(h.f, 'Operacja nie powiodla sie - sprobuj ponownie.'),
      'odrzucenie pelnego listingu',
    );
    assert.equal(h.content.querySelectorAll('.arkmail-entry').length, 0);
  } finally {
    await stopHarness();
  }
});

test('wyszukiwanie: zly numer i pozny prompt pagera nie powoduja drugiego listingu ani q', async () => {
  const h = await startHarness();
  try {
    await prepareSearch(h, [{ number: 1, subject: 'wybrany' }]);
    await expireServerListing(h);
    click(h, '.arkmail-entry');
    await waitRt(() => h.f.sent.includes('listy odebrane przed 25 VIII 1999'), 'kotwica po dacie');
    replyListing(h, [{ number: 1, subject: 'wybrany' }], false);
    await waitRt(() => h.f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');

    h.f.fire('Zly numer listu: 1.', 'mail');
    await drain();
    assert.equal(
      h.f.sent.filter((command) => command === 'listy odebrane przed 25 VIII 1999').length,
      1,
      'przed granica odpowiedzi nie wolno ponawiac listingu',
    );

    h.f.fire('[1-2 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ', 'prompt');
    await h.waitFor(() => notifyText(h.f, 'Nie udalo sie odczytac listu.'), 'koniec po prompcie pagera');
    assert.equal(h.f.sent.filter((command) => command === 'listy odebrane przed 25 VIII 1999').length, 1, 'bez ponowienia w pagerze');
    assert.equal(h.f.sent.filter((command) => command.startsWith('przeczytaj list')).length, 1);
    assert.ok(!h.f.sent.includes('q'), 'pager nieznanego pochodzenia nie jest zamykany');
  } finally {
    await stopHarness();
  }
});

test('wyszukiwanie: dopiero zwykly prompt po zlym numerze pozwala na jedna ponowna probe', async () => {
  const h = await startHarness();
  try {
    await prepareSearch(h, [{ number: 1, subject: 'wybrany' }]);
    await expireServerListing(h);
    click(h, '.arkmail-entry');
    await waitRt(() => h.f.sent.includes('listy odebrane przed 25 VIII 1999'), 'pierwsza kotwica');
    replyListing(h, [{ number: 1, subject: 'wybrany' }], false);
    await waitRt(() => h.f.sent.includes('przeczytaj list 1'), 'pierwszy odczyt');

    h.f.fire('Zly numer listu: 1.', 'mail');
    await drain();
    assert.equal(h.f.sent.filter((command) => command === 'listy odebrane przed 25 VIII 1999').length, 1, 'blad sam nie ponawia listingu');

    h.f.fire('> ', 'prompt');
    await waitRt(() => h.f.sent.filter((command) => command === 'listy odebrane przed 25 VIII 1999').length === 2, 'ponowienie po zwyklym prompcie');
    replyListing(h, [{ number: 1, subject: 'wybrany' }], false);
    await waitRt(
      () => h.f.sent.filter((command) => command === 'przeczytaj list 1').length === 2,
      'drugi odczyt',
    );
    replayLetter(h, 1);
    await h.waitFor(() => h.content.querySelector('.arkmail-letter-body') !== null, 'otwarty list');
  } finally {
    await stopHarness();
  }
});

test('odczyt: cisza po zlym numerze konczy operacje bez zgody na ponowienie', async () => {
  const transport = new MockTransport();
  const pager = new PagerSession(transport, { timeoutMs: 100, idleMs: 20 });
  const settled = pager.readLetter(1).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  await transport.replay([{ cls: 'mail', text: 'Zly numer listu: 1.' }]);
  const result = await settled;

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof Error);
    assert.equal(result.error.name, 'MailCommandError');
    assert.equal(
      (result.error as Error & { retryAllowed?: boolean }).retryAllowed,
      false,
      'bez promptu nie ma zgody na ponowienie',
    );
  }
  assert.deepEqual(transport.sent, ['przeczytaj list 1']);
});

test('odczyt: zgodny prompt pagera przed naglowkami nie jest pustym sukcesem', async () => {
  const transport = new MockTransport();
  const pager = new PagerSession(transport, { timeoutMs: 100, idleMs: 20 });
  const operation = pager.readLetter(2);
  const settled = operation.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  await transport.replay([
    { cls: 'mail', text: '[1-2 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ' },
    { cls: 'prompt', text: '> ' },
  ]);
  const result = await settled;

  assert.equal(result.ok, false, 'brak naglowkow musi zakonczyc odczyt bledem');
  if (!result.ok) assert.ok(result.error instanceof AmbiguousResponseError);
  assert.deepEqual(transport.sent, ['przeczytaj list 2'], 'bez q do niepotwierdzonego pagera');
});
