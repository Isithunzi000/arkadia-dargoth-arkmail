/** Timeout pagera zamyka tylko sesje, ktorych otwarcie zostalo potwierdzone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { PagerSession } from '../src/arkmail/core/session/pager';

const OPTS = { timeoutMs: 100, idleMs: 20 };
const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const LETTER: ProtoLine[] = [
  { cls: 'mail', text: 'List : 1' },
  { cls: 'mail', text: 'Od   : Corge' },
  { cls: 'mail', text: 'Temat: syntetyczny' },
  { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
  { cls: 'mail', text: '' },
  { cls: 'mail', text: 'Tresc.' },
  { cls: 'mail', text: PAGER_PROMPT },
];

test('pager: timeout przed naglowkami konczy operacje bez q i bez blokady kolejnej', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const pager = new PagerSession(transport, OPTS);
  const operation = pager.readLetter(7);
  const rejection = assert.rejects(operation, /timeout: pager session list 7/);

  context.mock.timers.tick(100);
  await flushPromises();
  assert.deepEqual(transport.sent, ['przeczytaj list 7'], 'bez q przy braku dowodu wlasnego pagera');
  await rejection;

  const next = pager.readLetter(8);
  assert.deepEqual(
    transport.sent,
    ['przeczytaj list 7', 'przeczytaj list 8'],
    'timeout bez pagera nie blokuje swiadomego ponowienia',
  );
  const nextRejection = assert.rejects(next, /timeout: pager session list 8/);
  context.mock.timers.tick(100);
  await nextRejection;
});

test('pager: pozne linie po timeoutcie przed naglowkami nie wywoluja zadnych komend', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const pager = new PagerSession(transport, OPTS);
  const operation = pager.readLetter(1);
  const rejection = assert.rejects(operation, /timeout: pager session list 1/);

  context.mock.timers.tick(100);
  await flushPromises();
  assert.deepEqual(transport.sent, ['przeczytaj list 1'], 'przed sprawdzeniem poznych linii nie ma q');
  await rejection;
  await transport.replay([
    { cls: 'mail', text: PAGER_PROMPT },
    { cls: 'prompt', text: '> ' },
    ...LETTER,
  ]);
  assert.deepEqual(transport.sent, ['przeczytaj list 1']);
});

test('pager: timeout po potwierdzonym pagerze wykonuje jedno kontrolowane zamkniecie', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const pager = new PagerSession(transport, OPTS);
  const operation = pager.forwardLetter(1, 'Corge');
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected'; },
  );
  await transport.replay([{ cls: 'mail', text: PAGER_PROMPT }]);
  assert.deepEqual(transport.sent, ['przeczytaj list 1', 'f Corge']);

  context.mock.timers.tick(100);
  await flushPromises();
  assert.equal(settlement, 'pending', 'po q operacja czeka na potwierdzenie zamkniecia');
  assert.deepEqual(
    transport.sent,
    ['przeczytaj list 1', 'f Corge', 'q'],
    'potwierdzony pager otrzymuje dokladnie jedno q',
  );

  context.mock.timers.tick(399);
  await flushPromises();
  assert.equal(settlement, 'pending', 'przed koncem krotkiego oczekiwania nie ma rozstrzygniecia');
  context.mock.timers.tick(1);
  await assert.rejects(operation, /timeout: pager session list 1/);
  assert.equal(transport.sent.filter((line) => line === 'q').length, 1);
  await assert.rejects(pager.readLetter(1), /operacja anulowana/, 'brak potwierdzenia wymaga synchronizacji');
});

test('pager: timeout podczas zamykania nie wysyla drugiego q', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const pager = new PagerSession(transport, OPTS);
  const operation = pager.readLetter(1);
  await transport.replay(LETTER);
  assert.deepEqual(transport.sent, ['przeczytaj list 1', 'q']);

  const rejection = assert.rejects(operation, /timeout: pager session list 1/);
  context.mock.timers.tick(100);
  await rejection;
  assert.equal(transport.sent.filter((line) => line === 'q').length, 1);
  await assert.rejects(pager.readLetter(1), /operacja anulowana/, 'zamykanie bez promptu wymaga synchronizacji');
});
