/** Blad jednej operacji nigdy nie blokuje kolejnej. Dane wylacznie syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import { EditorSession } from '../src/arkmail/core/session/editor';
import { ImportSession } from '../src/arkmail/core/session/importer';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { FakeApi } from './harness';

const letter = (number: number): ProtoLine[] => [
  { cls: 'mail', text: `List : ${number}` },
  { cls: 'mail', text: 'Od   : Foo' },
  { cls: 'mail', text: 'Temat: syntetyczny' },
  { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
  { cls: 'mail', text: '' },
  { cls: 'mail', text: 'Syntetyczna tresc.' },
  { cls: 'mail', text: `[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- ` },
  { cls: 'prompt', text: '> ' },
];

const emptyReceived: ProtoLine[] = [
  { cls: 'mail', text: 'Nie masz zadnych odebranych listow.' },
  { cls: 'prompt', text: '> ' },
];

test('listing: timeout konczy tylko biezaca operacje', async () => {
  const transport = new MockTransport();
  const mailbox = new MailboxSession(transport, { timeoutMs: 20, idleMs: 5 });
  await assert.rejects(mailbox.fetch('odebrane'), /timeout/);

  const next = mailbox.fetch('odebrane');
  await transport.replay(emptyReceived);
  assert.equal((await next).kind, 'pusta');
  assert.deepEqual(transport.sent, ['listy odebrane', 'listy odebrane']);
});

test('listing: niejednoznaczna odpowiedz nie blokuje kolejnego pobrania', async () => {
  const transport = new MockTransport();
  const mailbox = new MailboxSession(transport, { timeoutMs: 200, idleMs: 5 });
  const first = mailbox.fetch('odebrane');
  const rejected = assert.rejects(first, /listing wyslane/);
  await transport.replay([{ cls: 'mail', text: 'Listy wyslane:' }]);
  await rejected;

  const next = mailbox.fetch('odebrane');
  await transport.replay(emptyReceived);
  assert.equal((await next).kind, 'pusta');
  assert.deepEqual(transport.sent, ['listy odebrane', 'listy odebrane']);
});

test('odczyt: niezgodny pager nie blokuje kolejnego odczytu i nie dostaje q', async () => {
  const transport = new MockTransport();
  const pager = new PagerSession(transport, { timeoutMs: 200, idleMs: 5 });
  const first = pager.readLetter(1);
  const rejected = assert.rejects(first, /prompt pagera list 2/);
  await transport.replay([
    ...letter(1).slice(0, -2),
    { cls: 'mail', text: '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ' },
  ]);
  await rejected;
  assert.ok(!transport.sent.includes('q'));

  const next = pager.readLetter(2);
  await transport.replay(letter(2));
  assert.equal((await next).letter.number, 2);
  assert.deepEqual(transport.sent, ['przeczytaj list 1', 'przeczytaj list 2', 'q']);
});

test('edytor: timeout nie blokuje kolejnego compose', async () => {
  const transport = new MockTransport();
  const editor = new EditorSession(transport, { timeoutMs: 20, idleMs: 5 });
  const first = await editor.send({ adresat: 'Foo', temat: 'Pierwszy', linie: ['Tresc.'] });
  assert.deepEqual(first, { result: 'blad', error: { kind: 'timeout' } });

  const next = editor.send({ adresat: 'Foo', temat: 'Drugi', linie: ['Nowa tresc.'] });
  await transport.replay([{ cls: 'mail', text: 'Zaniechane.' }]);
  assert.deepEqual(await next, { result: 'zaniechany' });
  assert.equal(transport.sent.filter((line) => line === 'napisz list').length, 2);
});

test('import: timeout nie blokuje kolejnego importu', async () => {
  const transport = new MockTransport();
  const importer = new ImportSession(transport, { timeoutMs: 20, idleMs: 5 });
  await assert.rejects(importer.fetchPeople('zapamietani'), /timeout/);

  const next = importer.fetchPeople('zapamietani');
  await transport.replay([
    { cls: 'mail', text: '[12] Zapamietane przez ciebie imiona to Foo.' },
    { cls: 'prompt', text: '> ' },
  ]);
  assert.deepEqual(await next, ['Foo']);
  assert.deepEqual(transport.sent, ['zapamietani', 'zapamietani']);
});

test('adapter: timeout listingu nie gaguje pozniejszych linii i nie blokuje sesji', async () => {
  const f = new FakeApi();
  const transport = new DargothTransport(f.api);
  transport.setOnline(true);
  const mailbox = new MailboxSession(transport, { timeoutMs: 20, idleMs: 5 });
  await assert.rejects(mailbox.fetch('odebrane'), /timeout/);

  f.fire('Pozniejsza syntetyczna linia.', 'mail');
  assert.deepEqual(f.gagged, []);
  const session = transport.openSession();
  session.close();
  await transport.send('listy odebrane');
  assert.deepEqual(f.sent, ['listy odebrane', 'listy odebrane']);
  transport.dispose();
});

test('produkt: nie ma globalnego mechanizmu odzyskiwania', () => {
  const files = [
    'src/arkmail/adapters/dargothTransport.ts',
    'src/arkmail/core/session/editor.ts',
    'src/arkmail/core/session/importer.ts',
    'src/arkmail/core/session/mailbox.ts',
    'src/arkmail/core/session/pager.ts',
    'src/arkmail/core/session/transport.ts',
    'src/arkmail/index.ts',
  ];
  const forbidden = /\b(?:beginRecovery|finishRecovery|isRecovering|RECOVERY_LIMIT_MS|RECOVERY_BUSY_MSG)\b/;
  const hits = files.flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines.flatMap((line, index) => forbidden.test(line) ? [`${file}:${index + 1}`] : []);
  });
  assert.deepEqual(hits, []);
});
