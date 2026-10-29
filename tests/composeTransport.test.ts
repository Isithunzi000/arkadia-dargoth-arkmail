import { test } from 'node:test';
import assert from 'node:assert/strict';

import type PluginApi from 'plugin-api';
import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import { EditorSession } from '../src/arkmail/core/session/editor';

type HookResult = string | null | undefined;
type Hook = (command: string) => HookResult;
type Trigger = (line: { text: string }, matches: null, cls: string) => unknown;

const READY = 'Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.';
const RESULT = 'List jest gotowy do wyslania.';
const TOP = '+-----+';
const BODY = '| Foo |';
const BOTTOM = '+-----+';

/** Modeluje hooki, rozdzielanie komend i asynchroniczne api.command.send. */
class ComposeClient {
  readonly wire: string[] = [];
  hook: Hook | null = null;
  trigger: Trigger | null = null;
  onWire: ((command: string) => void) | null = null;
  resultAfter = '**';
  delay: (command: string) => number = () => 0;
  private finished = false;
  private readonly pending = new Set<Promise<void>>();

  readonly api = {
    command: {
      send: (command: string, _echo?: boolean, _options?: unknown): Promise<void> => {
        const task = this.process(command);
        this.pending.add(task);
        void task.then(() => this.pending.delete(task));
        return task;
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
  } as unknown as PluginApi;

  async drain(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  private async process(command: string): Promise<void> {
    const hooked = this.hook?.(command);
    if (hooked === null) return;
    const changed = typeof hooked === 'string' ? hooked : command;
    for (const part of changed.split(/[#;]/)) await this.deliver(part);
  }

  private async deliver(command: string): Promise<void> {
    const wait = this.delay(command);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.wire.push(command);
    this.onWire?.(command);

    if (command === 'napisz list') this.emit('Adresat: ');
    else if (command === 'Foo') this.emit('Temat: ');
    else if (command === 'Temat') this.emit('DW: ');
    else if (command === '') this.emit(READY);

    if (command === this.resultAfter && !this.finished) {
      this.finished = true;
      this.emit(RESULT);
    }
  }

  private emit(text: string): void {
    this.trigger?.({ text }, null, 'mail');
  }
}

function start(client: ComposeClient, timeoutMs = 500, onCancel?: (cb: () => void) => () => void) {
  const transport = new DargothTransport(client.api);
  transport.beginModal();
  const editor = new EditorSession(transport, { timeoutMs, onCancel });
  const operation = editor.send({
    adresat: 'Foo',
    temat: 'Temat',
    linie: [TOP, BODY, BODY, BOTTOM],
  });
  return { transport, operation };
}

const PREFIX = ['napisz list', 'Foo', 'Temat', ''];

test('compose: kazda linia dociera przed wyslaniem kolejnej', async () => {
  const client = new ComposeClient();
  client.delay = (command) => command === TOP ? 20 : command === BODY ? 5 : 0;
  const { transport, operation } = start(client);
  const outcome = await operation;
  transport.endModal();
  await client.drain();

  assert.deepEqual(outcome, { result: 'gotowy' });
  assert.deepEqual(client.wire, [...PREFIX, TOP, BODY, BODY, BOTTOM, '**']);
});

test('compose: wynik konczy wysylke bez poznych linii', async () => {
  const client = new ComposeClient();
  client.resultAfter = BODY;
  client.delay = (command) => command === TOP ? 20 : 0;
  const { transport, operation } = start(client);
  const outcome = await operation;
  transport.endModal();
  await client.drain();

  assert.deepEqual(outcome, { result: 'gotowy' });
  assert.deepEqual(client.wire, [...PREFIX, TOP, BODY]);
  assert.ok(!client.wire.includes('**'));
});

test('compose: anulowanie nie zwalnia pozostalych linii', async () => {
  const client = new ComposeClient();
  let cancel!: () => void;
  client.delay = (command) => command === BODY ? 10 : command === '**' ? 50 : 0;
  client.onWire = (command) => {
    if (command === TOP) cancel();
  };
  const { transport, operation } = start(client, 500, (cb) => {
    cancel = cb;
    return () => {};
  });
  const rejected = assert.rejects(operation, /operacja anulowana/);
  await rejected;
  transport.endModal();
  await client.drain();

  assert.deepEqual(client.wire, [...PREFIX, TOP]);
  assert.ok(!client.wire.includes('**'));
});

test('compose: timeout nie zwalnia pozostalych linii', async () => {
  const client = new ComposeClient();
  client.delay = (command) => command === TOP ? 40 : command === '**' ? 80 : 0;
  const { transport, operation } = start(client, 15);
  const outcome = await operation;
  transport.endModal();
  await client.drain();

  assert.deepEqual(outcome, { result: 'blad', error: { kind: 'timeout' } });
  assert.deepEqual(client.wire, [...PREFIX, TOP]);
  assert.ok(!client.wire.includes('**'));
});

test('transport: identyczne komendy pluginu i gracza nie mieszaja kolejek', async () => {
  const client = new ComposeClient();
  client.delay = (command) => command === 'listy odebrane' ? 30 : 0;
  const transport = new DargothTransport(client.api);
  transport.beginModal();
  void transport.send('listy odebrane');
  void transport.send('q');
  await new Promise((resolve) => setImmediate(resolve));
  void client.api.command.send('q');
  transport.endModal();
  await client.drain();

  assert.deepEqual(client.wire, ['listy odebrane', 'q', 'q']);
});

test('transport: reconnect odrzuca komendy oczekujace z starego polaczenia', async () => {
  const client = new ComposeClient();
  client.delay = (command) => command === 'listy odebrane' ? 30 : 0;
  const transport = new DargothTransport(client.api);
  void transport.send('listy odebrane');
  void transport.send('listy wyslane');
  await new Promise((resolve) => setImmediate(resolve));
  transport.setOnline(false);
  transport.setOnline(true);
  await client.drain();

  assert.deepEqual(client.wire, ['listy odebrane']);
});
