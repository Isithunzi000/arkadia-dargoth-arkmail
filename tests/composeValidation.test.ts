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
import { waitRt } from './harness';

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
