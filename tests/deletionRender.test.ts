import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { ListingSearch } from '../src/arkmail/core/protocol/commands';
import type { MailBox } from '../src/arkmail/core/protocol/types';

const window = new Window();
const document = window.document;

type Call = { name: string; args: unknown[] };

function entry(number: number): MailboxEntry {
  return {
    number,
    isRead: true,
    subject: `Temat ${number}`,
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
  };
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Call[] = [];
  const rec = (name: string) => (...args: unknown[]) => calls.push({ name, args });
  const handlers = {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('delete'),
    onForwardLetter: rec('forward'),
    onDeletionSearch: rec('deletion-search'),
    onDeletionRefresh: rec('deletion-refresh'),
    onDeletionDelete: rec('deletion-delete'),
  } as unknown as MailUiHandlers;
  const off = mountMailUi(container as unknown as HTMLElement, store, handlers);
  return { container, calls, off };
}

const click = (element: unknown): void => {
  assert.ok(element);
  (element as { dispatchEvent(event: unknown): void }).dispatchEvent(new window.Event('click'));
};

const input = (container: unknown, selector: string, value: string): void => {
  const element = (container as { querySelector(s: string): unknown }).querySelector(selector) as {
    value: string;
    dispatchEvent(event: unknown): void;
  } | null;
  assert.ok(element, `pole ${selector} istnieje`);
  element.value = value;
  element.dispatchEvent(new window.Event('input'));
};

function deletionStore(): MailUiStore {
  const store = new MailUiStore({ tab: 'usuwanie' });
  store.applyDeletionResult('odebrane', 'listy odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(1), entry(2), entry(3)],
  });
  return store;
}

test('usuwanie: zakladka jest ostatnia, a wejscie nie pobiera danych', () => {
  const store = new MailUiStore();
  const { container, calls, off } = mount(store);
  const tabs = [...container.querySelectorAll('.arkmail-tab')];
  assert.equal(tabs.at(-1)?.getAttribute('data-tab'), 'usuwanie');
  assert.equal(tabs.at(-1)?.textContent, 'Usuwanie listow');
  click(container.querySelector('[data-tab="usuwanie"]'));
  assert.equal(store.state.tab, 'usuwanie');
  assert.deepEqual(calls, [], 'wejscie do zakladki nie wysyla zapytania');
  const pane = container.querySelector('.arkmail-deletion');
  assert.ok(pane?.textContent?.includes('Wyniki nie odswiezaja sie automatycznie.'));
  assert.ok(pane?.textContent?.includes('Wyjscie z zakladki czysci wyniki i zaznaczenie.'));
  assert.ok(!/Wczytaj (wszystkie|starsze)/.test(pane?.textContent ?? ''));
  off();
});

test('usuwanie: filtry i skrzynka trafiaja do recznego wyszukiwania', () => {
  const store = new MailUiStore({ tab: 'usuwanie' });
  const { container, calls, off } = mount(store);
  const select = container.querySelector('.arkmail-deletion-box') as unknown as {
    value: string;
    dispatchEvent(event: unknown): void;
  } | null;
  assert.ok(select);
  select.value = 'wyslane';
  select.dispatchEvent(new window.Event('change'));
  input(container, '[data-deletion-filter="osoba"]', 'Bar');
  input(container, '[data-deletion-filter="temat"]', 'Raport');
  input(container, '[data-deletion-filter="tresc"]', 'złoto');
  input(container, '[data-deletion-filter="odDaty"]', '2026-10-01');
  input(container, '[data-deletion-filter="doDaty"]', '2026-10-03');
  assert.equal(calls.length, 0, 'edycja pol nie wysyla zapytania');

  click(container.querySelector('.arkmail-deletion-search'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'deletion-search');
  assert.equal(calls[0].args[0] as MailBox, 'wyslane');
  assert.deepEqual(calls[0].args[1] as ListingSearch, {
    osoba: 'Bar',
    temat: 'Raport',
    tresc: 'złoto',
    odDaty: { year: 2026, month: 10, day: 1 },
    doDaty: { year: 2026, month: 10, day: 3 },
  });

  store.applyDeletionResult('wyslane', 'listy wyslane', {
    kind: 'lista',
    header: { box: 'wyslane', truncated: false },
    entries: [entry(4)],
  });
  click(container.querySelector('.arkmail-deletion-refresh'));
  assert.equal(calls[1].name, 'deletion-refresh');
  click(container.querySelector('.arkmail-deletion-clear-filters'));
  assert.equal(store.state.deletion.filters.temat, '');
  assert.equal(store.state.deletion.result, null);
  off();
});

test('usuwanie: zaznaczanie i potwierdzenie uzywaja biezacej liczby listow', () => {
  const store = deletionStore();
  const { container, calls, off } = mount(store);
  assert.equal(container.querySelectorAll('.arkmail-deletion-entry').length, 3);
  assert.ok(container.textContent?.includes('Wyniki: 3 listy.'));
  click(container.querySelector('.arkmail-deletion-select-all'));
  assert.deepEqual(store.state.deletion.selected, [1, 2, 3]);
  assert.ok(container.textContent?.includes('Zaznaczono: 3 listy.'));

  click(container.querySelector('.arkmail-deletion-delete'));
  assert.equal(calls.length, 0, 'pierwszy klik tylko prosi o potwierdzenie');
  const armed = container.querySelector('.arkmail-deletion-delete');
  assert.ok(armed?.textContent?.includes('3 listy'));
  assert.equal(
    armed?.getAttribute('title'),
    'Usunac zaznaczone listy (liczba: 3)? Tej operacji nie mozna cofnac. Kliknij ponownie, aby potwierdzic.',
  );
  click(armed);
  assert.deepEqual(calls, [{ name: 'deletion-delete', args: [] }]);

  store.clearDeletionSelection();
  store.toggleDeletionEntry(1);
  store.toggleDeletionEntry(2);
  click(container.querySelector('.arkmail-deletion-clear-selection'));
  assert.deepEqual(store.state.deletion.selected, []);
  assert.ok((container.querySelector('.arkmail-deletion-delete') as unknown as { disabled: boolean }).disabled);
  off();
});
