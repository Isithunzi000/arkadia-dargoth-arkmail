/**
 * Wydanie 1.30.2 (Etap 2): ghost-podpowiedzi w polu "Dodaj osobe" w
 * sekcji Grupy. Regresja A2: attachGhost wywolywany PRZED podpięciem
 * inputu do rodzica - wrap z ghostem zostawal odlaczony od drzewa i
 * podpowiedzi (strzalka w prawo) nie dzialaly. Kontrakt: wrap
 * .arkmail-ghost-wrap mieszka wewnatrz .arkmail-group-members i zawiera
 * input [data-member-add].
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
  } as unknown as Parameters<typeof mountMailUi>[2]);
  return container;
}

const q = (container: unknown, selector: string): unknown =>
  (container as { querySelector(s: string): unknown }).querySelector(selector);
const qa = (container: unknown, selector: string): unknown[] =>
  Array.from((container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector));
const click = (el: unknown): void => (el as { click(): void }).click();

/** Klik w sub-pigulke sekcji Kontaktow po etykiecie. */
const switchSub = (container: unknown, label: string): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if ((pill as { textContent?: string }).textContent === label) {
      click(pill);
      return;
    }
  }
  assert.fail(`brak sub-pigulki: ${label}`);
};

test('grupy: pole "Dodaj osobe" ma dzialajacy wrap ghosta w liscie czlonkow', () => {
  const store = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred'] }],
    people: ['Fred', 'Corge'],
  });
  const container = mount(store);
  switchSub(container, 'Grupy');
  click(q(container, '[data-group-toggle]'));
  const wrap = q(container, '.arkmail-group-members .arkmail-ghost-wrap');
  assert.ok(wrap, 'wrap ghosta wewnatrz .arkmail-group-members');
  const input = q(wrap, '[data-member-add]');
  assert.ok(input, 'input dodawania czlonka zyje w wrapie (ghost podpiety)');
});

test('grupy: wrap ghosta nie jest osierocony poza drzewem', () => {
  const store = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
  const container = mount(store);
  switchSub(container, 'Grupy');
  click(q(container, '[data-group-toggle]'));
  // Osierocony wrap (bug A2): input w drzewie, wrap z ghostem poza nim.
  const wrap = q(container, '.arkmail-group-members .arkmail-ghost-wrap') as unknown;
  assert.ok(wrap, 'wrap istnieje w .arkmail-group-members');
  assert.ok(
    (container as { contains(n: unknown): boolean }).contains(wrap),
    'wrap jest podpiety do drzewa kontenera, nie wezlem odlaczonym',
  );
  assert.ok(
    q(wrap, '.arkmail-ghost'),
    'wrap zawiera element ghosta (podpowiedz renderowalna)',
  );
});
