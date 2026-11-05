/**
 * Wydanie 1.30.2 (Etap 5): jednolity sygnal uzbrojenia dwukliku.
 * Regresja C1: cztery klawisze ("Usun" listu, "Wyczysc zapisane dane",
 * "Wyczysc" compose, "Pobierz tresci do archiwum") uzbrajaly tylko
 * etykieta, bez data-armed i bez reakcji na ESC - inny sygnal niz
 * guardDeleteButton (czerwone tlo + obwodka). Kontrakt: kazde
 * uzbrojenie w oknie ustawia data-armed="1" i daje sie rozbroic ESC.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

interface Calls {
  clearCache: number;
  deleteLetter: number;
  download: number;
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Calls = { clearCache: 0, deleteLetter: 0, download: 0 };
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {
      calls.deleteLetter += 1;
    },
    onForwardLetter: () => {},
    onClearCache: () => {
      calls.clearCache += 1;
    },
    onDownloadArchiveBodies: () => {
      calls.download += 1;
    },
  } as unknown as Parameters<typeof mountMailUi>[2]);
  return { container, calls };
}

const qa = (root: unknown, selector: string): unknown[] =>
  Array.from((root as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector));
const buttonByText = (root: unknown, text: string): unknown => {
  const el = qa(root, 'button').find(
    (b) => (b as { textContent?: string }).textContent === text,
  );
  assert.ok(el, `klawisz "${text}" istnieje`);
  return el;
};
const click = (el: unknown): void => (el as { click(): void }).click();
const pressEsc = (): void => {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
};
const armed = (el: unknown): boolean =>
  (el as { getAttribute(n: string): string | null }).getAttribute('data-armed') === '1';

test('guard: "Wyczysc zapisane dane" uzbraja data-armed i daje rozbroic ESC', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, calls } = mount(store);
  const btn = buttonByText(container, 'Wyczysc zapisane dane');
  click(btn);
  assert.ok(armed(btn), 'pierwszy klik uzbraja (data-armed="1")');
  pressEsc();
  assert.ok(!armed(btn), 'ESC rozbraja');
  click(btn);
  assert.ok(armed(btn), 'ponowny klik uzbraja znowu');
  click(btn);
  assert.equal(calls.clearCache, 1, 'drugi klik w uzbrojenie wykonuje akcje');
});

test('guard: "Wyczysc" w compose uzbraja data-armed i daje rozbroic ESC', () => {
  const store = new MailUiStore({ tab: 'napisz' });
  const { container } = mount(store);
  const btn = buttonByText(container, 'Wyczysc');
  click(btn);
  assert.ok(armed(btn), 'pierwszy klik uzbraja');
  pressEsc();
  assert.ok(!armed(btn), 'ESC rozbraja');
});

test('guard: "Pobierz tresci do archiwum" uzbraja data-armed i daje rozbroic ESC', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive([
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
  const { container, calls } = mount(store);
  const btn = buttonByText(container, 'Pobierz tresci do archiwum');
  click(btn);
  assert.ok(armed(btn), 'pierwszy klik uzbraja');
  pressEsc();
  assert.ok(!armed(btn), 'ESC rozbraja');
  click(btn);
  click(btn);
  assert.equal(calls.download, 1, 'drugi klik w uzbrojenie startuje pobieranie');
});

test('guard: "Usun" otwartego listu uzbraja data-armed i daje rozbroic ESC', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const source = {
    number: 1,
    isRead: true,
    subject: 'X',
    forwarded: false,
    party: 'Fred',
    partyKind: 'nadawca',
    date: null,
    ctx: { query: null, anchor: 1 },
  };
  store.openLetter(
    'odebrane',
    { number: 1, from: 'Fred', subject: 'X', to: 'Bar', cc: null, date: null, body: ['t'] },
    source as never,
  );
  const { container, calls } = mount(store);
  const btn = buttonByText(container, 'Usun');
  click(btn);
  assert.ok(armed(btn), 'pierwszy klik uzbraja');
  pressEsc();
  assert.ok(!armed(btn), 'ESC rozbraja');
  click(btn);
  click(btn);
  assert.equal(calls.deleteLetter, 1, 'drugi klik w uzbrojenie kasuje list');
});
