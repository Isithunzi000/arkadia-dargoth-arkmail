/** T22/S16: lokalny parser advisory nigdy nie przepisuje danych do gry. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitRecipients,
  unknownRecipients,
  validateCompose,
} from '../src/arkmail/core/composeValidation';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { startHarness, stopHarness, notifyText } from './harness';
import { EditorSession } from '../src/arkmail/core/session/editor';
import { MockTransport } from '../src/arkmail/core/session/transport';

test('parser: przecinki i biale znaki dziela pojedyncze znane imiona', () => {
  const known = new Set(['fred', 'grault', 'corge', 'plugh', 'waldo']);
  assert.deepEqual(
    splitRecipients('Fred Grault, Corge\tPlugh  Waldo', known),
    ['Fred', 'Grault', 'Corge', 'Plugh', 'Waldo'],
  );
});

test('parser: najdluzsza znana nazwa wielowyrazowa wygrywa od lewej do prawej', () => {
  const known = new Set(['druzyna', 'druzyna pocztowa', 'fred']);
  assert.deepEqual(
    splitRecipients('Druzyna Pocztowa Fred, DRUZYNA Pocztowa Druzyna', known),
    ['Druzyna Pocztowa', 'Fred', 'DRUZYNA Pocztowa', 'Druzyna'],
  );
});

test('parser: niedopasowane wyrazy zostaja lokalnymi kandydatami advisory', () => {
  const known = new Set(['druzyna pocztowa', 'fred']);
  assert.deepEqual(
    unknownRecipients({ adresat: 'Druzyna Pocztowa Fred Corge Plugh i Corge', dw: 'Waldo' }, known),
    ['Corge', 'Plugh', 'i', 'Waldo'],
  );
});

test('parser: dwiescie roznych adresatow zachowuje kolejnosc i nie jest deduplikowane', () => {
  const names = Array.from({ length: 200 }, (_, index) =>
    String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26)));
  const known = new Set(names.map((name) => name.toLowerCase()));
  assert.deepEqual(splitRecipients(names.join(' '), known), names);
  assert.deepEqual(splitRecipients('Fred Fred,Fred', new Set(['fred'])), ['Fred', 'Fred', 'Fred']);
});

test('walidacja: komunikaty opisuja oba separatory i zakaz wolnego i', () => {
  const base = { adresat: 'Fred', temat: 'Temat', dw: '', tresc: 'Tresc' };
  assert.equal(
    validateCompose({ ...base, adresat: 'Fred i Grault' }),
    "Adresatow oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.",
  );
  assert.equal(
    validateCompose({ ...base, dw: 'Fred;Grault' }),
    "Adresatow DW oddziel przecinkami lub spacjami, bez spojnika 'i'. Dozwolone: litery a-z i A-Z.",
  );
  assert.equal(validateCompose({ ...base, adresat: 'Fred Grault,Corge' }), null);
});

async function startCaptured() {
  const renderModule = require('../src/arkmail/ui/render') as { mountMailUi: typeof mountMailUi };
  const original = renderModule.mountMailUi;
  let handlers: MailUiHandlers | undefined;
  let store: import('../src/arkmail/ui/store').MailUiStore | undefined;
  renderModule.mountMailUi = (container, currentStore, current) => {
    handlers = current;
    store = currentStore;
    return original(container, currentStore, current);
  };
  const h = await startHarness();
  return { h, handlers: handlers!, store: store!, restore: async () => {
    renderModule.mountMailUi = original;
    await stopHarness();
  } };
}

test('transport: reczny adresat i DW trafiaja do gry bajtowo bez zmian', async () => {
  const { h, handlers, restore } = await startCaptured();
  const adresat = '  Fred,  Grault Fred, Fred  ';
  const dw = '  Corge  Plugh,Corge  ';
  try {
    handlers.onSendCompose({ adresat, temat: 'Temat', dw, tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.length >= 2, 'pierwsze komendy compose');
    assert.equal(h.f.sent[0], 'napisz list');
    assert.equal(h.f.sent[1], adresat, 'bez trim, zmiany separatorow, kolejnosci i deduplikacji');
    h.f.fire('Adresat: Temat: DW: ', 'mail');
    await h.waitFor(() => h.f.sent.includes('Temat'), 'temat');
    await h.waitFor(() => h.f.sent.some((line) => line.includes('Corge')), 'DW');
    assert.equal(h.f.sent[h.f.sent.length - 1], dw, 'puste DW nadal jest osobnym przypadkiem');
  } finally {
    await restore();
  }
});

test('transport: dokladna nazwa lokalnej grupy w adresacie rozwija sie kanonicznie', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSavePeople!(['A', 'B', 'C', 'D']);
    handlers.onSaveGroups!([{ name: 'PatrolTest', members: ['A', 'B', 'C', 'D'] }]);
    handlers.onSendCompose({ adresat: 'patroltest', temat: 'Temat', dw: '', tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.length >= 2, 'start compose z grupa');
    assert.equal(h.f.sent[0], 'napisz list');
    assert.equal(h.f.sent[1], 'A, B, C, D');
  } finally {
    await restore();
  }
});

test('transport: dokladna nazwa lokalnej grupy w DW rozwija sie kanonicznie', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSavePeople!(['Fred', 'A', 'B', 'C', 'D']);
    handlers.onSaveGroups!([{ name: 'PatrolTest', members: ['A', 'B', 'C', 'D'] }]);
    handlers.onSendCompose({ adresat: 'Fred', temat: 'Temat', dw: 'PatrolTest', tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.length >= 2, 'start compose z grupa DW');
    h.f.fire('Adresat: Temat: DW: ', 'mail');
    await h.waitFor(() => h.f.sent.length >= 4, 'komenda DW z grupa');
    assert.equal(h.f.sent[3], 'A, B, C, D');
  } finally {
    await restore();
  }
});

test('transport: grupa kolidujaca z aliasem nie jest rozwijana', async () => {
  const { h, handlers, store, restore } = await startCaptured();
  try {
    handlers.onSavePeople!(['A', 'B']);
    handlers.onSaveGroups!([{ name: 'PatrolTest', members: ['A', 'B'] }]);
    store.setImportedAliases([{ name: 'patroltest', targets: ['C'] }]);
    handlers.onSendCompose({ adresat: 'PatrolTest', temat: 'Temat', dw: '', tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.length >= 2, 'start compose z aliasem');
    assert.equal(h.f.sent[1], 'PatrolTest');
  } finally {
    await restore();
  }
});

test('transport: DW z samych odstepow pozostaje pominiete', async () => {
  const { h, handlers, restore } = await startCaptured();
  try {
    handlers.onSendCompose({ adresat: 'Fred', temat: 'Temat', dw: '   ', tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.length >= 2, 'start compose');
    h.f.fire('Adresat: Temat: DW: ', 'mail');
    await h.waitFor(() => h.f.sent.includes(''), 'puste DW');
    h.f.fire('Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.', 'editor.mail');
    await h.waitFor(() => h.f.sent.includes('**'), 'koniec bez DW');
    assert.ok(!h.f.sent.includes('   '));
  } finally {
    await restore();
  }
});

const RECIPIENT_FORMS = ['A B C D', 'A, B, C, D', 'A,B,C,D'];
const SINGLE_KNOWN = new Set(['a', 'b', 'c', 'd']);

async function waitForCommands(transport: MockTransport, count: number): Promise<void> {
  for (let i = 0; i < 10 && transport.sent.length < count; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(transport.sent.length >= count, `oczekiwano ${count} komend, jest ${transport.sent.length}`);
}

test('parser: trzy potwierdzone formy i oba pola daja cztery znane osoby bez advisory', () => {
  for (const form of RECIPIENT_FORMS) {
    assert.deepEqual(splitRecipients(form, SINGLE_KNOWN), ['A', 'B', 'C', 'D']);
    assert.deepEqual(unknownRecipients({ adresat: form, dw: '' }, SINGLE_KNOWN), []);
    assert.deepEqual(unknownRecipients({ adresat: '', dw: form }, SINGLE_KNOWN), []);
  }
  assert.deepEqual(splitRecipients('A B', SINGLE_KNOWN), splitRecipients('A, B', SINGLE_KNOWN));
  assert.deepEqual(splitRecipients('  A,  B,, C   D  ', SINGLE_KNOWN), ['A', 'B', 'C', 'D']);
  assert.deepEqual(splitRecipients('', SINGLE_KNOWN), []);
});

test('parser: mieszana nazwa wielowyrazowa i powtorzenia nie daja falszywego advisory', () => {
  const known = new Set(['a', 'b c', 'd']);
  assert.deepEqual(splitRecipients('A B C D', known), ['A', 'B C', 'D']);
  assert.deepEqual(unknownRecipients({ adresat: 'A B C D', dw: '' }, known), []);
  assert.deepEqual(unknownRecipients({ adresat: 'A A B C, X, Y', dw: '' }, known), ['X', 'Y']);
  assert.deepEqual(unknownRecipients({ adresat: 'A, B C,D', dw: '' }, known), []);
  for (const form of ['X A B', 'A X B', 'A B X']) {
    assert.deepEqual(unknownRecipients({ adresat: form, dw: '' }, new Set(['a', 'b'])), ['X']);
    assert.deepEqual(unknownRecipients({ adresat: '', dw: form }, new Set(['a', 'b'])), ['X']);
  }
});

test('parser: dwiescie powtorzen i dwiescie roznych znanych nazw nie maja advisory', () => {
  const names = Array.from({ length: 200 }, (_, index) =>
    String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26)));
  const known = new Set([...names, 'A'].map((name) => name.toLowerCase()));
  const repeated = Array.from({ length: 200 }, () => 'A').join(' ');
  assert.equal(splitRecipients(repeated, known).length, 200);
  assert.deepEqual(unknownRecipients({ adresat: repeated, dw: '' }, known), []);
  assert.deepEqual(unknownRecipients({ adresat: names.join(' '), dw: '' }, known), []);
});

test('editor: kazda surowa forma i duza lista pozostaja identyczne przy bledzie adresata', async () => {
  const names = Array.from({ length: 200 }, (_, index) =>
    String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26)));
  const forms = [...RECIPIENT_FORMS, Array.from({ length: 200 }, () => 'A').join(' '), names.join(' ')];
  for (const raw of forms) {
    const transport = new MockTransport();
    const editor = new EditorSession(transport, { timeoutMs: 1000 });
    const operation = editor.send({ adresat: raw, temat: 'Temat', linie: ['Tresc'] });
    await waitForCommands(transport, 2);
    transport.emit({ text: 'Adresat: Nie ma takiego adresata (gracza, aliasu): X.', cls: 'mail' });
    const outcome = await operation;
    assert.deepEqual(outcome, { result: 'blad', error: { kind: 'brak-adresata', adresat: 'X' } });
    assert.deepEqual(transport.sent, ['napisz list', raw], 'zero normalizacji, tematu, tresci, ** i ~q');
  }
});

test('editor: pelny opis x i x pozostaje nieprzetwarzany przy obu pozycjach', async () => {
  for (const raw of ['A B X X', 'X X A B C']) {
    const transport = new MockTransport();
    const editor = new EditorSession(transport, { timeoutMs: 1000 });
    const operation = editor.send({ adresat: raw, temat: 'Temat', linie: ['Tresc'] });
    await waitForCommands(transport, 2);
    transport.emit({ text: 'Adresat: Nie ma takiego adresata (gracza, aliasu): x i x.', cls: 'mail' });
    const outcome = await operation;
    assert.deepEqual(outcome, { result: 'blad', error: { kind: 'brak-adresata', adresat: 'x i x' } });
    assert.deepEqual(transport.sent, ['napisz list', raw]);
  }
});

test('editor: anulowanie poprawnych par konczy sie bez kontynuacji i umozliwia ponowienie', async () => {
  for (const raw of RECIPIENT_FORMS) {
    const transport = new MockTransport();
    const editor = new EditorSession(transport, { timeoutMs: 1000 });
    const operation = editor.send({ adresat: raw, temat: 'Temat', linie: ['Tresc'] });
    await waitForCommands(transport, 2);
    transport.emit({ text: 'Temat: ', cls: 'mail' });
    for (let i = 0; i < 10 && !transport.sent.includes('Temat'); i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    transport.emit({ text: 'Zaniechane.', cls: 'mail' });
    assert.deepEqual(await operation, { result: 'zaniechany' });
    assert.deepEqual(transport.sent, ['napisz list', raw, 'Temat']);
    assert.ok(!transport.sent.includes('Tresc') && !transport.sent.includes('**') && !transport.sent.includes('~q'));

    const commandCount = transport.sent.length;
    const retry = editor.send({ adresat: raw, temat: 'Temat', linie: ['Tresc'] });
    await waitForCommands(transport, commandCount + 2);
    transport.emit({ text: 'Zaniechane.', cls: 'mail' });
    assert.deepEqual(await retry, { result: 'zaniechany' });
    assert.deepEqual(transport.sent.slice(-2), ['napisz list', raw]);
  }
});

test('handler: x i x ma pelny toast, szkic zostaje i ponowienie dziala natychmiast', async () => {
  const { h, handlers, restore } = await startCaptured();
  const raw = 'A B X X';
  try {
    (h.content.querySelector('[data-tab="napisz"]') as HTMLElement).click();
    const initial = h.content.querySelector('[data-field="adresat"]') as HTMLInputElement;
    initial.value = raw;
    initial.dispatchEvent(new h.window.Event('input') as unknown as Event);
    handlers.onSendCompose({ adresat: raw, temat: 'Temat', dw: '', tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.length === 2, 'start compose');
    h.f.fire('Adresat: Nie ma takiego adresata (gracza, aliasu): x i x.', 'mail');
    await h.waitFor(() => notifyText(h.f, 'Nie ma takiego adresata: x i x.'), 'pelny opis');
    assert.deepEqual(h.f.sent, ['napisz list', raw]);
    const field = h.content.querySelector('[data-field="adresat"]') as HTMLInputElement;
    assert.equal(field.value, raw);
    handlers.onSendCompose({ adresat: raw, temat: 'Temat', dw: '', tresc: 'Tresc', linie: ['Tresc'] });
    await h.waitFor(() => h.f.sent.filter((line) => line === 'napisz list').length === 2, 'natychmiastowe ponowienie');
    assert.ok(!h.f.sent.includes('~q'));
  } finally {
    await restore();
  }
});
