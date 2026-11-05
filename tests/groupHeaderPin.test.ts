/**
 * Zgloszenie 2026-11-05 (Etap 8): naglowek sekcji Grupy stoi na stale
 * jak w Ksiazce - panel w trybie kolumnowym (.arkmail-listy), scrolluje
 * sie wylacznie kontener listy (.arkmail-list-scroll z wlasnym
 * data-pane-key, zapamietywanie pozycji scrolla per sekcja).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore): { container: HTMLElement; calls: unknown } {
  const container = document.createElement('div');
  const calls = {};
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
  } as never);
  return { container: container as unknown as HTMLElement, calls };
}

const q = (root: unknown, selector: string): unknown =>
  (root as { querySelector(s: string): unknown }).querySelector(selector);
const qa = (root: unknown, selector: string): unknown[] =>
  Array.from((root as { querySelectorAll(s: string): unknown[] }).querySelectorAll(selector));
const click = (el: unknown): void => (el as { click(): void }).click();

const switchToGrupy = (container: unknown): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if ((pill as { textContent?: string }).textContent === 'Grupy') {
      click(pill);
      return;
    }
  }
  assert.fail('brak sub-pigulki Grupy');
};

test('grupy: panel w trybie kolumnowym z przypietym naglowkiem', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setGroups([{ name: 'Gildia', members: ['Fred'] }]);
  const { container } = mount(store);
  switchToGrupy(container);

  const pane = q(container, '[data-pane-key="kontakty"]');
  assert.ok(pane, 'panel kontakty istnieje');
  assert.ok(
    (pane as { className?: string }).className?.includes('arkmail-listy'),
    'panel Grupy ma klase kolumnowa arkmail-listy',
  );
  // Naglowek (tworzenie grupy + filtr) to bezposrednie dzieci panelu -
  // stoja nad scrollowalnym kontenerem.
  const addRow = q(pane, '.arkmail-group-add');
  assert.ok(addRow, 'wiersz tworzenia grupy istnieje');
  assert.ok(
    (addRow as { parentElement?: { getAttribute(n: string): string | null } }).parentElement
      ?.getAttribute('data-pane-key') === 'kontakty',
    'wiersz tworzenia grupy jest bezposrednim dzieckiem panelu',
  );
  const filterRow = q(pane, '.arkmail-group-filter');
  assert.ok(filterRow, 'wiersz filtra grup istnieje');
  assert.ok(
    (filterRow as { parentElement?: { getAttribute(n: string): string | null } }).parentElement
      ?.getAttribute('data-pane-key') === 'kontakty',
    'wiersz filtra grup jest bezposrednim dzieckiem panelu',
  );
});

test('grupy: lista grup w scrollowalnym kontenerze z wlasnym pane-key', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setGroups([
    { name: 'Gildia', members: ['Fred'] },
    { name: 'Rada', members: [] },
  ]);
  const { container } = mount(store);
  switchToGrupy(container);

  const scroll = q(container, '.arkmail-list-scroll[data-pane-key="kontakty:grupy"]');
  assert.ok(scroll, 'kontener listy grup z pane-key kontakty:grupy istnieje');
  const toggles = qa(scroll, '[data-group-toggle]');
  assert.equal(toggles.length, 2, 'oba wiersze grup mieszkaja w kontenerze scrolla');
  // Kontener jest podpiety do drzewa panelu.
  assert.ok(
    (scroll as { parentElement?: { getAttribute(n: string): string | null } }).parentElement
      ?.getAttribute('data-pane-key') === 'kontakty',
    'kontener scrolla jest dzieckiem panelu kontakty',
  );
});
