/**
 * Kontekst listingu serwera {box, stamp} + fail-fast pagera (Fala 14f).
 *
 * Problem (log sesji 1.7.0, 2026-10-19 04:22): serwer poczty ma JEDEN
 * globalny "biezacy listing" - KAZDA komenda listujaca go nadpisuje,
 * takze PUSTA ("Nie masz zadnych nieprzeczytanych listow."). Plugin nie
 * bumpowal kontekstu na pustych listingach, wiec po pustym listingu
 * nieprzeczytanych (04:22:19) wpisy odebranych wygladaly na aktualne;
 * "d N" poszlo na slepo i dostalo "Zadne listy nie zostaly wybrane."
 * (04:22:39), a pager.run w stanie 'letter' ignorowal linie-bledy
 * serwera - sesja wisiala do timeoutu (~8 s, "Slucham?" 04:22:47),
 * a timeout wysylal "q" bez otwartego pagera.
 *
 * Kontrakt:
 *  - pusty listing TEZ bumpuje kontekst (serwer go nadpisal);
 *  - wpis ze starego kontekstu NIGDY nie strzela numerem na slepo -
 *    zawsze re-kotwica po dacie;
 *  - pager w stanie 'letter' (przed naglowkami) odrzuca linie-bledy
 *    serwera OD RAZU i BEZ wysylania "q" (pager nie zostal otwarty).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MockTransport } from '../src/arkmail/core/session/transport';
import { PagerSession } from '../src/arkmail/core/session/pager';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  type Harness,
} from './harness';

const OPTS = { timeoutMs: 500 };

test('pager: "Zly numer listu" przed naglowkami odrzuca od razu, bez q', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(7);
  assert.deepEqual(t.sent, ['przeczytaj list 7']);
  // Handler PRZED replay - inaczej reject wpada jako unhandledRejection.
  const assertion = assert.rejects(op, /Zly numer listu: 7/);
  await t.replay([{ text: 'Zly numer listu: 7.', cls: '' }]);
  await assertion;
  assert.ok(!t.sent.includes('q'), 'bez q - pager nie zostal otwarty');
});

test('pager: "Zadne listy nie zostaly wybrane." odrzuca od razu, bez q', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(3);
  const assertion = assert.rejects(op, /Zadne listy nie zostaly wybrane/);
  await t.replay([{ text: 'Zadne listy nie zostaly wybrane.', cls: '' }]);
  await assertion;
  assert.ok(!t.sent.includes('q'), 'bez q - pager nie zostal otwarty');
});

/** Swiezy listing odebranych, w ktorym "najnowszy" (Corge 23 XII) ma numer 2. */
function replayFreshListing(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: inny', 'mail');
  f.fire('Nadawca: Grault                         Wt, 23 XII 2025, 01:00:00', 'mail');
  f.fire(' 2. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire(' 1. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire('> ', 'prompt');
}

test('ctx: pusty listing uniewaznia kontekst - klik w wpis robi re-kotwice', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    // Prolog konczy sie PUSTYM listingiem nieprzeczytanych - to on jest
    // biezacym listingiem serwera, nie listing odebranych sprzed chwili.
    await loadTruncatedBox(h);
    const sentBefore = f.sent.length;

    click(h, '.arkmail-entry'); // najnowszy z odebranych (stary kontekst)
    await waitFor(
      () => f.sent.includes('listy odebrane przed 24 XII 2025'),
      're-kotwica: listing po dacie listu (dzien po)',
    );
    assert.ok(
      !f.sent.slice(sentBefore).some((c) => c.startsWith('przeczytaj')),
      'NIE wyslano przeczytaj na slepo',
    );
    replayFreshListing(h);
    await waitFor(() => f.sent.includes('przeczytaj list 2'), 'przeczytaj ze swiezym numerem 2');
  } finally {
    await stopHarness();
  }
});
