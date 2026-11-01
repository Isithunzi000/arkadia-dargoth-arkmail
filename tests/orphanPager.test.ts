/**
 * Fala 24g: flaga podejrzenia sierocego pagera (core/session/orphanPager).
 *
 * Kontrakt:
 * - flaga startuje czysta; suspect/clear dzialaja jak przełacznik;
 * - awaryjny timeout sesji pagerowej STAWIA podejrzenie (pager mogl
 *   zostac na serwerze - "q" poszlo bez potwierdzenia);
 * - sierocy pager przetrwaly "q" w fetchu STAWIA podejrzenie;
 * - kazdy UDANY fetch/odczyt ZDEJMUJE podejrzenie (komendy dochodza);
 * - straznik w index.ts: podejrzenie + prompt pagera poza blokada ->
 *   jedno "q" i flaga zdjeta; kolejny prompt bez podejrzenia nietkniety.
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

test('timeout sesji pagerowej stawia podejrzenie sieroty', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const pager = new PagerSession(t, { timeoutMs: 50, idleMs: 20 });
  const p = pager.readLetter(1);
  // Serwer milknie calkowicie - sesja timeoutuje; "q" leci bez
  // potwierdzenia, pager moze zostac na serwerze.
  await assert.rejects(p, /timeout/, 'sesja konczy sie timeoutem');
  assert.ok(t.sent.includes('q'), 'sesja probowala domknac pager przed porzuceniem');
  assert.equal(isPagerOrphanSuspected(), true, 'timeout stawia podejrzenie');
  clearPagerOrphan();
});

test('sierocy pager przetrwaly q w fetchu stawia podejrzenie', async () => {
  clearPagerOrphan();
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 500, idleMs: 20 });
  const p = mailbox.fetch('odebrane');
  const run = (async () => {
    // Sierota zjada komende i odpowiada wlasnym promptem (17a)...
    t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 3) -- ' });
    await new Promise((r) => setImmediate(r));
    // ...nasze "q" zostalo potwierdzone promptem gry, komenda poszla
    // ponownie...
    t.emit({ cls: 'prompt', text: '> ' });
    await new Promise((r) => setImmediate(r));
    // ...ale pager przetrwal: zamiast listingu znowu jego prompt.
    t.emit({ cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 3) -- ' });
  })();
  await assert.rejects(p, /sierocy pager/, 'fetch odrzucony przez sierote');
  await run;
  assert.equal(isPagerOrphanSuspected(), true, 'przetrwala sierota stawia podejrzenie');
  clearPagerOrphan();
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

test('straznik: podejrzenie + prompt pagera -> jedno q i flaga zdjeta', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    // Udany prolog zdjal flage (kazdy fetch czysci) - stawiamy recznie,
    // jak po awaryjnym timeoutcie sesji.
    suspectPagerOrphan();
    const qBefore = f.sent.filter((c) => c === 'q').length;
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await waitFor(
      () => f.sent.filter((c) => c === 'q').length === qBefore + 1,
      'straznik wyslal q przy podejrzeniu',
    );
    assert.equal(isPagerOrphanSuspected(), false, 'po wyslaniu q flaga zdjeta');
    // Kolejny prompt (np. serwer powtorzyl) bez podejrzenia - bez q.
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(
      f.sent.filter((c) => c === 'q').length,
      qBefore + 1,
      'drugi prompt bez podejrzenia nietkniety',
    );
  } finally {
    clearPagerOrphan();
    await stopHarness();
  }
});
