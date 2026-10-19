/**
 * Throttle serwera "Listy sa w tej chwili ladowane." + wariant pustego
 * listingu "otrzymanych" (Fala 16b).
 *
 * Problem (log sesji 2026-10-19): przy czestych listingach serwer
 * odpowiada "Listy sa w tej chwili ladowane." (17:25:10) zamiast
 * listingu - parser tego nie zna, wiec fetch/pager wisial w CISZY do
 * timeoutu (~8 s) i dopiero potem toast bledu (zgloszenie pkt 3/13:
 * "klikam i nic sie nie dzieje"). Dodatkowo serwer ma wariant pustego
 * listingu "Nie masz zadnych otrzymanych listow." (17:25:11, odpowiedz
 * na "listy nieprzeczytane") i "Nie znaleziono zadnych takich
 * otrzymanych listow." (17:21:08) - tez nieparsowane.
 *
 * Kontrakt:
 *  - "ladowane" w mailbox.fetch / pager (stan letter): JEDEN retry
 *    komendy po ~2 s; powtorna linia = blad (bez cichego timeoutu);
 *  - "otrzymanych" = wariant "nieprzeczytanych" (pusty i filtrowany).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEmptyListing,
  LISTS_LOADING_RE,
} from '../src/arkmail/core/protocol/parser';
import { MockTransport } from '../src/arkmail/core/session/transport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';

const OPTS = { timeoutMs: 6000, idleMs: 100 };

test('parser: puste "otrzymanych" mapuje na nieprzeczytane', () => {
  assert.deepEqual(parseEmptyListing('Nie masz zadnych otrzymanych listow.'), {
    box: 'nieprzeczytane',
    reason: 'puste',
  });
  assert.deepEqual(parseEmptyListing('Nie znaleziono zadnych takich otrzymanych listow.'), {
    box: 'nieprzeczytane',
    reason: 'filtr',
  });
  // Bez regresji: klasyczne warianty.
  assert.equal(parseEmptyListing('Nie masz zadnych nieprzeczytanych listow.')?.box, 'nieprzeczytane');
  assert.equal(parseEmptyListing('Nie masz zadnych odebranych listow.')?.box, 'odebrane');
});

test('parser: linia throttle "Listy sa w tej chwili ladowane."', () => {
  assert.ok(LISTS_LOADING_RE.test('Listy sa w tej chwili ladowane.'));
  assert.ok(!LISTS_LOADING_RE.test('Listy odebrane (prezentowane jest pierwsze 50):'));
});

test('mailbox: "ladowane" = retry komendy po ~2 s, potem listing przechodzi', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = m.fetch('odebrane');
  assert.deepEqual(t.sent, ['listy odebrane']);
  await t.replay([{ text: 'Listy sa w tej chwili ladowane.', cls: 'mail' }]);
  // Retry po ~2 s.
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && t.sent.length < 2) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.deepEqual(t.sent, ['listy odebrane', 'listy odebrane'], 'retry komendy');
  await t.replay([
    { text: 'Listy odebrane (prezentowane jest pierwsze 50):', cls: 'mail' },
    { text: ' 1. *R* Temat: Test01', cls: 'mail' },
    { text: 'Nadawca: Gracz                          Pn, 19 X 2026, 18:47:36', cls: 'mail' },
    { text: '> ', cls: 'prompt' },
  ]);
  const res = await op;
  assert.equal(res.kind, 'lista');
});

test('mailbox: podwojne "ladowane" = blad zamiast cichego timeoutu', async () => {
  const t = new MockTransport();
  const m = new MailboxSession(t, OPTS);
  const op = m.fetch('odebrane');
  const assertion = assert.rejects(op, /ladowane/);
  await t.replay([{ text: 'Listy sa w tej chwili ladowane.', cls: 'mail' }]);
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && t.sent.length < 2) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await t.replay([{ text: 'Listy sa w tej chwili ladowane.', cls: 'mail' }]);
  await assertion;
});

test('pager: "ladowane" przed naglowkami = retry odczytu po ~2 s', async () => {
  const t = new MockTransport();
  const s = new PagerSession(t, OPTS);
  const op = s.readLetter(1);
  assert.deepEqual(t.sent, ['przeczytaj list 1']);
  await t.replay([{ text: 'Listy sa w tej chwili ladowane.', cls: 'mail' }]);
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && t.sent.length < 2) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'przeczytaj list 1'], 'retry odczytu');
  await t.replay([
    { text: 'List : 1', cls: 'mail' },
    { text: 'Od   : Gracz', cls: 'mail' },
    { text: 'Temat: Test01', cls: 'mail' },
    { text: 'Data : Pn, 19 X 2026, 18:47:36', cls: 'mail' },
    { text: '', cls: 'mail' },
    { text: 'Tresc.', cls: 'mail' },
    { text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', cls: 'mail' },
    { text: '> ', cls: 'prompt' },
  ]);
  const res = await op;
  assert.equal(res.letter.subject, 'Test01');
});
