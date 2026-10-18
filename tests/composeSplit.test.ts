/**
 * Compose dwupanelowy w wide (Fala 11d): na szerokim ekranie formularz
 * z lewej, zywy podglad wysylanego listu z prawej (jak podglad /list
 * w kliencie). Na waskim bez zmian: podglad pod forma w jednym panelu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
  });
  return container;
}

const q = (c: unknown, sel: string): HTMLElement | null =>
  (c as { querySelector(s: string): unknown }).querySelector(sel) as HTMLElement | null;

test('compose wide: split - formularz z lewej, podglad z prawej', () => {
  const s = new MailUiStore({ tab: 'napisz', wide: true });
  const c = mount(s);
  const split = q(c, '.arkmail-split');
  assert.ok(split, 'jest podzial dwupanelowy');
  const form = q(split, '[data-pane-key="napisz"]');
  const podglad = q(split, '[data-pane-key="napisz:podglad"]');
  assert.ok(form, 'lewy panel to formularz');
  assert.ok(podglad, 'prawy panel to podglad');
  assert.ok(q(form!, '[data-field="adresat"]'), 'formularz ma pola');
  assert.ok(q(podglad!, '.arkmail-preview'), 'podglad ma pre');
});

test('compose wide: podglad zyje - wpisana tresc leci do prawego panelu', () => {
  const s = new MailUiStore({ tab: 'napisz', wide: true });
  const c = mount(s);
  const tresc = q(c, '[data-field="tresc"]') as HTMLTextAreaElement;
  tresc.value = 'Ala ma kota';
  tresc.dispatchEvent(new window.Event('input') as unknown as Event);
  const pre = q(c, '[data-pane-key="napisz:podglad"] .arkmail-preview');
  assert.ok(pre, 'podglad w prawym panelu');
  assert.match(pre!.textContent ?? '', /Ala ma kota/, 'zywy podglad tresci');
});

test('compose waski: bez zmian - podglad pod forma w jednym panelu', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const c = mount(s);
  assert.equal(q(c, '.arkmail-split'), null, 'bez podzialu');
  const form = q(c, '[data-pane-key="napisz"]');
  assert.ok(form, 'panel formularza');
  assert.ok(q(form!, '.arkmail-preview'), 'podglad w tym samym panelu');
});
