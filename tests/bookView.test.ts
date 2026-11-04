/**
 * Fala UI-2 krok 3 (UI): widok "Ksiazka adresowa" w zakladce Kontakty.
 * Po kroku 4: pierwsza z dwoch sub-pigulek (Osoby przeniesione do
 * panelu w Archiwum - tests/archPeople.test.ts).
 * Plaska ksiazka imion: lista A-Z z checkboxami, krzyzyk per pozycja,
 * formularz dodawania z walidacja, uzbrojone usuwanie zaznaczonych,
 * sekcja aliasow pocztowych read-only (lustro z gry, bez edycji).
 * Zaznaczenie kasuje sie po kazdej zmianie listy (importy, dodanie,
 * usuniecie) - deterministycznie, po referencji tablicy w store.
 * Imiona syntetyczne (Fred/Grault/Corge/Waldo - dozwolone przez guardy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

interface Calls {
  saves: string[][];
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Calls = { saves: [] };
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
    // Jak index.ts: zapis trwa w tym samym przebiegu (storage + stan
    // UI), wiec render pracuje na swiezej liscie imion.
    onSavePeople: (people) => {
      calls.saves.push([...people]);
      store.setPeople(people);
    },
  });
  return { container, calls };
}

const q = (container: unknown, selector: string): unknown =>
  (container as { querySelector(s: string): unknown }).querySelector(selector);

const qa = (container: unknown, selector: string): unknown[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector),
  );

const text = (el: unknown): string => (el as { textContent?: string })?.textContent ?? '';

const click = (el: unknown): void => (el as { click(): void }).click();

const type = (el: unknown, value: string): void => {
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new window.Event('input') as unknown as Event);
};

// Fala UI-2 krok 4: sub-pigulka Osoby zniknela - Ksiazka to pierwsza.
const switchToKsiazka = (container: unknown): void => {
  click(qa(container, '.arkmail-subpill')[0]);
};

const qs = (el: unknown, selector: string): unknown =>
  (el as { querySelector(s: string): unknown }).querySelector(selector);

// --- sub-pigulki -------------------------------------------------------------

test('ksiazka: dwie sub-pigulki Ksiazka adresowa/Grupy (Osoby przeniesione do Archiwum)', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container } = mount(s);
  const pills = qa(container, '.arkmail-subpill');
  assert.deepEqual(pills.map(text), ['Ksiazka adresowa', 'Grupy']);
});

test('ksiazka: widok pokazuje liste imion A-Z z checkboxem i krzyzykiem', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Grault', 'Fred', 'corge'] });
  const { container } = mount(s);
  switchToKsiazka(container);
  const rows = qa(container, '[data-book-row]');
  assert.deepEqual(
    rows.map((r) => text(qs(r, '[data-book-name]'))),
    ['corge', 'Fred', 'Grault'],
    'A-Z bez wielkosci liter',
  );
  assert.equal(qa(container, '[data-book-row] input[type=checkbox]').length, 3);
  assert.equal(qa(container, '[data-book-remove]').length, 3);
  const remove = q(container, '[data-book-remove]') as HTMLElement;
  assert.equal(
    remove.getAttribute('title'),
    `Usuwa ${text(q(container, '[data-book-name]'))} z ksiazki adresowej.`,
  );
});

test('ksiazka: krzyzyk usuwa imie przez onSavePeople - dwuklik z guardem', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container, calls } = mount(s);
  switchToKsiazka(container);
  const rows = qa(container, '[data-book-row]');
  // A-Z: Fred, Grault - usuwamy Grault (drugi wiersz).
  // Guard (zgloszenie 2026-11-05): pierwszy klik uzbraja, drugi kasuje.
  click(qs(rows[1], '[data-book-remove]'));
  assert.equal(calls.saves.length, 0, 'pierwszy klik nie kasuje');
  click(q(container, '[data-book-remove][data-armed="1"]'));
  assert.deepEqual(calls.saves, [['Fred']], 'pozostala lista w kolejnosci zapisu');
});

// --- dodawanie ---------------------------------------------------------------

test('ksiazka: dodanie imienia wywoluje zapis i czysci pole', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred'] });
  const { container, calls } = mount(s);
  switchToKsiazka(container);
  type(q(container, '[data-book-new]'), 'Grault');
  click(q(container, '[data-book-add]'));
  assert.deepEqual(calls.saves, [['Fred', 'Grault']], 'dopisanie na koniec');
  assert.equal((q(container, '[data-book-new]') as HTMLInputElement).value, '', 'pole wyczyszczone');
  assert.equal(q(container, '[data-book-error]'), null, 'bez bledu');
});

test('ksiazka: walidacja - puste, cyfry, duplikat', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred'] });
  const { container, calls } = mount(s);
  switchToKsiazka(container);
  const add = () => click(q(container, '[data-book-add]'));
  const err = () => text(q(container, '[data-book-error]'));

  type(q(container, '[data-book-new]'), '   ');
  add();
  assert.equal(err(), 'Podaj imie.');
  assert.equal(calls.saves.length, 0);

  type(q(container, '[data-book-new]'), 'Fred2');
  add();
  assert.equal(err(), 'Imie: tylko litery.');
  assert.equal(calls.saves.length, 0);

  type(q(container, '[data-book-new]'), ' fred ');
  add();
  assert.equal(err(), 'To imie juz jest w ksiazce.', 'duplikat bez wielkosci liter');
  assert.equal(calls.saves.length, 0);

  type(q(container, '[data-book-new]'), 'Grault');
  add();
  assert.equal(q(container, '[data-book-error]'), null, 'po udanym dodaniu blad znika');
  assert.deepEqual(calls.saves, [['Fred', 'Grault']]);
});

// --- usuwanie zaznaczonych ---------------------------------------------------

test('ksiazka: usuwanie zaznaczonych - uzbrojony dwuklik, puste = wylaczone', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault', 'Corge'] });
  const { container, calls } = mount(s);
  switchToKsiazka(container);
  // Repaint po kazdym zdarzeniu (store.refresh) podmienia DOM, wiec
  // wszystkie zapytania ponawiane na swiezym drzewie.
  const bulkBtn = () => q(container, '[data-book-delete-checked]') as HTMLButtonElement;
  assert.equal(bulkBtn().getAttribute('disabled'), '1', 'bez zaznaczenia wylaczony');
  assert.equal(
    bulkBtn().getAttribute('title'),
    'Dwuklik: pierwszy klik pyta o potwierdzenie, drugi kasuje zaznaczone imiona.',
  );

  const checkAt = (i: number): void => {
    const boxes = qa(container, '[data-book-row] input[type=checkbox]');
    (boxes[i] as HTMLInputElement).checked = true;
    (boxes[i] as HTMLInputElement).dispatchEvent(new window.Event('change') as unknown as Event);
  };
  checkAt(0);
  checkAt(2);
  assert.notEqual(bulkBtn().getAttribute('disabled'), '1', 'po zaznaczeniu aktywny');

  click(bulkBtn());
  assert.equal(text(bulkBtn()), 'Na pewno usunac zaznaczone (2)?', 'pierwszy klik uzbraja');
  assert.equal(calls.saves.length, 0, 'uzbrojenie nic nie kasuje');

  click(bulkBtn());
  assert.deepEqual(calls.saves, [['Fred']], 'zostaly tylko niezaznaczone');
});

// --- aliasy read-only --------------------------------------------------------

test('ksiazka: aliasy pocztowe - sekcja read-only z nota', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    people: ['Fred'],
    importedAliases: [{ name: 'zgromadzenie', targets: ['Fred', 'Corge'] }],
  });
  const { container } = mount(s);
  switchToKsiazka(container);
  const section = q(container, '[data-book-aliases]');
  assert.ok(section, 'sekcja aliasow istnieje');
  assert.ok(
    text(section).includes(
      'Aliasy pocztowe z gry - tylko odczyt, nie sa zapisywane do pliku. Alias usuwasz w grze.',
    ),
  );
  assert.ok(text(section).includes('zgromadzenie'), 'nazwa aliasu widoczna');
  assert.ok(text(section).includes('Fred'), 'adresat aliasu widoczny');
  assert.equal(qa(section as unknown as HTMLElement, 'input, textarea').length, 0, 'zero pol edycji');
});

test('ksiazka: bez aliasow sekcja pokazuje nota o pustym stanie', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred'] });
  const { container } = mount(s);
  switchToKsiazka(container);
  const section = q(container, '[data-book-aliases]');
  assert.ok(section, 'sekcja istnieje takze bez aliasow');
  assert.ok(text(section).includes('Brak aliasow - aliasy pobiera sie z gry.'), 'nota o pustym stanie');
});

// --- pusty stan --------------------------------------------------------------

test('ksiazka: pusta ksiazka - komunikat zamiast listy', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: [] });
  const { container } = mount(s);
  switchToKsiazka(container);
  assert.equal(qa(container, '[data-book-row]').length, 0);
  assert.ok(
    text(container).includes('Ksiazka adresowa jest pusta - zaimportuj osoby z gry albo dodaj recznie.'),
  );
});

// --- zaznaczenie po imporcie -------------------------------------------------

test('ksiazka: zaznaczenie znika po zmianie listy (import)', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container } = mount(s);
  switchToKsiazka(container);
  const check = q(container, '[data-book-row] input[type=checkbox]') as HTMLInputElement;
  check.checked = true;
  check.dispatchEvent(new window.Event('change') as unknown as Event);
  assert.notEqual(
    (q(container, '[data-book-delete-checked]') as HTMLButtonElement).getAttribute('disabled'),
    '1',
    'zaznaczenie aktywuje przycisk',
  );
  // Symulacja importu: nowa tablica imion (index.ts setPeople po mergu).
  s.setPeople(['Fred', 'Grault', 'Corge']);
  assert.equal(
    (q(container, '[data-book-delete-checked]') as HTMLButtonElement).getAttribute('disabled'),
    '1',
    'po imporcie zaznaczenie wyzerowane',
  );
});
