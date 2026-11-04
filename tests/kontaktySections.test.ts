/**
 * Struktura zakladki Kontakty (zgloszenie live 2026-11-05):
 * 4 sub-pigulki - Ksiazka adresowa / Aliasy Pocztowe / Grupy /
 * Import-Eksport. Eksport/import przeniesione z sekcji Grupy do
 * Import-Eksport. Aliasy pocztowe jako osobna sekcja z klawiszem
 * czyszczenia lustra (guard dwukliku, poziom danger). Sekcja
 * Import-Eksport: czyszczenie calej ksiazki (imiona + grupy + aliasy,
 * guard) i dopisanie wszystkich osob zebranych z listow (klawisz
 * aktywny tylko gdy baza istnieje).
 * Imiona syntetyczne (Fred/Grault/Corge/Waldo - dozwolone przez guardy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

interface Calls {
  clearAliases: number;
  clearBook: number;
  addAll: number;
}

function contact(name: string): Contact {
  return { name, sources: ['korespondencja'], lettersReceived: 1, lettersSent: 0 };
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Calls = { clearAliases: 0, clearBook: 0, addAll: 0 };
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
    onClearAliases: () => {
      calls.clearAliases += 1;
    },
    onClearAddressBook: () => {
      calls.clearBook += 1;
    },
    onAddAllContacts: () => {
      calls.addAll += 1;
    },
  });
  return { container: container as unknown as Root, calls };
}

interface Root {
  querySelector(s: string): unknown;
  querySelectorAll(s: string): Iterable<unknown>;
}

const q = (root: Root, selector: string): unknown => root.querySelector(selector);
const qa = (root: Root, selector: string): unknown[] => Array.from(root.querySelectorAll(selector));
const click = (el: unknown): void => (el as { click(): void }).click();
const classesOf = (el: unknown): string[] =>
  ((el as { className?: string }).className ?? '').split(' ');

/** Klik w sub-pigulke sekcji Kontaktow po etykiecie. */
const switchSub = (root: Root, label: string): void => {
  for (const pill of qa(root, '.arkmail-subpill')) {
    if ((pill as { textContent?: string }).textContent === label) {
      click(pill);
      return;
    }
  }
  assert.fail(`brak sub-pigulki: ${label}`);
};

const PILL_LABELS = ['Ksiazka adresowa', 'Aliasy Pocztowe', 'Grupy', 'Import-Eksport'];

test('kontakty: 4 sub-pigulki w zatwierdzonym porzadku', () => {
  const { container } = mount(new MailUiStore({ tab: 'kontakty' }));
  assert.deepEqual(
    qa(container, '.arkmail-subpill').map((p) => (p as { textContent?: string }).textContent),
    PILL_LABELS,
    'pigulki i kolejnosc',
  );
});

test('kontakty: eksport/import nie mieszka juz w sekcji Grupy', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
  const { container } = mount(s);
  switchSub(container, 'Grupy');
  assert.equal(q(container, '[data-book-export]'), null, 'eksport przeniesiony');
  assert.equal(q(container, '[data-book-import]'), null, 'import przeniesiony');
  assert.equal(q(container, '[data-book-import-mode]'), null, 'tryby importu przeniesione');
});

test('kontakty: sekcja Import-Eksport ma eksport, import i tryby', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    people: ['Fred'],
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
  const { container } = mount(s);
  switchSub(container, 'Import-Eksport');
  assert.ok(q(container, '[data-book-export]'), 'eksport obecny');
  assert.ok(q(container, '[data-book-import]'), 'import obecny');
  assert.equal(
    qa(container, '[data-book-import-mode] input[type=radio]').length,
    2,
    'dwa tryby importu',
  );
});

test('kontakty: Aliasy Pocztowe jako osobna sekcja z czyszczeniem', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    importedAliases: [{ name: 'zgromadzenie', targets: ['Fred'] }],
  });
  const { container, calls } = mount(s);
  // W Ksiazce aliasow juz nie ma - sekcja ma wlasna pigulke.
  assert.equal(q(container, '[data-book-aliases]'), null, 'Ksiazka bez sekcji aliasow');
  switchSub(container, 'Aliasy Pocztowe');
  assert.ok(q(container, '[data-book-aliases]'), 'aliasy w swojej sekcji');
  assert.match(
    (q(container, '[data-book-aliases]') as { textContent?: string }).textContent ?? '',
    /zgromadzenie/,
    'lista aliasow widoczna',
  );
  const clear = q(container, '[data-aliases-clear]');
  assert.ok(clear, 'klawisz czyszczenia aliasow');
  assert.ok(classesOf(clear).includes('arkmail-btn-danger'), 'czyszczenie: danger');
  click(clear);
  assert.equal(calls.clearAliases, 0, 'pierwszy klik tylko uzbraja');
  click(q(container, '[data-aliases-clear][data-armed="1"]'));
  assert.equal(calls.clearAliases, 1, 'drugi klik czysci aliasy');
});

test('kontakty: Wyczysc cala ksiazke - guard i zakres', () => {
  const { container, calls } = mount(new MailUiStore({ tab: 'kontakty' }));
  switchSub(container, 'Import-Eksport');
  const clearAll = q(container, '[data-book-clear-all]');
  assert.ok(clearAll, 'klawisz czyszczenia calej ksiazki');
  assert.ok(classesOf(clearAll).includes('arkmail-btn-danger'), 'danger');
  assert.match(
    (clearAll as { getAttribute(n: string): string | null }).getAttribute('title') ?? '',
    /imiona.*grupy.*aliasy/i,
    'tooltip enumeruje zakres: imiona, grupy, aliasy',
  );
  click(clearAll);
  assert.equal(calls.clearBook, 0, 'pierwszy klik tylko uzbraja');
  click(q(container, '[data-book-clear-all][data-armed="1"]'));
  assert.equal(calls.clearBook, 1, 'drugi klik czysci cala ksiazke');
});

test('kontakty: Dopisz wszystkie osoby z listow - tylko gdy baza istnieje', () => {
  const empty = mount(new MailUiStore({ tab: 'kontakty' }));
  switchSub(empty.container, 'Import-Eksport');
  const disabledBtn = q(empty.container, '[data-book-add-all-contacts]');
  assert.ok(disabledBtn, 'klawisz istnieje');
  assert.equal(
    (disabledBtn as { getAttribute(n: string): string | null }).getAttribute('disabled'),
    '1',
    'bez bazy wylaczony',
  );

  const s = new MailUiStore({ tab: 'kontakty', contacts: [contact('Fred'), contact('Grault')] });
  const { container, calls } = mount(s);
  switchSub(container, 'Import-Eksport');
  const btn = q(container, '[data-book-add-all-contacts]');
  assert.notEqual((btn as { getAttribute(n: string): string | null }).getAttribute('disabled'), '1',
    'z baza aktywny');
  click(btn);
  assert.equal(calls.addAll, 1, 'jedno klikniecie dopisuje (operacja doklejajaca)');
});
