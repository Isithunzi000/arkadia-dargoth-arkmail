/**
 * Dwuznaczny genityw "otrzymanych" (Fala 17b, zgloszenie 2026-10-19/20
 * pkt 5 i 6).
 *
 * Blad z sesji: szukanie po imieniu na skrzynce odebranych konczylo
 * sie tostem "Blad szukania: pusta nieprzeczytane podczas fetch
 * odebrane". Przyczyna: serwer uzywa genitywu "otrzymanych" DWUZNACZNIE
 * - w pustym listingu nieprzeczytanych ("Nie masz zadnych otrzymanych
 * listow.", log 2026-10-19 17:25:11, odpowiedz na "listy
 * nieprzeczytane") oraz w pustych wynikach filtra na odebranych
 * ("Nie znaleziono zadnych takich otrzymanych listow.", 17:21:08).
 * Mapowanie z Fali 16b ("otrzymanych" = "nieprzeczytane") bylo
 * jednoznaczne i falszywie odpalalo straznika desynchronizacji z
 * Fali 14d. Klik w kontakt ("Odebrane") ustawial filtr, ale szukanie
 * umieralo na tym strazniku - stad "filtr jest, ale nie aktywowany"
 * (pkt 5).
 *
 * Kontrakt:
 *  - parser zwraca ZBIOR skrzynek: "otrzymanych" = [odebrane,
 *    nieprzeczytane]; pozostale genitywy jednoelementowe;
 *  - straznik mismatch w mailbox.fetch odrzuca tylko, gdy ZADNA
 *    skrzynka ze zbioru nie pasuje (jednoznaczne zachowanie Fali 14d
 *    bez zmian);
 *  - zaakceptowany pusty wynik raportuje skrzynke ZADANA, nie serwerowa;
 *  - integracja: szukanie po osobie + pusty wynik "otrzymanych" =
 *    "Brak pasujacych listow." i banner, ZADNY toast bledu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEmptyListing } from '../src/arkmail/core/protocol/parser';
import { MockTransport } from '../src/arkmail/core/session/transport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  notifyText,
  textOf,
  type Harness,
} from './harness';

const OPTS = { timeoutMs: 900, idleMs: 120 };

const setInput = (h: Harness, selector: string, value: string): void => {
  const el = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  el.value = value;
  el.dispatchEvent(new h.window.Event('input'));
};

test('parser: "otrzymanych" to zbior {odebrane, nieprzeczytane} (pusty i filtrowany)', () => {
  const peek = (t: string) => parseEmptyListing(t);
  assert.deepEqual(peek('Nie masz zadnych otrzymanych listow.'), {
    boxes: ['odebrane', 'nieprzeczytane'],
    reason: 'puste',
  });
  assert.deepEqual(peek('Nie znaleziono zadnych takich otrzymanych listow.'), {
    boxes: ['odebrane', 'nieprzeczytane'],
    reason: 'filtr',
  });
  // Bez regresji: jednoznaczne genitywy maja zbiory jednoelementowe.
  assert.deepEqual(peek('Nie masz zadnych nieprzeczytanych listow.')?.boxes, ['nieprzeczytane']);
  assert.deepEqual(peek('Nie masz zadnych odebranych listow.')?.boxes, ['odebrane']);
  assert.deepEqual(peek('Nie masz zadnych wyslanych listow.')?.boxes, ['wyslane']);
  assert.deepEqual(peek('Nie znaleziono zadnych takich niewyslanych listow.')?.boxes, [
    'niewyslane',
  ]);
});

test('mailbox: pusty wynik filtra "otrzymanych" akceptowany dla odebranych', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = m.fetch('odebrane', 'listy odebrane od Corge');
  await t.replay([
    { cls: 'mail', text: 'Nie znaleziono zadnych takich otrzymanych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await op;
  assert.deepEqual(res, { kind: 'pusta', box: 'odebrane', reason: 'filtr' });
});

test('mailbox: pusty listing "otrzymanych" akceptowany dla nieprzeczytanych', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = m.fetch('nieprzeczytane');
  await t.replay([
    { cls: 'mail', text: 'Nie masz zadnych otrzymanych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await op;
  assert.deepEqual(res, { kind: 'pusta', box: 'nieprzeczytane', reason: 'puste' });
});

test('mailbox: jednoznaczny mismatch nadal odrzuca (straznik Fali 14d)', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = m.fetch('wyslane');
  void t.replay([{ cls: 'mail', text: 'Nie masz zadnych odebranych listow.' }]);
  await assert.rejects(op, /odebrane podczas fetch wyslane/);
});

test('szukaj integracja: pusty wynik "otrzymanych" na odebranych - brak bledu, banner zostaje', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    setInput(h, '[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await waitFor(
      () => f.sent.includes('listy odebrane od corge'),
      'komenda szukania po nadawcy',
    );
    // Serwer odpowiada dwuznacznym genitywem - stary kod odrzucal
    // to jako "pusta nieprzeczytane podczas fetch odebrane".
    f.fire('Nie znaleziono zadnych takich otrzymanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => textOf(h, '.arkmail-pane').includes('Brak pasujacych listow.'),
      'komunikat o pustym wyniku',
    );
    assert.ok(
      textOf(h, '.arkmail-search-banner').includes('Corge'),
      'banner wynikow widoczny (filtr aktywny)',
    );
    assert.ok(!notifyText(f, 'Blad szukania'), 'zadnego toastu bledu szukania');
  } finally {
    await stopHarness();
  }
});
