import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { PagerSession } from '../src/arkmail/core/session/pager';

const OPTS = { timeoutMs: 500, idleMs: 40 };
const PAGER = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ';
const OPEN: ProtoLine[] = [
  { cls: 'mail', text: 'List : 2' },
  { cls: 'mail', text: 'Od   : Foo' },
  { cls: 'mail', text: 'Temat: Test' },
  { cls: 'mail', text: 'Data : Wt, 23 XII 2025, 00:11:12' },
  { cls: 'mail', text: '' },
  { cls: 'mail', text: 'Tresc.' },
  { cls: 'mail', text: PAGER },
];

test('pager: samo zaznaczenie bez Kasuje nie jest dowodem usuniecia', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(2, '2');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 2.' },
    { cls: 'mail', text: PAGER },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await op as unknown as {
    status: string;
    deleted: boolean;
    deletedNumbers: number[];
    selectedNumbers: number[];
  };
  assert.equal(res.deleted, false);
  assert.deepEqual(res.deletedNumbers, []);
  assert.deepEqual(res.selectedNumbers, [2]);
  assert.equal(res.status, 'unknown');
});

test('pager: zbiera tylko fizyczne potwierdzenia i zglasza wynik czesciowy', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(2, '2-4,7');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 2, 3, 4, 7.' },
    { cls: 'mail', text: PAGER },
    { cls: 'mail', text: 'Kasuje listy...' },
    { cls: 'mail', text: 'Kasuje: 2.' },
    { cls: 'mail', text: 'Kasuje: 3.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await op as unknown as {
    status: string;
    deleted: boolean;
    deletedNumbers: number[];
    selectedNumbers: number[];
  };
  assert.equal(res.status, 'partial');
  assert.equal(res.deleted, true);
  assert.deepEqual(res.deletedNumbers, [2, 3]);
  assert.deepEqual(res.selectedNumbers, [2, 3, 4, 7]);
});

test('pager: niezgodne zaznaczenie wycofuje sie przez u przed q', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const op = pager.deleteLetters(2, '2-4');
  await t.replay([
    ...OPEN,
    { cls: 'mail', text: 'Zaznaczono do skasowania: 2, 4.' },
    { cls: 'mail', text: 'Odznaczono listy.' },
    { cls: 'mail', text: PAGER },
    { cls: 'prompt', text: '> ' },
  ]);
  const res = await op as unknown as {
    status: string;
    deleted: boolean;
    deletedNumbers: number[];
    selectedNumbers: number[];
  };
  assert.equal(res.status, 'none');
  assert.equal(res.deleted, false);
  assert.deepEqual(t.sent, ['przeczytaj list 2', 'd 2-4', 'u 2-4', 'q']);
});
