/** Opozniony prompt potwierdza kompletna odpowiedz. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ImportSession } from '../src/arkmail/core/session/importer';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';

const letterLines = (number: number): ProtoLine[] => [
  { cls: 'mail', text: `List : ${number}` },
  { cls: 'mail', text: 'Od   : Corge' },
  { cls: 'mail', text: 'Temat: syntetyczny' },
  { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
  { cls: 'mail', text: '' },
  { cls: 'mail', text: 'Syntetyczna tresc.' },
  { cls: 'mail', text: `[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- ` },
];

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => { setImmediate(resolve); });
};

test('mailbox: opozniony prompt przed limitem ciszy potwierdza listing', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const mailbox = new MailboxSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = mailbox.fetch('odebrane');
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected'; },
  );

  await transport.replay([
    { cls: 'mail', text: 'Listy odebrane:' },
    { cls: 'mail', text: ' 1. *R* Temat: syntetyczny' },
    { cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' },
  ]);
  context.mock.timers.tick(399);
  await flushPromises();
  assert.equal(settlement, 'pending', 'przed limitem ciszy operacja nadal czeka');

  await transport.replay([{ cls: 'prompt', text: '> ' }]);
  const result = await operation;
  assert.equal(result.kind, 'lista');
  assert.equal(result.kind === 'lista' && result.confirmed, true);
  assert.equal(result.kind === 'lista' ? result.entries.length : 0, 1);
});

test('pager: pozny prompt po oddaniu listu zdejmuje recovery', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const pager = new PagerSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = pager.readLetter(1);
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected'; },
  );

  await transport.replay(letterLines(1));
  assert.equal(transport.sent.at(-1), 'q');
  context.mock.timers.tick(400);
  await flushPromises();
  assert.equal(settlement, 'resolved');
  const result = await operation;
  assert.equal(result.letter.number, 1);
  assert.deepEqual(result.letter.body, ['', 'Syntetyczna tresc.']);
  await assert.rejects(pager.readLetter(2), /operacja anulowana/);

  await transport.replay([{ cls: 'prompt', text: '> ' }]);
  const next = pager.readLetter(2);
  await transport.replay([...letterLines(2), { cls: 'prompt', text: '> ' }]);
  assert.equal((await next).letter.number, 2);
});

test('mailbox: brak promptu zwraca niepotwierdzony listing po limicie ciszy', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const mailbox = new MailboxSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = mailbox.fetch('odebrane');
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected' },
  );

  await transport.replay([
    { cls: 'mail', text: 'Listy odebrane:' },
    { cls: 'mail', text: ' 1. *R* Temat: syntetyczny' },
    { cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' },
  ]);
  context.mock.timers.tick(400);
  await flushPromises();
  assert.equal(settlement, 'resolved', 'cisza zwraca uzyteczny wynik');
  const result = await operation;
  assert.equal(result.kind, 'lista');
  assert.equal(result.kind === 'lista' && result.confirmed, false);
});

test('pager: brak promptu po q zwraca kompletny list po krotkim czasie', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const pager = new PagerSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = pager.readLetter(1);
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected' },
  );

  await transport.replay(letterLines(1));
  assert.equal(transport.sent.at(-1), 'q');
  context.mock.timers.tick(399);
  await flushPromises();
  assert.equal(settlement, 'pending', 'krotki czas oczekiwania na prompt jeszcze trwa');

  context.mock.timers.tick(1);
  await flushPromises();
  assert.equal(settlement, 'resolved');
  const result = await operation;
  assert.equal(result.letter.number, 1);
  assert.deepEqual(result.letter.body, ['', 'Syntetyczna tresc.']);
  await assert.rejects(pager.readLetter(2), /operacja anulowana/);
  assert.deepEqual(transport.sent, ['przeczytaj list 1', 'q']);
});

test('import: prompt po limicie ciszy konczy kompletna odpowiedz sukcesem', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const importer = new ImportSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = importer.fetchPeople('zapamietani');
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected' },
  );

  await transport.replay([{ cls: 'mail', text: '[12] Zapamietane przez ciebie imiona to Corge.' }]);
  context.mock.timers.tick(400);
  await flushPromises();
  assert.equal(settlement, 'pending', 'cisza nie rozstrzyga importu');

  await transport.replay([{ cls: 'prompt', text: '> ' }]);
  assert.deepEqual(await operation, ['Corge']);
});

test('import: brak promptu odrzuca odpowiedz dopiero po pelnym limicie', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const importer = new ImportSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = importer.fetchPeople('zapamietani');
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected' },
  );

  await transport.replay([{ cls: 'mail', text: '[12] Zapamietane przez ciebie imiona to Corge.' }]);
  context.mock.timers.tick(7999);
  await flushPromises();
  assert.equal(settlement, 'pending', 'przed pelnym limitem nie ma rozstrzygniecia');

  const rejection = assert.rejects(operation, /import zapamietani: timeout/);
  context.mock.timers.tick(1);
  await rejection;
  assert.equal(settlement, 'rejected');
});
