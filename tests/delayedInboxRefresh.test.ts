/**
 * Opozniony retry odswiezenia odebranych po nowej poczcie (Fala 16a).
 *
 * Problem (log sesji 2026-10-19 16:47:36): "[ POCZTA ] Masz nowa poczte
 * od Kruka." i GMCP przychodza NATYCHMIAST, ale serwer aktualizuje
 * skrzynke odebranych z lagiem - listing pobrany od razu NIE zawieral
 * nowego listu (najnowszy wpis nadal z 7 X); dopiero reczny refresh
 * ~22 s pozniej pokazal list. Zadne kolejne zdarzenie nie wyzwalalo
 * odswiezenia (identyczna ramka GMCP jest ignorowana), wiec nowy list
 * byl niewidoczny do recznego Odswiez (zgloszenie 2026-10-19, pkt 2/7).
 *
 * Kontrakt: po "nowa-poczte"/"goniec" plugin robi refresh natychmiast
 * (jak dotad) PLUS jeden opozniony retry po ~10 s (i kolejny po ~25 s),
 * zeby zlapac list po lagu serwera. Retry koalescuja z innymi
 * odswiezeniami przez scheduleRefresh (zbiornik).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
} from './harness';

const countSent = (sent: string[], cmd: string): number =>
  sent.filter((c) => c === cmd).length;

/** Czeka do `ms` na predykat (retry leci po ~10 s - poza zasiegiem waitRt). */
async function waitLong(pred: () => boolean, what: string, ms = 13000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timeout(long): ${what}`);
}

test('harness: po nowej poczcie leci refresh natychmiast i opozniony retry', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    const base = countSent(f.sent, 'listy odebrane');

    // Nowa poczta; serwer (lag) zwraca listing BEZ nowego listu.
    f.fire(' [ POCZTA ] Masz nowa poczte od Corge.');
    await waitFor(() => countSent(f.sent, 'listy odebrane') === base + 1, 'natychmiastowy refresh odebranych');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'refresh nieprzeczytanych');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitFor(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji refreshu');

    // Retry po lagu serwera (~10 s) - na starym kodzie nie wylatuje.
    await waitLong(
      () => countSent(f.sent, 'listy odebrane') >= base + 2,
      'opozniony retry listingu odebranych',
    );
  } finally {
    await stopHarness();
  }
});
