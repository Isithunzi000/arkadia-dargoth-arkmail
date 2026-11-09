/**
 * Sekcja 16, krok 3: potwierdzony koniec odpowiedzi i odzyskiwanie.
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

test('adapter: timeout utrzymuje gag i blokuje nowa sesje do zwyklego promptu', async () => {
  const f = new FakeApi();
  const t = armedTransport(f);
  const mailbox = new MailboxSession(t, { timeoutMs: 30, idleMs: 10 });
  await assert.rejects(mailbox.fetch('odebrane'), /timeout/);

  assert.equal(f.fire('List : 1', 'mail'), null, 'pozna linia mail pozostaje gagowana');
  assert.deepEqual(f.fire('Zwykly dialog.', 'other'), { text: 'Zwykly dialog.' });
  assert.throws(() => t.openSession(), /operacja anulowana/);
  await assert.rejects(t.send('listy odebrane'), /operacja anulowana/);

  assert.deepEqual(f.fire('> ', 'prompt'), { text: '> ' });
  const session = t.openSession();
  session.close();
  await t.send('listy odebrane');
  assert.deepEqual(f.fire('Listy odebrane:', 'mail'), { text: 'Listy odebrane:' });
  t.dispose();
});

test('adapter: odzyskiwanie zatrzymuje komende pluginu oczekujaca w kolejce', async () => {
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

  t.beginRecovery();
  release();
  await first;
  await secondCheck;
  assert.deepEqual(f.sent, ['pierwsza'], 'oczekujaca komenda nie trafia do gry');
  t.dispose();
});

test('adapter: reconnect z aktywna sesja wymaga promptu przed nowa operacja', () => {
  const f = new FakeApi();
  const t = armedTransport(f);
  const first = t.openSession();
  t.setOnline(false);
  t.setOnline(true);
  assert.equal(first.active, false);

  assert.equal(f.fire('Spozniona odpowiedz.', 'mail'), null);
  assert.deepEqual(f.fire('Dialog uzytkownika.', 'other'), { text: 'Dialog uzytkownika.' });
  assert.throws(() => t.openSession(), /operacja anulowana/);

  f.fire('> ', 'prompt');
  const second = t.openSession();
  assert.ok(second.id > first.id);
  second.close();
  t.dispose();
});

test('mailbox: cisza bez promptu nie jest pomyslnym zakonczeniem', async () => {
  const t = new MockTransport();
  const mailbox = new MailboxSession(t, { timeoutMs: 200, idleMs: 20 });
  const operation = mailbox.fetch('odebrane');
  await t.replay([
    { cls: 'mail', text: 'Listy odebrane (prezentowane jest pierwsze 50):' },
    { cls: 'mail', text: ' 1. *R* Temat: syntetyczny' },
    { cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' },
  ]);
  await assert.rejects(operation, /timeout/);
  await assert.rejects(mailbox.fetch('odebrane'), /operacja anulowana/);

  await t.replay([{ cls: 'prompt', text: '> ' }]);
  const next = mailbox.fetch('odebrane');
  await t.replay([
    { cls: 'mail', text: 'Nie masz zadnych otrzymanych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  const result = await next;
  assert.equal(result.kind, 'pusta');
});

test('pager: cisza po q nie jest pomyslnym zakonczeniem odczytu', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, { timeoutMs: 200, idleMs: 20 });
  const operation = pager.readLetter(1);
  await t.replay(letterLines(1, false));
  await assert.rejects(operation, /timeout/);
  assert.ok(t.sent.includes('q'));
  await assert.rejects(pager.readLetter(1), /operacja anulowana/);

  await t.replay([{ cls: 'prompt', text: '> ' }]);
  const next = pager.readLetter(1);
  await t.replay(letterLines(1));
  const result = await next;
  assert.equal(result.letter.number, 1);
});

test('editor: pozna odpowiedz po timeoutcie jest gagowana, a nowa wysylka zablokowana', async () => {
  const f = new FakeApi();
  const t = armedTransport(f);
  const editor = new EditorSession(t, { timeoutMs: 30, idleMs: 10 });
  const result = await editor.send({ adresat: 'Corge', temat: 'Test', linie: ['Tresc.'] });
  assert.deepEqual(result, { result: 'blad', error: { kind: 'timeout' } });

  assert.equal(f.fire('List jest gotowy do wyslania.', 'mail'), null);
  await assert.rejects(
    editor.send({ adresat: 'Corge', temat: 'Drugi', linie: ['Nowa tresc.'] }),
    /operacja anulowana/,
  );
  f.fire('> ', 'prompt');
  t.dispose();
});

test('import: cisza bez promptu nie jest pomyslnym zakonczeniem', async () => {
  const t = new MockTransport();
  const importer = new ImportSession(t, { timeoutMs: 200, idleMs: 20 });
  const operation = importer.fetchPeople('zapamietani');
  await t.replay([{ cls: 'mail', text: 'Zapamietani: Corge.' }]);
  await assert.rejects(operation, /timeout/);
  await assert.rejects(importer.fetchPeople('zapamietani'), /operacja anulowana/);

  await t.replay([{ cls: 'prompt', text: '> ' }]);
  const next = importer.fetchPeople('zapamietani');
  await t.replay([{ cls: 'prompt', text: '> ' }]);
  assert.deepEqual(await next, []);
});
