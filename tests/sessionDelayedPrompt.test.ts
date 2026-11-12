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

test('mailbox: prompt po limicie ciszy konczy kompletny listing sukcesem', async (context) => {
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
  context.mock.timers.tick(400);
  await flushPromises();
  assert.equal(settlement, 'pending', 'cisza nie rozstrzyga operacji');

  await transport.replay([{ cls: 'prompt', text: '> ' }]);
  const result = await operation;
  assert.equal(result.kind, 'lista');
  assert.equal(result.kind === 'lista' ? result.entries.length : 0, 1);
});

test('pager: opozniony prompt po q konczy odczyt sukcesem', async (context) => {
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
  assert.equal(settlement, 'pending', 'cisza po q nie rozstrzyga operacji');

  await transport.replay([{ cls: 'prompt', text: '> ' }]);
  const result = await operation;
  assert.equal(result.letter.number, 1);
  assert.deepEqual(result.letter.body, ['', 'Syntetyczna tresc.']);
});

test('mailbox: brak promptu odrzuca listing dopiero po pelnym limicie', async (context) => {
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
  context.mock.timers.tick(7999);
  await flushPromises();
  assert.equal(settlement, 'pending', 'przed pelnym limitem nie ma rozstrzygniecia');

  const rejection = assert.rejects(operation, /timeout: mailbox fetch odebrane/);
  context.mock.timers.tick(1);
  await rejection;
  assert.equal(settlement, 'rejected');
});

test('pager: brak promptu po q odrzuca odczyt dopiero po pelnym limicie', async (context) => {
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
  context.mock.timers.tick(7999);
  await flushPromises();
  assert.equal(settlement, 'pending', 'przed pelnym limitem nie ma rozstrzygniecia');

  const rejection = assert.rejects(operation, /timeout: pager session list 1/);
  context.mock.timers.tick(1);
  await rejection;
  assert.equal(settlement, 'rejected');
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
