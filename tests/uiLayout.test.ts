/** Uklad listu i compose: logiczne grupy akcji oraz responsywne ustawienia. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore): { container: HTMLElement; off: () => void } {
  const container = document.createElement('div') as unknown as HTMLElement;
  const off = mountMailUi(container, store, {
    onOpenLetter: () => undefined,
    onSendCompose: () => undefined,
    onCloseLetter: () => undefined,
    onRefreshBox: () => undefined,
    onLoadOlder: () => undefined,
    onLoadAll: () => undefined,
    onSearch: () => undefined,
    onClearSearch: () => undefined,
    onDeleteLetter: () => undefined,
    onForwardLetter: () => undefined,
  } as unknown as MailUiHandlers);
  return { container, off };
}

function openWideLetter(store: MailUiStore): void {
  store.openLetter('odebrane', {
    number: 3,
    from: 'NadawcaTest',
    subject: `Raport ${'X'.repeat(220)}`,
    to: 'OdbiorcaTest',
    cc: null,
    date: null,
    body: ['Syntetyczna tresc'],
  });
}

test('uklad: operacje listu maja trzy logiczne grupy i usuwanie na koncu', () => {
  const store = new MailUiStore({ wide: true });
  const { container, off } = mount(store);
  openWideLetter(store);
  const ops = container.querySelector('.arkmail-letter-ops')!;
  const groups = Array.from(ops.children).filter((element) =>
    element.classList.contains('arkmail-action-group'),
  );
  assert.equal(groups.length, 3);
  const [replies, forward, danger] = groups;
  assert.ok(replies.classList.contains('arkmail-letter-replies'));
  assert.deepEqual(
    Array.from(replies.querySelectorAll('button')).map((button) => button.textContent),
    ['Odpowiedz', 'Odpowiedz wszystkim', 'Odpowiedz z cytowaniem'],
  );
  assert.ok(forward.classList.contains('arkmail-letter-forward'));
  assert.ok(forward.querySelector('[data-field="forward"]'));
  assert.deepEqual(
    Array.from(forward.querySelectorAll('button')).map((button) => button.textContent),
    ['Przekaz', 'Zapisz list jako TXT'],
  );
  assert.ok(danger.classList.contains('arkmail-letter-danger'));
  assert.equal(danger.querySelector('button')?.textContent, 'Usun');
  assert.equal(groups.at(-1), danger);
  off();
});

test('uklad: szeroki naglowek listu trzyma Zamknij w normalnym ukladzie', () => {
  const store = new MailUiStore({ wide: true });
  const { container, off } = mount(store);
  openWideLetter(store);
  const head = container.querySelector('.arkmail-letter-head')!;
  const heading = head.querySelector('.arkmail-letter-heading')!;
  assert.ok(heading.querySelector('.arkmail-letter-subject'));
  assert.ok(heading.querySelector('.arkmail-letter-meta'));
  assert.equal(head.lastElementChild, head.querySelector('.arkmail-letter-close'));
  off();
});

test('uklad: compose ma wspolny wiersz akcji i dwa pola ustawien', () => {
  const store = new MailUiStore({ tab: 'napisz', wide: true });
  const { container, off } = mount(store);
  const actions = container.querySelector('.arkmail-compose-actions.arkmail-action-row')!;
  assert.ok(actions.querySelector('.arkmail-send.popup-btn--solid'));
  assert.ok(actions.querySelector('.arkmail-compose-clear.popup-btn--danger.popup-btn--ghost'));
  const settings = container.querySelector('.arkmail-compose-settings')!;
  const fields = Array.from(settings.children);
  assert.equal(fields.length, 2);
  assert.ok(fields.every((field) => field.classList.contains('arkmail-compose-setting')));
  assert.ok(fields[0].querySelector('label[for="arkmail-compose-szablon"]'));
  assert.ok(fields[0].querySelector('[data-field="szablon"]'));
  assert.ok(fields[1].querySelector('label[for="arkmail-compose-szerokosc"]'));
  assert.ok(fields[1].querySelector('[data-field="szerokosc"]'));
  assert.ok(fields[1].querySelector('#arkmail-compose-szerokosc-error[role="alert"]'));
  off();
});
