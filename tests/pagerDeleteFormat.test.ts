/**
 * Realny format odpowiedzi readera na zaznaczanie multi (zgloszenie
 * 2026-10-30, log z gry): serwer LACZY numery spojnikiem " i ", a nie
 * przecinkami:
 *
 *   → d 1,4
 *   Zaznaczono do skasowania: 1 i 4.
 *   [1-50 adefFhHmnqrsRux.!?-+] (aktualny: 1) --
 *   → q
 *   Kasuje listy...
 *   Kasuje: 1 i 4.
 *   > 
 *
 *   → d 1-2
 *   Zaznaczono do skasowania: 1 i 2.
 *   ...
 *   Kasuje: 1 i 2.
 *
 * Stary parser oczekiwal "1, 4." / "Kasuje: N." per linia - multi
 * nigdy nie dopasowywalo, sesja wisiala do timeoutu i wycofywana
 * przez "u" (nic nie kasowalo). Single dzialalo, bo "1." pasowalo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { PagerSession } from '../src/arkmail/core/session/pager';

const OPTS = { timeoutMs: 500, idleMs: 40 };
const PAGER = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';
const OPEN: ProtoLine[] = [
  { cls: 'mail', text: 'List : 1' },
  { cls: 'mail', text: 'Od   : Foo' },
  { cls: 'mail', text: 'Temat: 03' },
  { cls: 'mail', text: 'Data : Sr, 28 X 2026, 23:39:02' },
  { cls: 'mail', text: '' },
  { cls: 'mail', text: 'Tresc.' },
  { cls: 'mail', text: PAGER },
];

interface DeleteOutcome {
  status: string;
  deleted: boolean;
  deletedNumbers: number[];
  selectedNumbers: number[];
}

test('pager: d 1,4 - realny format "1 i 4" kasuje oba listy', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(1, '1,4');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 1 i 4.' },
    { cls: 'mail', text: PAGER },
    { cls: 'mail', text: 'Kasuje listy...' },
    { cls: 'mail', text: 'Kasuje: 1 i 4.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = (await op) as unknown as DeleteOutcome;
  assert.equal(res.status, 'complete', 'status');
  assert.equal(res.deleted, true, 'deleted');
  assert.deepEqual(res.deletedNumbers, [1, 4], 'fizycznie potwierdzone numery');
  assert.deepEqual(res.selectedNumbers, [1, 4], 'zaznaczone numery');
});

test('pager: d 1-2 - zakres rozwiniety w odpowiedzi "1 i 2"', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(1, '1-2');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 1 i 2.' },
    { cls: 'mail', text: PAGER },
    { cls: 'mail', text: 'Kasuje listy...' },
    { cls: 'mail', text: 'Kasuje: 1 i 2.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = (await op) as unknown as DeleteOutcome;
  assert.equal(res.status, 'complete', 'status');
  assert.deepEqual(res.deletedNumbers, [1, 2], 'oba numery z zakresu');
});

test('pager: kolejnosc numerow w odpowiedzi nie ma znaczenia (zbior)', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(1, '1,4');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 4 i 1.' },
    { cls: 'mail', text: PAGER },
    { cls: 'mail', text: 'Kasuje listy...' },
    { cls: 'mail', text: 'Kasuje: 4 i 1.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = (await op) as unknown as DeleteOutcome;
  assert.equal(res.status, 'complete', 'status');
  assert.deepEqual(res.deletedNumbers, [1, 4], 'numery sortowane rosnaco');
});

test('pager: single bez zmian - "1." nadal kompletny', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(1, '1');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 1.' },
    { cls: 'mail', text: PAGER },
    { cls: 'mail', text: 'Kasuje listy...' },
    { cls: 'mail', text: 'Kasuje: 1.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = (await op) as unknown as DeleteOutcome;
  assert.equal(res.status, 'complete', 'status');
  assert.deepEqual(res.deletedNumbers, [1], 'jedyny list');
});

test('pager: niezgodny zbior w odpowiedzi wycofuje sie natychmiast (u + q)', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(1, '1,4');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 1 i 5.' },
    { cls: 'mail', text: PAGER },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = (await op) as unknown as DeleteOutcome;
  assert.equal(res.status, 'none', 'bez kasowania');
  assert.equal(res.deleted, false, 'deleted');
  assert.deepEqual(
    t.sent,
    ['przeczytaj list 1', 'd 1,4', 'u 1,4-5', 'q'],
    'wycofanie obejmuje zadanie i potwierdzone zaznaczenie (zakres skompresowany)',
  );
});
