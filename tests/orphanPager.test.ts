/**
 * Podejrzenie wlasnego sierocego pagera (core/session/orphanPager).
 *
 * Kontrakt:
 * - stan jest ograniczony do generacji polaczenia;
 * - cisza przed naglowkami nie stawia podejrzenia, a cisza po wlasnym
 *   zamknieciu zachowuje je do zwyklego promptu;
 * - lokalna sesja wysyla jedno q i ponawia raz tylko przy wlasnej sierocie;
 * - nieznany pager oraz pozne prompty poza operacja pozostaja nietkniete;
 * - reconnect i zmiana postaci nie przenosza stanu starej generacji.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  suspectPagerOrphan,
  clearPagerOrphan,
  isPagerOrphanSuspected,
} from '../src/arkmail/core/session/orphanPager';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import { MockTransport } from '../src/arkmail/core/session/transport';
import { startHarness, stopHarness, loadTruncatedBox } from './harness';

test('flaga: start czysta, suspect stawia, clear zdejmuje', () => {
  clearPagerOrphan();
  assert.equal(isPagerOrphanSuspected(), false, 'start bez podejrzenia');
  suspectPagerOrphan();
  assert.equal(isPagerOrphanSuspected(), true, 'suspect stawia flage');
  clearPagerOrphan();
  assert.equal(isPagerOrphanSuspected(), false, 'clear zdejmuje flage');
});

test('flaga: podejrzenie i czyszczenie sa ograniczone do generacji polaczenia', () => {
  clearPagerOrphan();
  const suspectInGeneration: (generation: number) => void = suspectPagerOrphan;
  const isSuspectedInGeneration: (generation: number) => boolean = isPagerOrphanSuspected;
  const clearInGeneration: (generation: number) => void = clearPagerOrphan;

  suspectInGeneration(4);
  assert.equal(isSuspectedInGeneration(4), true, 'sierota jest widoczna w swojej generacji');
  assert.equal(isSuspectedInGeneration(5), false, 'sierota nie przechodzi do nowej generacji');
  clearInGeneration(5);
  assert.equal(isSuspectedInGeneration(4), true, 'stara generacja nie czysci nowego stanu');
  clearInGeneration(4);
  assert.equal(isSuspectedInGeneration(4), false, 'wlasciwy wlasciciel zdejmuje stan');
});

test('timeout przed potwierdzeniem pagera nie stawia podejrzenia sieroty', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const pager = new PagerSession(t, { timeoutMs: 50, idleMs: 20 });
  const p = pager.readLetter(1);
  await assert.rejects(p, /timeout/, 'sesja konczy sie timeoutem');
  assert.ok(!t.sent.includes('q'), 'bez dowodu pagera nie ma q');
  assert.equal(isPagerOrphanSuspected(), false, 'bez dowodu nie przypisujemy sobie cudzego pagera');
});

test('odczyt bez zwyklego promptu zachowuje podejrzenie wlasnej sieroty', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const pager = new PagerSession(t, { timeoutMs: 50, idleMs: 20 });
  const p = pager.readLetter(1);
  await t.replay([
    { cls: 'mail', text: 'List : 1' },
    { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
    { cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' },
  ]);
  assert.ok(t.sent.includes('q'), 'potwierdzony pager dostal q');
  await p;
  assert.equal(isPagerOrphanSuspected(), true, 'sama cisza nie potwierdza zamkniecia');

  t.setOnline(false);
  assert.equal(isPagerOrphanSuspected(1), false, 'podejrzenie nie przechodzi do nowej generacji');
  clearPagerOrphan();
});

test('pager nieznanego pochodzenia w fetchu nie stawia podejrzenia', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 500, idleMs: 20 });
  const p = mailbox.fetch('odebrane');
  t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 3) -- ' });
  await assert.rejects(p, /nieznany_pager/, 'fetch zglasza nieznany pager');
  assert.ok(!t.sent.includes('q'), 'plugin nie wysyla q');
  assert.equal(isPagerOrphanSuspected(), false, 'brak przypisania sieroty bez dowodu');
});

test('mailbox: wlasna sierota dostaje jedno q i ponowienie po zwyklym prompcie', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 500, idleMs: 20 });
  suspectPagerOrphan(0);
  const operation = mailbox.fetch('odebrane');
  void operation.catch(() => {});
  try {
    t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(t.sent, ['listy odebrane', 'q'], 'jedno q dla wlasnej sieroty');
    assert.equal(isPagerOrphanSuspected(0), true, 'wyslanie q nie jest potwierdzeniem zamkniecia');

    t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(t.sent, ['listy odebrane', 'q'], 'prompt pagera nie ponawia listingu');

    t.emit({ cls: 'prompt', text: '> ' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(t.sent, ['listy odebrane', 'q', 'listy odebrane']);
    assert.equal(isPagerOrphanSuspected(0), false, 'zwykly prompt potwierdza zamkniecie');

    t.emit({ cls: 'mail', text: 'Listy odebrane (prezentowane jest pierwsze 50):' });
    t.emit({ cls: 'prompt', text: '> ' });
    assert.equal((await operation).kind, 'lista');
  } finally {
    clearPagerOrphan();
  }
});

test('mailbox: po jednym ponowieniu kolejny pager nie dostaje drugiego q', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 500, idleMs: 20 });
  suspectPagerOrphan(0);
  const operation = mailbox.fetch('odebrane');
  void operation.catch(() => {});
  try {
    t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(t.sent, ['listy odebrane', 'q']);
    t.emit({ cls: 'prompt', text: '> ' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(t.sent, ['listy odebrane', 'q', 'listy odebrane']);

    t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ' });
    await assert.rejects(operation, /nieznany_pager/);
    assert.deepEqual(t.sent, ['listy odebrane', 'q', 'listy odebrane']);
  } finally {
    clearPagerOrphan();
  }
});

test('pager: odrzucenie bez wlasnej sieroty konczy odczyt bez q i ponowienia', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const pager = new PagerSession(t, { timeoutMs: 100, idleMs: 20 });
  const operation = pager.readLetter(1);
  void operation.catch(() => {});
  t.emit({
    cls: 'mail',
    text: 'Nie ma takiej komendy. Wpisz "?", zeby uzyskac pomoc albo "q", zeby wyjsc.',
  });
  await assert.rejects(operation, /niejednoznaczna_odpowiedz/);
  assert.deepEqual(t.sent, ['przeczytaj list 1']);
  t.emit({ cls: 'prompt', text: '> ' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(t.sent, ['przeczytaj list 1']);
});

test('udany fetch zdejmuje podejrzenie', async () => {
  suspectPagerOrphan();
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 500, idleMs: 20 });
  const p = mailbox.fetch('odebrane');
  t.emit({ cls: 'mail', text: 'Listy odebrane (prezentowane jest pierwsze 50):' });
  t.emit({ cls: 'mail', text: ' 1. *R* Temat: najnowszy' });
  t.emit({ cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' });
  t.emit({ cls: 'prompt', text: '> ' });
  const res = await p;
  assert.equal(res.kind, 'lista', 'listing doszedl');
  assert.equal(isPagerOrphanSuspected(), false, 'udany fetch zdjal podejrzenie');
});

test('poza operacja: pozny prompt nie wysyla q', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    suspectPagerOrphan();
    const qBefore = f.sent.filter((c) => c === 'q').length;
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(f.sent.filter((c) => c === 'q').length, qBefore, 'brak globalnego q');
    assert.equal(isPagerOrphanSuspected(), true, 'stan czeka na lokalna operacje');

    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(f.sent.filter((c) => c === 'q').length, qBefore, 'kolejny prompt tez jest bez q');
  } finally {
    clearPagerOrphan();
    await stopHarness();
  }
});

test('generacja: reconnect czysci podejrzenie, a prompt nowej sesji gracza zostaje nietkniety', async () => {
  const h = await startHarness();
  try {
    suspectPagerOrphan();
    h.f.fireEvent('client.disconnect', undefined);
    assert.equal(isPagerOrphanSuspected(), false, 'podejrzenie nie przechodzi do nowej generacji');
    h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!h.f.sent.includes('q'), 'brak q w recznej sesji po reconnectcie');
  } finally {
    clearPagerOrphan();
    await stopHarness();
  }
});

test('generacja: zmiana postaci czysci podejrzenie starej generacji', async () => {
  const h = await startHarness();
  try {
    suspectPagerOrphan();
    h.f.setCharacter('Bar');
    await h.waitFor(() => !isPagerOrphanSuspected(), 'czyszczenie przy zmianie postaci');
    h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!h.f.sent.includes('q'), 'stare podejrzenie nie zabija sesji nowej postaci');
  } finally {
    clearPagerOrphan();
    await stopHarness();
  }
});
