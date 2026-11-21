/** Timeout compose zamyka tylko edytor potwierdzony odpowiedzia serwera. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EditorSession, type ComposeInput } from '../src/arkmail/core/session/editor';
import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';

const OPTS = { timeoutMs: 100 };
const READY = 'Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.';
const INPUT: ComposeInput = {
  adresat: 'Corge',
  temat: 'Temat',
  linie: ['Pierwsza linia.', 'Druga linia.'],
};
const PREFIX = ['napisz list', 'Corge', 'Temat', ''];
const BODY = ['Pierwsza linia.', 'Druga linia.', '**'];

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const mail = (text: string): ProtoLine => ({ cls: 'mail', text });
const prompt = (): ProtoLine => ({ cls: 'prompt', text: '> ' });

function start(transport: MockTransport, onCancel?: (cb: () => void) => () => void) {
  const editor = new EditorSession(transport, { ...OPTS, onCancel });
  const operation = editor.send(INPUT);
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected'; },
  );
  return { editor, operation, settlement: () => settlement };
}

async function reachEditor(transport: MockTransport) {
  const current = start(transport);
  await transport.replay([mail('Adresat: Temat: DW: '), mail(READY)]);
  await flushPromises();
  assert.deepEqual(transport.sent, [...PREFIX, ...BODY], 'potwierdzony edytor otrzymal tresc i **');
  return current;
}

const beforeEditorCases: Array<{
  name: string;
  lines: ProtoLine[];
  expected: string[];
}> = [
  { name: 'adresacie', lines: [], expected: ['napisz list', 'Corge'] },
  { name: 'temacie', lines: [mail('Temat: ')], expected: ['napisz list', 'Corge', 'Temat'] },
  { name: 'DW', lines: [mail('DW: ')], expected: ['napisz list', 'Corge', ''] },
  {
    name: 'oczekiwaniu na gotowosc edytora',
    lines: [mail('Adresat: Temat: DW: ')],
    expected: PREFIX,
  },
];

for (const scenario of beforeEditorCases) {
  test(`editor: timeout na etapie ${scenario.name} nie wysyla ~q`, async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const transport = new MockTransport();
    const { editor, operation } = start(transport);
    await transport.replay(scenario.lines);
    await flushPromises();
    assert.deepEqual(transport.sent, scenario.expected);

    context.mock.timers.tick(100);
    assert.deepEqual(await operation, { result: 'blad', error: { kind: 'timeout' } });
    assert.ok(!transport.sent.includes('~q'), 'bez dowodu wlasnego edytora nie wolno wyslac ~q');

    const sentAfterTimeout = [...transport.sent];
    await transport.replay([mail(READY), mail('Temat: '), mail('DW: ')]);
    assert.deepEqual(transport.sent, sentAfterTimeout, 'pozne linie nie wysylaja tresci ani ~q');
    await assert.rejects(editor.send(INPUT), /operacja anulowana/);
  });
}

test('editor: potwierdzenie gotowosci przed trescia konczy sie jednym ~q', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const { operation, settlement } = start(transport);
  await transport.replay([mail(READY)]);
  await flushPromises();
  assert.deepEqual(transport.sent, ['napisz list', 'Corge'], 'bez promptow nie wyslano tematu ani tresci');

  context.mock.timers.tick(100);
  await flushPromises();
  assert.deepEqual(transport.sent, ['napisz list', 'Corge', '~q']);
  assert.equal(settlement(), 'pending', '~q otwiera ograniczone oczekiwanie na zamkniecie');

  await transport.replay([mail('Zaniechane.'), prompt()]);
  assert.deepEqual(await operation, { result: 'zaniechany' });
  assert.equal(transport.sent.filter((line) => line === '~q').length, 1);
});

test('editor: timeout po ** konczy sie dopiero po Zaniechane i zwyklym prompcie', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const { editor, operation, settlement } = await reachEditor(transport);

  context.mock.timers.tick(100);
  await flushPromises();
  assert.deepEqual(transport.sent, [...PREFIX, ...BODY, '~q']);
  assert.equal(settlement(), 'pending');

  await transport.replay([mail('Zaniechane.')]);
  await flushPromises();
  assert.equal(settlement(), 'pending', 'sam komunikat przerwania nie potwierdza powrotu do gry');
  await transport.replay([prompt()]);
  assert.deepEqual(await operation, { result: 'zaniechany' });

  const sentAfterClose = [...transport.sent];
  await transport.replay([mail(READY), mail('List jest gotowy do wyslania.'), prompt()]);
  assert.deepEqual(transport.sent, sentAfterClose, 'pozne linie nie zmieniaja wyniku ani nie wysylaja komend');
  assert.equal(transport.sent.filter((line) => line === '~q').length, 1);

  const next = editor.send(INPUT);
  await flushPromises();
  assert.equal(transport.sent.filter((line) => line === 'napisz list').length, 2, 'mozna swiadomie ponowic');
  context.mock.timers.tick(100);
  assert.deepEqual(await next, { result: 'blad', error: { kind: 'timeout' } });
});

test('editor: brak potwierdzenia zamkniecia po ~q wymaga synchronizacji', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const { editor, operation, settlement } = await reachEditor(transport);

  context.mock.timers.tick(100);
  await flushPromises();
  assert.equal(transport.sent.filter((line) => line === '~q').length, 1);
  assert.equal(settlement(), 'pending');
  context.mock.timers.tick(399);
  await flushPromises();
  assert.equal(settlement(), 'pending', 'przed koncem krotkiego oczekiwania nie ma rozstrzygniecia');
  context.mock.timers.tick(1);
  assert.deepEqual(await operation, { result: 'blad', error: { kind: 'timeout' } });
  assert.equal(transport.sent.filter((line) => line === '~q').length, 1, 'brak drugiego ~q');

  await assert.rejects(editor.send(INPUT), /operacja anulowana/, 'komendy pluginu czekaja na synchronizacje');
  await transport.replay([prompt()]);
  const next = editor.send(INPUT);
  await flushPromises();
  assert.equal(transport.sent.filter((line) => line === 'napisz list').length, 2, 'prompt odblokowuje ponowienie');
  context.mock.timers.tick(100);
  assert.deepEqual(await next, { result: 'blad', error: { kind: 'timeout' } });
});

test('editor: Zaniechane bez zwyklego promptu nie jest potwierdzonym zamknieciem', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const { editor, operation, settlement } = await reachEditor(transport);

  context.mock.timers.tick(100);
  await flushPromises();
  await transport.replay([mail('Zaniechane.')]);
  assert.equal(settlement(), 'pending');
  context.mock.timers.tick(400);
  assert.deepEqual(await operation, { result: 'blad', error: { kind: 'timeout' } });
  assert.equal(transport.sent.filter((line) => line === '~q').length, 1);
  await assert.rejects(editor.send(INPUT), /operacja anulowana/);
});

test('editor: prompt przed Zaniechane nie jest potwierdzeniem zamkniecia', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const { editor, operation, settlement } = await reachEditor(transport);

  context.mock.timers.tick(100);
  await flushPromises();
  await transport.replay([prompt(), mail('Zaniechane.')]);
  assert.equal(settlement(), 'pending', 'prompt musi przyjsc po potwierdzonym przerwaniu');
  context.mock.timers.tick(400);
  assert.deepEqual(await operation, { result: 'blad', error: { kind: 'timeout' } });
  assert.equal(transport.sent.filter((line) => line === '~q').length, 1);
  await assert.rejects(editor.send(INPUT), /operacja anulowana/);
});

test('editor: wspolny reset i rozlaczenie nie wysylaja ~q', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  let cancel!: () => void;
  const { operation } = start(transport, (cb) => {
    cancel = cb;
    return () => {};
  });
  await transport.replay([mail('Adresat: Temat: DW: '), mail(READY)]);
  await flushPromises();
  assert.deepEqual(transport.sent, [...PREFIX, ...BODY]);

  cancel();
  transport.setOnline(false);
  await assert.rejects(operation, /operacja anulowana/);
  context.mock.timers.tick(1000);
  await flushPromises();
  assert.ok(!transport.sent.includes('~q'));
});
