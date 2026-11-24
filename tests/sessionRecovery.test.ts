/**
 * Zakonczenie pojedynczej operacji i niezaleznosc kolejnej sesji.
 * Wszystkie dane protokolowe sa syntetyczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type PluginApi from 'plugin-api';
import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import { EditorSession } from '../src/arkmail/core/session/editor';
import { ImportSession } from '../src/arkmail/core/session/importer';
import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';

type TriggerCb = (line: { text: string }, matches: unknown, type: string) => unknown;

class FakeApi {
  readonly sent: string[] = [];
  readonly shown: Array<{ text: string; title?: string; level?: string }> = [];
  triggerCb: TriggerCb | null = null;
  sendImpl: ((command: string) => Promise<void>) | null = null;

  readonly api = {
    command: {
      send: (command: string): Promise<void> => {
        this.sent.push(command);
        return this.sendImpl?.(command) ?? Promise.resolve();
      },
    },
    triggers: {
      register: (_pattern: unknown, cb: TriggerCb) => {
        this.triggerCb = cb;
        return { id: 'trig-1' };
      },
      removeByTag: () => {},
    },
    commandHooks: {
      register: () => 'hook-1',
      unregister: () => true,
    },
    notifications: {
      show: (entry: { text: string; title?: string; level?: string }) => {
        this.shown.push(entry);
      },
    },
  } as unknown as PluginApi;

  fire(text: string, type = ''): unknown {
    return this.triggerCb?.({ text }, null, type);
  }
}

function armedTransport(f: FakeApi): DargothTransport {
  const t = new DargothTransport(f.api);
  t.setOnline(true);
  return t;
}

function letterLines(number: number, normalPrompt = true): ProtoLine[] {
  return [
    { cls: 'mail', text: `List : ${number}` },
    { cls: 'mail', text: 'Od   : Corge' },
    { cls: 'mail', text: 'Temat: syntetyczny' },
    { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
    { cls: 'mail', text: '' },
    { cls: 'mail', text: 'Syntetyczna tresc.' },
    { cls: 'mail', text: `[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- ` },
    ...(normalPrompt ? [{ cls: 'prompt', text: '> ' }] : []),
  ];
}

test('adapter: timeout nie gaguje poznych linii i nie blokuje nowej sesji', async () => {
  const f = new FakeApi();
  const t = armedTransport(f);
  const mailbox = new MailboxSession(t, { timeoutMs: 30, idleMs: 10 });
  await assert.rejects(mailbox.fetch('odebrane'), /timeout/);

  assert.deepEqual(f.fire('List : 1', 'mail'), { text: 'List : 1' });
  assert.deepEqual(f.fire('Zwykly dialog.', 'other'), { text: 'Zwykly dialog.' });
  const session = t.openSession();
  session.close();
  await t.send('listy odebrane');
  assert.deepEqual(f.sent, ['listy odebrane', 'listy odebrane']);
  assert.deepEqual(f.fire('Listy odebrane:', 'mail'), { text: 'Listy odebrane:' });
  t.dispose();
});

test('adapter: reczna poczta zatrzymuje komende pluginu oczekujaca w kolejce', async () => {
  const f = new FakeApi();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  f.sendImpl = () => gate;
  const t = armedTransport(f);
  const first = t.send('pierwsza');
  const second = t.send('druga');
  const secondCheck = assert.rejects(second, /operacja anulowana/);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.sent, ['pierwsza']);

  t.setPlayerMailMode(true);
  release();
  await first;
  await secondCheck;
  assert.deepEqual(f.sent, ['pierwsza'], 'oczekujaca komenda nie trafia do gry');
  t.dispose();
});

test('adapter: reconnect otwiera nowa operacje bez starego promptu', async () => {
  const f = new FakeApi();
  const t = armedTransport(f);
  const first = t.openSession();
  t.setOnline(false);
  t.setOnline(true);
  assert.equal(first.active, false);

  const second = t.openSession();
  assert.ok(second.id > first.id);
  second.close();
  await t.send('listy odebrane');
  assert.deepEqual(f.sent, ['listy odebrane']);
  t.dispose();
});

test('mailbox: cisza po listingu zwraca zebrane wpisy i zwalnia sesje', async () => {
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 200, idleMs: 20 });
  const operation = mailbox.fetch('odebrane');
  await t.replay([
    { cls: 'mail', text: 'Listy odebrane (prezentowane jest pierwsze 50):' },
    { cls: 'mail', text: ' 1. *R* Temat: syntetyczny' },
    { cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' },
  ]);
  const result = await operation;
  assert.equal(result.kind, 'lista');
  assert.equal(result.kind === 'lista' ? result.entries.length : 0, 1);

  const next = mailbox.fetch('odebrane');
  await t.replay([
    { cls: 'mail', text: 'Nie masz zadnych odebranych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  assert.equal((await next).kind, 'pusta');
});

test('pager: cisza po q zwraca list i od razu zwalnia kolejna komende', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, { timeoutMs: 1000, idleMs: 20 });
  const operation = pager.readLetter(1);
  await t.replay(letterLines(1, false));
  const unread = await operation;
  assert.equal(unread.letter.number, 1);
  assert.deepEqual(unread.letter.body, ['', 'Syntetyczna tresc.']);
  assert.ok(t.sent.includes('q'));

  const next = pager.readLetter(2);
  assert.deepEqual(t.sent, ['przeczytaj list 1', 'q', 'przeczytaj list 2']);
  await t.replay(letterLines(2));
  const result = await next;
  assert.equal(result.letter.number, 2);
});

test('editor: pozna odpowiedz po timeoutcie nie blokuje kolejnej wysylki', async () => {
  const f = new FakeApi();
  const t = armedTransport(f);
  const editor = new EditorSession(t, { timeoutMs: 30, idleMs: 10 });
  const result = await editor.send({ adresat: 'Corge', temat: 'Test', linie: ['Tresc.'] });
  assert.deepEqual(result, { result: 'blad', error: { kind: 'timeout' } });

  assert.deepEqual(
    f.fire('List jest gotowy do wyslania.', 'mail'),
    { text: 'List jest gotowy do wyslania.' },
  );
  const next = editor.send({ adresat: 'Corge', temat: 'Drugi', linie: ['Nowa tresc.'] });
  await new Promise((resolve) => setImmediate(resolve));
  f.fire('Zaniechane.', 'mail');
  assert.deepEqual(await next, { result: 'zaniechany' });
  assert.equal(f.sent.filter((command) => command === 'napisz list').length, 2);
  t.dispose();
});

test('import: cisza bez promptu nie jest pomyslnym zakonczeniem', async () => {
  const t = new MockTransport();
  const importer = new ImportSession(t, { timeoutMs: 200, idleMs: 20 });
  const operation = importer.fetchPeople('zapamietani');
  await t.replay([{ cls: 'mail', text: 'Zapamietani: Corge.' }]);
  await assert.rejects(operation, /timeout/);
  const next = importer.fetchPeople('zapamietani');
  await t.replay([
    { cls: 'mail', text: '[12] Zapamietane przez ciebie imiona to Corge.' },
    { cls: 'prompt', text: '> ' },
  ]);
  assert.deepEqual(await next, ['Corge']);
});
