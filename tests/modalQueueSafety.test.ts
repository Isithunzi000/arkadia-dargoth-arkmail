import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DargothTransport } from '../src/arkmail/adapters/dargothTransport';
import { FakeApi, notifyText } from './harness';

const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';
const DROPPED_MESSAGE =
  'Nie wykonano komend odlozonych podczas operacji pocztowej. ' +
  'Powtorz je po powrocie do zwyklego widoku gry.';

function armed(f: FakeApi): DargothTransport {
  const transport = new DargothTransport(f.api);
  transport.setOnline(true);
  transport.subscribe(() => {});
  return transport;
}

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
}

function pagerHooks(transport: DargothTransport, dropped: () => void) {
  return {
    pager: {
      onUserCommand: () => transport.setPlayerMailMode(true),
      onCommandDropped: dropped,
    },
  };
}

test('kolejka modalna: odrzucenie q nie odtwarza starych komend do nieznanego pagera', async () => {
  const f = new FakeApi();
  f.sendImpl = (command) => command === 'q'
    ? Promise.reject(new Error('syntetyczne odrzucenie q'))
    : Promise.resolve();
  const transport = armed(f);
  let dropped = 0;
  transport.beginModal(pagerHooks(transport, () => { dropped++; }));
  await f.api.command.send('spojrz', true);
  await assert.rejects(transport.send('q'), /syntetyczne odrzucenie q/);
  transport.endModal();
  await drain();

  assert.ok(!f.sent.includes('spojrz'));
  assert.equal(transport.modalQueueLength, 0);
  assert.equal(dropped, 1);
  assert.equal(transport.isRecovering(), true);
  f.sendImpl = null;
  await f.api.command.send('spojrz', true);
  assert.equal(f.sent.filter((command) => command === 'spojrz').length, 1, 'swieza komenda przechodzi raz');
  transport.dispose();
});

test('kolejka modalna: przejecie przez r porzuca stara kolejke i zglasza to raz', async () => {
  const f = new FakeApi();
  const transport = armed(f);
  let dropped = 0;
  transport.beginModal(pagerHooks(transport, () => { dropped++; }));
  await f.api.command.send('spojrz', true);
  await f.api.command.send('pomoc', true);
  f.fire(PAGER_PROMPT, 'mail');
  await f.api.command.send('r', true);
  transport.endModal();
  await drain();

  assert.deepEqual(f.sent, ['r']);
  assert.equal(dropped, 1);
  await f.api.command.send('spojrz', true);
  assert.deepEqual(f.sent, ['r', 'spojrz']);
  transport.dispose();
});

test('kolejka modalna: recovery porzuca komendy edytora i pokazuje jeden komunikat', async () => {
  const f = new FakeApi();
  const transport = armed(f);
  transport.beginModal();
  await f.api.command.send('spojrz', true);
  await f.api.command.send('pomoc', true);
  transport.beginRecovery();
  transport.endModal();
  await drain();

  assert.deepEqual(f.sent, []);
  assert.equal(notifyText(f, DROPPED_MESSAGE), true);
  assert.equal(f.shown.length, 1);
  await f.api.command.send('spojrz', true);
  assert.deepEqual(f.sent, ['spojrz']);
  transport.dispose();
});

test('kolejka modalna: destroy nie odtwarza odlozonych komend', async () => {
  const f = new FakeApi();
  const transport = armed(f);
  transport.beginModal();
  await f.api.command.send('spojrz', true);
  transport.dispose();
  await drain();

  assert.deepEqual(f.sent, []);
  assert.equal(f.shown.length, 0);
});

test('kolejka modalna: reconnect nie odtwarza odlozonych komend', async () => {
  const f = new FakeApi();
  const transport = armed(f);
  transport.beginModal();
  await f.api.command.send('spojrz', true);
  transport.setOnline(false);
  transport.setOnline(true);
  transport.endModal();
  await drain();

  assert.deepEqual(f.sent, []);
  assert.equal(f.shown.length, 0);
  transport.dispose();
});

test('kolejka modalna: potwierdzony sukces zachowuje kolejnosc komend niepagerowych', async () => {
  const f = new FakeApi();
  const transport = armed(f);
  let dropped = 0;
  transport.beginModal(pagerHooks(transport, () => { dropped++; }));
  await f.api.command.send('pomoc', true);
  await f.api.command.send('!r', true);
  await f.api.command.send('spojrz', true);
  transport.endModal();
  await drain();

  assert.deepEqual(f.sent, ['pomoc', '!r', 'spojrz']);
  assert.deepEqual(f.sentEcho, [true, true, true]);
  assert.equal(dropped, 0);
  transport.dispose();
});
