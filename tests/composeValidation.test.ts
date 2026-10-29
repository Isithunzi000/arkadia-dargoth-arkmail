/**
 * Walidacja compose przed zapisem do kolejki (Fala 15b).
 *
 * Stan sprzed: send-handler blokowal tylko PUSTA TRESC; adresat i temat
 * lecialy surowo na serwer. Pusty temat = pusta linia w rozmowie
 * compose, a ewentualny re-prompt "Temat:" konczyl sie cisza do
 * watchdog-timeoutu (editor.ts nie lapie powrotu etapu). Wiki Poczta:
 * temat jest wymagany ("musimy napisac temat"), adresat tez ("musimy
 * podac przynajmniej jednego adresata").
 *
 * Kontrakt:
 *  - pusty adresat -> TWARDa blokada: przycisk pokazuje "Podaj
 *    adresata." (3 s), zadne klikniecie nie wysyla;
 *  - pusty temat -> TWARDa blokada "Podaj temat." (3 s) jak adresat
 *    (Fala 28g): serwer pustego tematu nie przyjmuje, a handler w
 *    index.ts i tak odrzucal go toastem - miekki dwuklik z Fali 15b
 *    obiecywal wysylke, ktora nigdy nie nastepowala. Pusty temat nie
 *    moze wyjsc z pluginu, kropka;
 *  - wypelnione adresat+temat+tresc -> wysylka za pierwszym klikiem.
 *
 * Fala 16d (zgloszenie 2026-10-19 pkt 4): pusta tresc tez ma TWARDa
 * blokade z komunikatem na przycisku ("Brak tresci listu.", 3 s) -
 * cichy return z Fali 15b zostawial gracza bez informacji, dlaczego
 * klikniecie nic nie daje.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { notifyText, startHarness, stopHarness, waitRt } from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: { name: string; args: unknown[] }[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push({ name, args });
  const off = mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('del'),
    onForwardLetter: rec('fwd'),
  } as unknown as MailUiHandlers);
  return { container, calls, off };
}

const clickEl = (el: unknown) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new window.Event('click') as unknown as Event,
  );

/** Ustawia wartosc pola compose (handler czyta value wprost z DOM). */
const setField = (container: unknown, name: string, value: string): void => {
  const el = (container as { querySelector(s: string): unknown }).querySelector(
    `[data-field="${name}"]`,
  ) as { value: string } | null;
  assert.ok(el, `pole ${name} istnieje`);
  el.value = value;
};

const fieldValue = (container: unknown, name: string): string =>
  ((container as { querySelector(s: string): unknown }).querySelector(
    `[data-field="${name}"]`,
  ) as { value: string } | null)?.value ?? '(brak pola)';

const sendBtn = (container: unknown) =>
  (container as { querySelector(s: string): unknown }).querySelector(
    '.arkmail-send',
  ) as { textContent: string };

const sends = (calls: { name: string; args: unknown[] }[]) =>
  calls.filter((c) => c.name === 'send');

test('ui: pusty adresat blokuje wyslanie twardo (zadne klikniecie nie wysyla)', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'temat', 'Perly');
  setField(container, 'tresc', 'czesc');
  const send = sendBtn(container);
  clickEl(send);
  assert.equal(sends(calls).length, 0, 'pierwszy klik nie wysyla');
  assert.equal(send.textContent, 'Podaj adresata.', 'podpowiedz na przycisku');
  clickEl(send);
  assert.equal(sends(calls).length, 0, 'drugi klik tez nie wysyla (twarda blokada)');
  off();
});

test('ui: pusty temat blokuje wyslanie twardo (zadne klikniecie nie wysyla)', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'adresat', 'Foo');
  setField(container, 'tresc', 'czesc');
  const send = sendBtn(container);
  clickEl(send);
  assert.equal(sends(calls).length, 0, 'pierwszy klik nie wysyla');
  assert.equal(send.textContent, 'Podaj temat.', 'komunikat na przycisku');
  clickEl(send);
  assert.equal(sends(calls).length, 0, 'drugi klik tez nie wysyla (twarda blokada)');
  assert.equal(send.textContent, 'Podaj temat.', 'blokada bez dwukliku');
  off();
});

test('ui: blokada pustego tematu wygasa po 3 s, po wpisaniu tematu wysyla', async () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'adresat', 'Foo');
  setField(container, 'tresc', 'czesc');
  const send = sendBtn(container);
  clickEl(send);
  assert.equal(send.textContent, 'Podaj temat.', 'zablokowany');
  await waitRt(() => send.textContent === 'Zapisz w niewyslanych', 'etykieta wrocila');
  setField(container, 'temat', 'Perly');
  clickEl(send);
  assert.equal(sends(calls).length, 1, 'po wpisaniu tematu wysylka dziala');
  off();
});

test('ui: wypelnione adresat+temat+tresc wysylaja za pierwszym klikiem', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'adresat', 'Foo');
  setField(container, 'temat', 'Perly');
  setField(container, 'tresc', 'czesc');
  clickEl(sendBtn(container));
  assert.equal(sends(calls).length, 1, 'brak uzbrajania przy pelnym formularzu');
  off();
});

test('ui: pusta tresc blokuje wyslanie twardo z komunikatem na przycisku', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'adresat', 'Foo');
  setField(container, 'temat', 'Perly');
  const send = sendBtn(container);
  clickEl(send);
  assert.equal(sends(calls).length, 0, 'pusta tresc nie wysyla');
  assert.equal(send.textContent, 'Brak tresci listu.', 'komunikat na przycisku');
  clickEl(send);
  assert.equal(sends(calls).length, 0, 'drugi klik tez nie wysyla (twarda blokada)');
  assert.equal(send.textContent, 'Brak tresci listu.', 'blokada nie uzbraja dwukliku');
  off();
});

test('ui: blokada pustej tresci wygasa po 3 s', async () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'adresat', 'Foo');
  setField(container, 'temat', 'Perly');
  const send = sendBtn(container);
  clickEl(send);
  assert.equal(send.textContent, 'Brak tresci listu.', 'zablokowany');
  await waitRt(() => send.textContent === 'Zapisz w niewyslanych', 'etykieta wrocila');
  setField(container, 'tresc', 'czesc');
  clickEl(send);
  assert.equal(sends(calls).length, 1, 'po wpisaniu tresci zapis dziala');
  off();
});

const fillValid = (container: unknown): void => {
  setField(container, 'adresat', 'Foo');
  setField(container, 'temat', 'Perly');
  setField(container, 'tresc', 'czesc');
};

test('ui: wielu adresatow i wiele DW przechodzi bez zmiany tekstu', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setTab('napisz');
  setField(container, 'adresat', 'Foo, Bar Corge');
  setField(container, 'temat', 'Perly');
  setField(container, 'dw', 'Waldo,Baz Grault');
  setField(container, 'tresc', 'czesc');
  clickEl(sendBtn(container));
  assert.equal(sends(calls).length, 1, 'poprawne listy odbiorcow nie sa blokowane');
  const input = sends(calls)[0].args[0] as {
    adresat: string;
    dw: string;
    tresc?: string;
  };
  assert.equal(input.adresat, 'Foo, Bar Corge');
  assert.equal(input.dw, 'Waldo,Baz Grault');
  assert.equal(input.tresc, 'czesc', 'handler dostaje zrodlowa tresc do ponownej walidacji');
  off();
});

test('ui: adresat odrzuca znaki spoza a-zA-Z i puste elementy listy', () => {
  const invalid = ['Foo1', 'Foo;', 'Foo#', 'Foo-Bar', 'Żoo', '\tFoo', 'Foo\tBar', 'Foo,', ',Foo', 'Foo,,Bar', 'Foo, ,Bar'];
  for (const adresat of invalid) {
    const s = new MailUiStore();
    const { container, calls, off } = mount(s);
    s.setTab('napisz');
    fillValid(container);
    setField(container, 'adresat', adresat);
    clickEl(sendBtn(container));
    assert.equal(sends(calls).length, 0, `adresat odrzucony: ${JSON.stringify(adresat)}`);
    assert.equal(sendBtn(container).textContent, 'Adresat: tylko litery a-zA-Z, przecinki i spacje.');
    assert.equal(
      fieldValue(container, 'adresat'),
      adresat,
      'tekst pozostaje do poprawienia przez uzytkownika',
    );
    off();
  }
});

test('ui: DW odrzuca znaki spoza a-zA-Z i puste elementy listy', () => {
  const invalid = ['Bar2', 'Bar;', 'Bar#', 'Bar_Baz', 'Łuk', '\tBar', 'Bar\tBaz', 'Bar,', ',Bar', 'Bar,,Baz', 'Bar, ,Baz'];
  for (const dw of invalid) {
    const s = new MailUiStore();
    const { container, calls, off } = mount(s);
    s.setTab('napisz');
    fillValid(container);
    setField(container, 'dw', dw);
    clickEl(sendBtn(container));
    assert.equal(sends(calls).length, 0, `DW odrzucone: ${JSON.stringify(dw)}`);
    assert.equal(sendBtn(container).textContent, 'DW: tylko litery a-zA-Z, przecinki i spacje.');
    assert.equal(
      fieldValue(container, 'dw'),
      dw,
      'tekst pozostaje do poprawienia przez uzytkownika',
    );
    off();
  }
});

test('ui: temat odrzuca separatory komend bez ich usuwania', () => {
  for (const temat of ['Perly;raport', 'Perly#raport']) {
    const s = new MailUiStore();
    const { container, calls, off } = mount(s);
    s.setTab('napisz');
    fillValid(container);
    setField(container, 'temat', temat);
    clickEl(sendBtn(container));
    assert.equal(sends(calls).length, 0, `temat odrzucony: ${temat}`);
    assert.equal(sendBtn(container).textContent, 'Temat nie moze zawierac znakow ; ani #.');
    assert.equal(
      fieldValue(container, 'temat'),
      temat,
      'separator nie jest cicho usuwany',
    );
    off();
  }
});

test('ui: tresc odrzuca separatory komend bez ich usuwania', () => {
  for (const tresc of ['czesc;raport', 'czesc#raport']) {
    const s = new MailUiStore();
    const { container, calls, off } = mount(s);
    s.setTab('napisz');
    fillValid(container);
    setField(container, 'tresc', tresc);
    clickEl(sendBtn(container));
    assert.equal(sends(calls).length, 0, `tresc odrzucona: ${tresc}`);
    assert.equal(sendBtn(container).textContent, 'Tresc nie moze zawierac znakow ; ani #.');
    assert.equal(
      fieldValue(container, 'tresc'),
      tresc,
      'separator nie jest cicho usuwany',
    );
    off();
  }
});

test('ui: surowe biale znaki nie wysylaja pustego listu', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.setCompose({ template: 'raw' });
  s.setTab('napisz');
  fillValid(container);
  setField(container, 'tresc', '  \t\n   ');
  clickEl(sendBtn(container));
  assert.equal(sends(calls).length, 0, 'biale znaki w raw nie sa trescia');
  assert.equal(sendBtn(container).textContent, 'Brak tresci listu.');
  off();
});

test('handler: pomijanie formularza nie omija zadnej walidacji compose', async () => {
  const renderModule = require('../src/arkmail/ui/render') as {
    mountMailUi: typeof mountMailUi;
  };
  const originalMount = renderModule.mountMailUi;
  let captured: MailUiHandlers | null = null;
  renderModule.mountMailUi = (container, store, handlers) => {
    captured = handlers;
    return originalMount(container, store, handlers);
  };
  let h: Awaited<ReturnType<typeof startHarness>> | null = null;
  try {
    h = await startHarness();
    assert.ok(captured, 'przechwycono prawdziwy handler z index.ts');
    const cases: Array<{
      input: { adresat: string; temat: string; dw: string; tresc: string; linie: string[] };
      message: string;
    }> = [
      {
        input: { adresat: '', temat: 'Perly', dw: '', tresc: 'czesc', linie: ['czesc'] },
        message: 'Podaj adresata.',
      },
      {
        input: { adresat: 'Foo1', temat: 'Perly', dw: '', tresc: 'czesc', linie: ['czesc'] },
        message: 'Adresat: tylko litery a-zA-Z, przecinki i spacje.',
      },
      {
        input: { adresat: 'Foo\n', temat: 'Perly', dw: '', tresc: 'czesc', linie: ['czesc'] },
        message: 'Adresat: tylko litery a-zA-Z, przecinki i spacje.',
      },
      {
        input: { adresat: 'Foo', temat: '', dw: '', tresc: 'czesc', linie: ['czesc'] },
        message: 'Podaj temat.',
      },
      {
        input: { adresat: 'Foo', temat: 'Perly#raport', dw: '', tresc: 'czesc', linie: ['czesc'] },
        message: 'Temat nie moze zawierac znakow ; ani #.',
      },
      {
        input: { adresat: 'Foo', temat: 'Perly', dw: 'Bar,', tresc: 'czesc', linie: ['czesc'] },
        message: 'DW: tylko litery a-zA-Z, przecinki i spacje.',
      },
      {
        input: { adresat: 'Foo', temat: 'Perly', dw: 'Bar\n', tresc: 'czesc', linie: ['czesc'] },
        message: 'DW: tylko litery a-zA-Z, przecinki i spacje.',
      },
      {
        input: { adresat: 'Foo', temat: 'Perly', dw: '', tresc: 'czesc;raport', linie: ['czesc;raport'] },
        message: 'Tresc nie moze zawierac znakow ; ani #.',
      },
      {
        input: {
          adresat: 'Foo',
          temat: 'Perly',
          dw: '',
          tresc: '  \n\t ',
          linie: [' +-----+ ', ' |     | ', ' +-----+ '],
        },
        message: 'Brak tresci listu.',
      },
    ];
    for (const { input, message } of cases) {
      h.f.sent.length = 0;
      h.f.emitted.length = 0;
      (captured as unknown as MailUiHandlers).onSendCompose(input);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(h.f.sent, [], `handler nie wysyla: ${message}`);
      assert.ok(notifyText(h.f, message), `handler pokazuje: ${message}`);
    }
  } finally {
    renderModule.mountMailUi = originalMount;
    if (h) await stopHarness();
  }
});
