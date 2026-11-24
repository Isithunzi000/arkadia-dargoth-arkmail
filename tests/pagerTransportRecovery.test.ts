import { test } from 'node:test';
import assert from 'node:assert/strict';

import type PluginApi from 'plugin-api';
import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import { PagerSession } from '../src/arkmail/core/session/pager';

const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';
type Hook = (command: string) => string | null | undefined;
type Trigger = (line: { text: string }, matches: null, cls: string) => unknown;

class PagerClient {
  readonly wire: string[] = [];
  readonly wireEcho: boolean[] = [];
  hook: Hook | null = null;
  trigger: Trigger | null = null;
  reject: string | null = null;

  readonly api = {
    command: {
      send: async (command: string, echo = false): Promise<void> => {
        const hooked = this.hook?.(command);
        if (hooked === null) return;
        const value = typeof hooked === 'string' ? hooked : command;
        if (value === this.reject) throw new Error(`syntetyczne odrzucenie: ${value}`);
        this.wire.push(value);
        this.wireEcho.push(echo);
      },
    },
    commandHooks: {
      register: (hook: Hook): string => {
        this.hook = hook;
        return 'hook';
      },
      unregister: (): boolean => {
        this.hook = null;
        return true;
      },
    },
    triggers: {
      register: (_pattern: unknown, trigger: Trigger): { id: string } => {
        this.trigger = trigger;
        return { id: 'trigger' };
      },
      removeByTag: (): void => {
        this.trigger = null;
      },
    },
    notifications: { show: (): void => {} },
  } as unknown as PluginApi;

  fire(text: string, cls = 'mail'): unknown {
    return this.trigger?.({ text }, null, cls);
  }
}

function setup(client: PagerClient, timeoutMs = 60) {
  const transport = new DargothTransport(client.api);
  transport.setOnline(true);
  transport.subscribe(() => {});
  let cancel = (): void => {};
  const pager = new PagerSession(transport, {
    timeoutMs,
    idleMs: 2,
    onCancel: (cb) => {
      cancel = cb;
      return () => {};
    },
  });
  transport.beginModal({
    pager: {
      onUserCommand: () => {
        transport.setPlayerMailMode(true);
        cancel();
      },
      onCommandDropped: () => {},
    },
  });
  return { transport, pager };
}

function feedLetter(client: PagerClient, prompt: boolean): void {
  client.fire('List : 1');
  client.fire('Od   : Corge');
  client.fire('Temat: syntetyczny');
  client.fire('Data : Wt, 24 VIII 1999, 00:11:12');
  client.fire('');
  client.fire('Syntetyczna tresc.');
  if (prompt) client.fire(PAGER_PROMPT);
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Nie doczekano: ${label}`);
}

for (const closeCommand of ['q', 'x'] as const) {
  test(`pager bez jawnego promptu: wczesne ${closeCommand} gracza jest jedynym zamknieciem`, async () => {
    const client = new PagerClient();
    const { transport, pager } = setup(client);
    const operation = pager.readLetter(1);
    const cancelled = assert.rejects(operation, /operacja anulowana/);
    await client.api.command.send(closeCommand, true);
    assert.deepEqual(client.wire, ['przeczytaj list 1']);

    feedLetter(client, false);
    await waitFor(() => client.wire.includes(closeCommand), `${closeCommand} po ciszy`);
    await cancelled;
    transport.endModal();

    assert.equal(client.wire.filter((line) => line === 'q' || line === 'x').length, 1);
    assert.equal(client.wire.at(-1), closeCommand);
    assert.equal(client.wireEcho.at(-1), true);
    transport.dispose();
  });
}

test('pager bez jawnego promptu: odlozone r trafia do gry bez automatycznego q', async () => {
  const client = new PagerClient();
  const { transport, pager } = setup(client);
  const operation = pager.readLetter(1);
  const cancelled = assert.rejects(operation, /operacja anulowana/);
  await client.api.command.send('r', true);
  feedLetter(client, false);
  await waitFor(() => client.wire.includes('r'), 'r po ciszy');
  await cancelled;
  transport.endModal();

  assert.equal(client.wire.filter((line) => line === 'r').length, 1);
  assert.ok(!client.wire.includes('q'));
  assert.ok(!client.wire.includes('x'));
  transport.dispose();
});

test('pager: odrzucenie automatycznego q konczy operacje i pozwala graczowi ponowic', async () => {
  const client = new PagerClient();
  client.reject = 'q';
  const { transport, pager } = setup(client);
  const operation = pager.readLetter(1);
  feedLetter(client, true);
  await assert.rejects(operation, /syntetyczne odrzucenie: q/);
  transport.endModal();

  assert.deepEqual(client.fire('Pozna tresc.'), { text: 'Pozna tresc.' });
  const nextSession = transport.openSession();
  nextSession.close();
  client.reject = null;
  await client.api.command.send('q', true);
  assert.equal(client.wire.filter((line) => line === 'q').length, 1);
  assert.equal(client.wireEcho.at(-1), true);
  client.fire('> ', 'prompt');
  const session = transport.openSession();
  session.close();
  transport.dispose();
});

test('pager: odrzucenie bezposredniego q gracza nie blokuje ponowienia', async () => {
  const client = new PagerClient();
  const transport = new DargothTransport(client.api);
  transport.setOnline(true);
  transport.subscribe(() => {});
  transport.beginModal({
    pager: { onUserCommand: () => transport.setPlayerMailMode(true), onCommandDropped: () => {} },
  });
  client.fire(PAGER_PROMPT);
  client.reject = 'q';
  await client.api.command.send('q', true);
  await new Promise((resolve) => setImmediate(resolve));
  transport.endModal();

  client.reject = null;
  await client.api.command.send('q', true);
  assert.deepEqual(client.wire, ['q']);
  transport.dispose();
});

test('pager: zwrot listu bez zwyklego promptu pozwala recznie zamknac i kontynuowac', async () => {
  const client = new PagerClient();
  const { transport, pager } = setup(client, 1000);
  const operation = pager.readLetter(1);
  feedLetter(client, true);
  await waitFor(() => client.wire.includes('q'), 'automatyczne q');
  const result = await operation;
  transport.endModal();

  assert.equal(result.letter.body.join('\n').trim(), 'Syntetyczna tresc.');
  assert.equal(client.hook, null);
  await client.api.command.send('q', true);
  assert.deepEqual(client.wire.filter((line) => line === 'q' || line === 'x'), ['q', 'q']);
  client.fire('> ', 'prompt');
  const session = transport.openSession();
  session.close();
  transport.dispose();
});

test('pager: krotki timeout nie uniewaznia listu zwroconego po ciszy', async () => {
  const client = new PagerClient();
  const { transport, pager } = setup(client, 20);
  const operation = pager.readLetter(1);
  feedLetter(client, true);
  await waitFor(() => client.wire.includes('q'), 'automatyczne q');
  const result = await operation;
  transport.endModal();

  assert.equal(result.letter.body.join('\n').trim(), 'Syntetyczna tresc.');
  await client.api.command.send('x', true);
  assert.deepEqual(client.wire.filter((line) => line === 'q' || line === 'x'), ['q', 'x']);
  client.fire('> ', 'prompt');
  const session = transport.openSession();
  session.close();
  transport.dispose();
});

test('pager: odrzucenie akcji po potwierdzeniu pagera konczy tylko te operacje', async () => {
  const client = new PagerClient();
  client.reject = 'f Corge';
  const { transport, pager } = setup(client);
  const operation = pager.forwardLetter(1, 'Corge');
  feedLetter(client, true);
  await assert.rejects(operation, /syntetyczne odrzucenie: f Corge/);

  assert.deepEqual(client.fire('Pozna tresc.'), { text: 'Pozna tresc.' });
  const session = transport.openSession();
  session.close();
  transport.dispose();
});

test('pager: odrzucenie przed odpowiedzia serwera nie zgaduje otwartego pagera', async () => {
  const client = new PagerClient();
  client.reject = 'przeczytaj list 1';
  const { transport, pager } = setup(client);
  await assert.rejects(pager.readLetter(1), /syntetyczne odrzucenie: przeczytaj list 1/);

  assert.deepEqual(client.wire, []);
  transport.dispose();
});
