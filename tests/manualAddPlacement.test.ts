/**
 * Reczne dodawanie mieszka we wlasciwych sekcjach (wydanie 1.30.1,
 * Etap 4) - piny regresji na zgloszenia 4 i 5: pole nowej osoby
 * (data-book-new) w Ksiazce adresowej, pole nowej grupy (data-group-add)
 * w Grupach. Pigulka Import i eksport zostaje z czystym importem/eksportem.
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

const text = (el: unknown): string => (el as { textContent?: string })?.textContent ?? '';

const click = (el: unknown): void => (el as { click(): void }).click();

const qa = (container: unknown, selector: string): unknown[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector),
  );

const switchSubByLabel = (container: unknown, label: string): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if (text(pill) === label) {
      click(pill);
      return;
    }
  }
  throw new Error(`brak pigulki: ${label}`);
};

test('umiejscowienie: Ksiazka adresowa ma pole recznego dodawania osoby', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const container = mount(s);
  assert.ok(q(container, '[data-book-new]'), 'data-book-new w Ksiazce (domyslny sub)');
  assert.ok(q(container, '[data-book-add]'), 'klawisz Dodaj obok pola');
});

test('umiejscowienie: Grupy maja pole tworzenia nowej grupy', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const container = mount(s);
  switchSubByLabel(container, 'Grupy');
  assert.ok(q(container, '[data-group-add]'), 'data-group-add w Grupach');
  assert.ok(q(container, '[data-group-create]'), 'klawisz Utworz grupe obok pola');
});

test('umiejscowienie: Import i eksport bez pol recznego dodawania', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const container = mount(s);
  switchSubByLabel(container, 'Import i eksport');
  assert.equal(q(container, '[data-book-new]'), null, 'Import i eksport bez data-book-new');
  assert.equal(q(container, '[data-group-add]'), null, 'Import i eksport bez data-group-add');
  // Import/eksport zostaje na miejscu.
  assert.ok(q(container, '[data-import]'), 'przyciski importu zostaja');
});
