/**
 * "List zostal pomyslnie wyslany." poza sesja compose (Fala 13c).
 *
 * Zwierze pocztowe przy powrocie dostarcza niewyslane listy - serwer
 * wypisuje te linie ~20-25 s po "wyslij zwierze" (dowod: logi
 * 2026-01-04/16, np. +25.2 s). W sesji compose ta sama linia jest
 * konsumowana przez flote edytora (onSendCompose sam odswieza
 * skrzynki na koncu), wiec wiring reaguje tylko, gdy blokada sesji
 * jest wolna - inaczej kazdy compose dostawialby dodatkowy refresh.
 *
 * Dostawa poza compose: niewyslane -> wyslane, wiec odswiezamy OBIE
 * skrzynki (koalescencja 13a zbiera to z ewentualnym GMCP unsent).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types.js';
import { startHarness, stopHarness, type Harness } from './harness';

const GENITIVE: Record<MailBox, string> = {
  odebrane: 'odebranych',
  nieprzeczytane: 'nieprzeczytanych',
  wyslane: 'wyslanych',
  niewyslane: 'niewyslanych',
};

const answered = new Map<string, number>();

const answerEmpty = async (h: Harness, box: MailBox): Promise<void> => {
  const cmd = `listy ${box}`;
  const n = (answered.get(cmd) ?? 0) + 1;
  await h.waitFor(() => h.f.sent.filter((c) => c === cmd).length >= n, `${cmd} #${n}`);
  answered.set(cmd, n);
  h.f.fire(`Nie masz zadnych ${GENITIVE[box]} listow.`, 'mail');
};

const waitIdle = (h: Harness): Promise<void> =>
  h.waitFor(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('dostawa przez zwierze (poza compose) odswieza niewyslane i wyslane', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fire('List zostal pomyslnie wyslany.', 'mail');
    await answerEmpty(h, 'niewyslane');
    await answerEmpty(h, 'wyslane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});

test('linia dostawy pod lockiem sesji nie strzela (sesja sama odswieza na koncu)', async () => {
  answered.clear();
  const h = await startHarness();
  try {
    h.f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'refresh trzyma lock');
    h.f.fire('List zostal pomyslnie wyslany.', 'mail');
    await sleep(120);
    assert.ok(
      !h.f.sent.includes('listy niewyslane') && !h.f.sent.includes('listy wyslane'),
      'pod lockiem zero komend z linii dostawy',
    );
    await answerEmpty(h, 'odebrane');
    await answerEmpty(h, 'nieprzeczytane');
    await waitIdle(h);
  } finally {
    await stopHarness();
  }
});
