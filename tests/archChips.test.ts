/**
 * Archiwum na chipsy (wydanie 1.30.1, Etap 5) - piny regresji na
 * zgloszenie 6: zamiast panelu "Osoby z listow" zlozonego jedno nad
 * drugim z lista listow, Archiwum ma dwa chipsy (dialog-tab) jak
 * Kontakty: "Archiwum listow" (domyslnie) i "Osoby z listow".
 * Przelacznik [data-arch-people-toggle] znika - role przejmuje chips.
 * Skok z osoby ("Odebrane") wraca na chips listy, stawia filtr osoby
 * i przewija liste wynikow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';

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

const q = (container: unknown, selector: string): unknown =>
  (container as { querySelector(s: string): unknown }).querySelector(selector);

const qa = (container: unknown, selector: string): unknown[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector),
  );

const text = (el: unknown): string => (el as { textContent?: string })?.textContent ?? '';

const click = (el: unknown): void => (el as { click(): void }).click();

const chip = (container: unknown, label: string): unknown =>
  qa(container, '.arkmail-subpill').find((p) => text(p) === label);

const contact = (over: Partial<Contact>): Contact => ({
  name: 'Corge',
  sources: ['korespondencja'],
  lettersReceived: 2,
  lettersSent: 1,
  ...over,
});

test('archiwum: chipsy Archiwum listow/Osoby z listow, domyslnie listy', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const container = mount(s);
  const chips = qa(container, '.arkmail-subpill');
  assert.deepEqual(
    chips.map(text),
    ['Archiwum listow', 'Osoby z listow'],
    'dwa chipsy w ustalonej kolejnosci',
  );
  assert.equal(
    qa(container, '.arkmail-subpill.is-active').length,
    1,
    'dokladnie jeden chips aktywny',
  );
  assert.equal(text(qa(container, '.arkmail-subpill.is-active')[0]), 'Archiwum listow');
  assert.ok(q(container, '.arkmail-arch-list'), 'lista listow widoczna');
  assert.equal(q(container, '[data-arch-people]'), null, 'panel osob nie malowany');
  assert.equal(q(container, '[data-arch-people-toggle]'), null, 'toggle zniknal');
});

test('archiwum: chips Osoby z listow przełącza widok', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const container = mount(s);
  click(chip(container, 'Osoby z listow'));
  assert.equal(text(qa(container, '.arkmail-subpill.is-active')[0]), 'Osoby z listow');
  assert.ok(q(container, '[data-arch-people]'), 'panel osob widoczny');
  assert.ok(q(container, '[data-filter="kontakty"]'), 'filtr osob widoczny');
  assert.equal(q(container, '.arkmail-arch-list'), null, 'lista listow nie malowana');
});

test('archiwum: skok z osoby wraca na chips listy z filtrem osoby', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({ name: 'Waldo', lettersReceived: 1, lettersSent: 0 })]);
  s.setArchive([
    {
      id: 'a1',
      box: 'odebrane',
      number: 1,
      party: 'Waldo',
      subject: 'Spotkanie',
      dateRaw: '2026-10-01 10:00:00',
      sortKey: '2026-10-01 10:00:00',
      read: true,
      body: [],
    },
  ]);
  const container = mount(s);
  click(chip(container, 'Osoby z listow'));
  click(q(container, '[data-dir="odebrane"]'));
  assert.equal(text(qa(container, '.arkmail-subpill.is-active')[0]), 'Archiwum listow');
  assert.ok(q(container, '.arkmail-arch-list'), 'lista listow widoczna po skoku');
  const osoba = q(container, '[data-filter="osoba"]') as HTMLInputElement;
  assert.equal(osoba.value, 'Waldo', 'filtr osoby postawiony');
  assert.match(text(q(container, '.arkmail-arch-list')), /Spotkanie/, 'wynik filtra na liscie');
});
