/**
 * Kontakt -> listy (Fala 11h; wybor kierunku w Fali 12c).
 *
 * Klik w wiersz kontaktu nie moze szukac "gdzie popadnie" na aktywnej
 * skrzynce - gracz wybiera kierunek JAWNIE: przyciski "Odebrane" /
 * "Wyslane" w wierszu kontaktu przenosza do zakladki Listy, ustawiaja
 * odpowiednia skrzynke i odpalaja szukanie serwerowe po tej osobie.
 * Przycisk jest wylaczony (disabled), gdy licznik listow w danym
 * kierunku wynosi 0. Klik w samo imie/wiersz (poza przyciskami) =
 * kierunek domyslny: odebrane, gdy sa; inaczej wyslane; inaczej nic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';
import type { MailBox } from '../src/arkmail/core/protocol/types';

// Fala 18c: kontakty stoja za brama pelnego indeksu skrzynek - testy
// widoku kontaktow montuja stan z kompletnymi flagami (sama brama i
// jej integracja: tests/indexAll.test.ts).
const INDEXED: Partial<Record<MailBox, string>> = {
  odebrane: '2026-10-20T00:00:00.000Z',
  nieprzeczytane: '2026-10-20T00:00:00.000Z',
  wyslane: '2026-10-20T00:00:00.000Z',
  niewyslane: '2026-10-20T00:00:00.000Z',
};

const window = new Window();
const document = window.document;

interface Mounted {
  container: ReturnType<typeof document.createElement>;
  calls: { name: string; args: unknown[] }[];
}

function mount(store: MailUiStore): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string) => (...args: unknown[]) => calls.push({ name, args });
  mountMailUi(container as unknown as HTMLElement, store, {
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
  });
  return { container, calls };
}

const contact = (over: Partial<Contact>): Contact => ({
  name: 'Corge',
  sources: ['korespondencja'],
  lettersReceived: 2,
  lettersSent: 1,
  ...over,
});

const clickEl = (el: unknown): void => {
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(new window.Event('click'));
};

const searchCalls = (calls: Mounted['calls']) =>
  calls.filter((c) => c.name === 'search').map((c) => c.args);

test('kontakty: klik w imie -> kierunek domyslny odebrane (nie aktywna skrzynka)', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setActiveBox('wyslane'); // aktywna skrzynka NIE moze decydowac
  s.setContacts([contact({})]);
  const { container, calls } = mount(s);

  const row = container.querySelector('.arkmail-contact-name');
  assert.ok(row, 'imie kontaktu');
  clickEl(row);

  assert.equal(s.state.tab, 'listy', 'przejscie do zakladki Listy');
  assert.equal(s.state.activeBox, 'odebrane', 'skrzynka przestawiona na odebrane');
  assert.deepEqual(
    searchCalls(calls),
    [['odebrane', { osoba: 'Corge' }]],
    'szukanie na odebranych, nie na aktywnej skrzynce',
  );
  const input = container.querySelector('[data-search="osoba"]') as unknown as {
    value: string;
  } | null;
  assert.ok(input, 'pole szukajki w widoku');
  assert.equal(input!.value, 'Corge', 'pole osoba wypelnione kontaktem');
});

test('kontakty: klik w imie -> wyslane, gdy odebranych brak', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 3 })]);
  const { container, calls } = mount(s);

  clickEl(container.querySelector('.arkmail-contact-name'));

  assert.equal(s.state.activeBox, 'wyslane', 'skrzynka przestawiona na wyslane');
  assert.deepEqual(searchCalls(calls), [['wyslane', { osoba: 'Corge' }]]);
});

test('kontakty: klik w imie bez zadnych listow -> nic sie nie dzieje', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 0 })]);
  const { container, calls } = mount(s);

  clickEl(container.querySelector('.arkmail-contact-name'));

  assert.equal(s.state.tab, 'kontakty', 'zostajemy w kontaktach');
  assert.deepEqual(searchCalls(calls), [], 'zero szukania');
});

test('kontakty: przycisk Wyslane szuka na wyslanych niezaleznie od licznikow', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({})]); // ma oba kierunki
  const { container, calls } = mount(s);

  const btn = container.querySelector('[data-dir="wyslane"]');
  assert.ok(btn, 'przycisk kierunku Wyslane');
  clickEl(btn);

  assert.equal(s.state.tab, 'listy');
  assert.equal(s.state.activeBox, 'wyslane');
  assert.deepEqual(
    searchCalls(calls),
    [['wyslane', { osoba: 'Corge' }]],
    'jawny wybor kierunku wygrywa z domyslnym',
  );
});

test('kontakty: przycisk kierunku wylaczony, gdy licznik wynosi 0', () => {
  const s = new MailUiStore({ tab: 'kontakty', indexMeta: INDEXED });
  s.setContacts([contact({ lettersReceived: 0, lettersSent: 5 })]);
  const { container, calls } = mount(s);

  const off = container.querySelector('[data-dir="odebrane"]') as unknown as {
    disabled: boolean;
  } | null;
  const on = container.querySelector('[data-dir="wyslane"]') as unknown as {
    disabled: boolean;
  } | null;
  assert.ok(off && on, 'oba przyciski kierunku w wierszu');
  assert.ok(off!.disabled, 'Odebrane wylaczone (0 odebranych)');
  assert.ok(!on!.disabled, 'Wyslane aktywne');
  clickEl(off);
  assert.deepEqual(searchCalls(calls), [], 'wylaczony przycisk nie strzela');
});
