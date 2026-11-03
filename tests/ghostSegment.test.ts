/**
 * Fala UI-2 krok 4: ghost w trybie segmentu dla pol wieloodbiorczych
 * (adresat/DW). Podpowiedz dziala po ostatnim przecinku; akceptacja
 * grupy z ksiazki adresowej WSTAWIA ROZWINIETA liste czlonkow
 * (Arkadia nie zna grup pluginu - w polu musza stanac imiona), nigdy
 * samej nazwy grupy. Alias pocztowy zostaje jednym tokenem. Imiona
 * syntetyczne (Fred, Grault, Corge).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

const contact = (name: string): Contact => ({
  name,
  sources: ['korespondencja'],
  lettersReceived: 1,
  lettersSent: 0,
});

function mount(store: MailUiStore) {
  const container = document.createElement('div');
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

const input = (container: unknown, selector: string): HTMLInputElement =>
  (container as { querySelector(s: string): unknown }).querySelector(selector) as HTMLInputElement;

const type = (el: HTMLInputElement, value: string): void => {
  el.value = value;
  el.selectionStart = value.length;
  el.selectionEnd = value.length;
  el.dispatchEvent(new window.Event('input') as unknown as Event);
};

const key = (el: HTMLInputElement, k: string): void => {
  el.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: k, cancelable: true }) as unknown as Event,
  );
};

const ghostRest = (container: unknown, sel: string): string => {
  const wrap = input(container, sel).closest('.arkmail-ghost-wrap');
  const rest = wrap?.querySelector('.arkmail-ghost-rest') as { textContent?: string } | null;
  const ghost = wrap?.querySelector('.arkmail-ghost') as { style?: { display: string } } | null;
  if (!ghost || ghost.style?.display === 'none') return '';
  return rest?.textContent ?? '';
};

test('segment: podpowiedz po ostatnim przecinku, kanoniczna forma', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Fred'), contact('Grault')]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'fred, gr');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), 'ault', 'Grault dopelniany w segmencie');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'fred, Grault', 'tylko segment zamieniony na kanoniczna forme');
});

test('segment: grupa rozwija sie do listy czlonkow, nigdy do nazwy', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Fred')]);
  s.setGroups([{ name: 'Gildia', members: ['Fred', 'Grault'] }]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'gil');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), 'dia', 'grupa jako kandydat');
  key(el, 'ArrowRight');
  assert.equal(
    el.value,
    'Fred, Grault',
    'akceptacja grupy wstawia czlonkow po przecinku',
  );
  assert.ok(!el.value.includes('Gildia'), 'nazwa grupy nigdy nie wchodzi do pola');
});

test('segment: grupa po istniejacym odbiorcy dopisuje czlonkow', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setGroups([
    { name: 'Gildia', members: ['Fred', 'Grault'] },
    { name: 'Patrol', members: ['Corge'] },
  ]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'Fred, pat');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'Fred, Corge', 'Patrol rozwiniety po przecinku');
});

test('segment: alias pocztowy zostaje jednym tokenem', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setImportedAliases([{ name: 'zgromadzenie', targets: ['Fred'] }]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'Fred, zgr');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), 'omadzenie');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'Fred, zgromadzenie', 'alias bez rozwijania czlonkow');
});

test('segment: pole DW tez pracuje na segmentach', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Fred'), contact('Grault')]);
  const c = mount(s);
  const el = input(c, '[data-field="dw"]');
  type(el, 'fred, gr');
  assert.equal(ghostRest(c, '[data-field="dw"]'), 'ault');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'fred, Grault');
});

test('segment: pusty segment po przecinku nie podpowiada', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Fred')]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'Fred, ');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '', 'pusty segment = cisza');
});

test('segment: grupa pusta (bez czlonkow) nie jest kandydatem', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setGroups([{ name: 'Pusta', members: [] }]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'pus');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '');
});
