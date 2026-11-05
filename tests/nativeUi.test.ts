/**
 * Kontrakt natywnego UI klienta (zgloszenie 2026-11-05, F4c).
 * Zakladki: dialog-tabs/dialog-tab/is-active; sub-pigulki: dialog-tab;
 * pola tekstowe: popup-input popup-input--control. Wyglad, fokus,
 * placeholder i hover pilnuje arkusz klienta - plugin nie definiuje
 * wlasnych regul dla tych elementow (kontrakt CSS: uiStyles/contrast).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore, handlers: Partial<MailUiHandlers> = {}) {
  const container = document.createElement('div');
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      void name;
      void args;
    };
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
    ...handlers,
  });
  return { container, off };
}

const qa = (root: unknown, sel: string): Array<{ classList: { contains(s: string): boolean } }> =>
  Array.from((root as unknown as ParentNode).querySelectorAll(sel)) as unknown as Array<{
    classList: { contains(s: string): boolean };
  }>;

test('natywne UI: belka zakladek to dialog-tabs, kazda zakladka dialog-tab', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const bar = (container as unknown as ParentNode).querySelector('.arkmail-tabs');
  assert.ok(bar, 'belka zakladek istnieje');
  assert.ok(bar!.classList.contains('dialog-tabs'), 'belka ma klase dialog-tabs');
  const tabs = qa(container, '.arkmail-tab');
  assert.equal(tabs.length, 5, 'piec zakladek');
  for (const t of tabs) {
    assert.ok(t.classList.contains('dialog-tab'), 'zakladka ma klase dialog-tab');
    assert.ok(!t.classList.contains('arkmail-tab-active'), 'zero starej klasy tab-active');
  }
  off();
});

test('natywne UI: aktywna zakladka oznaczona is-active, tylko jedna', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const active = qa(container, '.arkmail-tab.is-active');
  assert.equal(active.length, 1, 'dokladnie jedna aktywna zakladka');
  off();
});

test('natywne UI: sub-pigulki kontaktow to dialog-tab z is-active', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container, off } = mount(s);
  const pills = qa(container, '.arkmail-subpill');
  assert.equal(pills.length, 4, 'cztery sub-pigulki');
  for (const p of pills) {
    assert.ok(p.classList.contains('dialog-tab'), 'sub-pigulka ma klase dialog-tab');
    assert.ok(!p.classList.contains('arkmail-box'), 'sub-pigulka bez klasy skrzynki');
  }
  const active = qa(container, '.arkmail-subpill.is-active');
  assert.equal(active.length, 1, 'dokladnie jedna aktywna sub-pigulka');
  off();
});

test('natywne UI: pola tekstowe maja klasy popup-input--control', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(s);
  const fields = [
    ...qa(container, 'input'),
    ...qa(container, 'textarea'),
    ...qa(container, 'select'),
  ];
  assert.ok(fields.length > 0, 'formularz compose ma pola');
  for (const f of fields) {
    assert.ok(f.classList.contains('popup-input'), 'pole ma klase popup-input');
    assert.ok(f.classList.contains('popup-input--control'), 'pole ma klase popup-input--control');
  }
  off();
});

test('natywne UI: filtry ksiazki i archiwum tez na natywnych polach', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container, off } = mount(s);
  const bookFilter = (container as unknown as ParentNode).querySelector("[data-book-filter]");
  assert.ok(bookFilter, 'filtr ksiazki istnieje');
  assert.ok(bookFilter!.classList.contains('popup-input--control'), 'filtr ksiazki: klasa natywna');
  const s2 = new MailUiStore({ tab: 'archiwum' });
  const { container: c2, off: off2 } = mount(s2);
  const skr = (c2 as unknown as ParentNode).querySelector("[data-filter='skrzynka']");
  assert.ok(skr, 'wybor skrzynki w archiwum istnieje');
  assert.ok(skr!.classList.contains('popup-input--control'), 'wybor skrzynki: klasa natywna');
  off();
  off2();
});

test('natywne UI: checkboxy bez klas pol tekstowych', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const checks = qa(container, "input[type='checkbox'].arkmail-notify-toggle");
  assert.equal(checks.length, 1, 'przelacznik powiadomien istnieje');
  for (const c of checks) {
    assert.ok(!c.classList.contains('popup-input'), 'checkbox bez klasy popup-input');
  }
  off();
});
