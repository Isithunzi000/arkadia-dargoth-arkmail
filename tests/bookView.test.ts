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
// Zgloszenie 2026-11-05: wybór sub-pigulki po etykiecie (4 pigulki).
const switchSubByLabel = (container: unknown, label: string): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if (text(pill) === label) {
      click(pill);
      return;
    }
  }
  assert.fail(`brak sub-pigulki: ${label}`);
};
const switchToKsiazka = (container: unknown): void => switchSubByLabel(container, 'Ksiazka adresowa');
const switchToAliasy = (container: unknown): void => switchSubByLabel(container, 'Aliasy Pocztowe');
const switchToImportEksport = (container: unknown): void =>
  switchSubByLabel(container, 'Import-Eksport');

const qs = (el: unknown, selector: string): unknown =>
  (el as { querySelector(s: string): unknown }).querySelector(selector);

// --- sub-pigulki -------------------------------------------------------------

test('ksiazka: cztery sub-pigulki (Osoby przeniesione do Archiwum)', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container } = mount(s);
  const pills = qa(container, '.arkmail-subpill');
  assert.deepEqual(pills.map(text), [
    'Ksiazka adresowa',
    'Aliasy Pocztowe',
    'Grupy',
    'Import-Eksport',
  ]);
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
  // Zgloszenie 2026-11-05 pkt 4 (1.30.1): dodawanie mieszka w Ksiazce.
  type(q(container, '[data-book-new]'), 'Grault');
  click(q(container, '[data-book-add]'));
  assert.deepEqual(calls.saves, [['Fred', 'Grault']], 'dopisanie na koniec');
  assert.equal((q(container, '[data-book-new]') as HTMLInputElement).value, '', 'pole wyczyszczone');
  assert.equal(q(container, '[data-book-error]'), null, 'bez bledu');
});

test('ksiazka: walidacja - puste, cyfry, duplikat', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred'] });
  const { container, calls } = mount(s);
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

// --- zaznaczanie zbiorcze (zgloszenie 2026-11-05 pkt 1) ----------------------

test('ksiazka: Zaznacz wszystkie i Odznacz wszystkie', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault', 'Corge'] });
  const { container } = mount(s);
  switchToKsiazka(container);
  const selectAll = q(container, '[data-book-select-all]');
  const deselectAll = q(container, '[data-book-deselect-all]');
  assert.ok(selectAll, 'klawisz Zaznacz wszystkie istnieje');
  assert.ok(deselectAll, 'klawisz Odznacz wszystkie istnieje');

  click(selectAll);
  const checked = () =>
    qa(container, '[data-book-row] input[type=checkbox]').filter(
      (c) => (c as HTMLInputElement).checked,
    ).length;
  assert.equal(checked(), 3, 'zaznacz wszystkie: wszystkie imiona');
  assert.equal(
    text(q(container, '[data-book-write-checked]')),
    'Napisz list do zaznaczonych (3)',
    'licznik zaznaczonych w klawiszu pisania',
  );

  // Idempotentne: drugi klik nic nie psuje.
  click(q(container, '[data-book-select-all]'));
  assert.equal(checked(), 3, 'powtorzony klik bez zmian');

  click(q(container, '[data-book-deselect-all]'));
  assert.equal(checked(), 0, 'odznacz wszystkie czysci zaznaczenie');
  assert.equal(
    (q(container, '[data-book-delete-checked]') as HTMLButtonElement).getAttribute('disabled'),
    '1',
    'zbiorcze usuwanie z powrotem wylaczone',
  );
});

test('ksiazka: zaznacz wszystkie + usuwanie zaznaczonych', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container, calls } = mount(s);
  switchToKsiazka(container);
  click(q(container, '[data-book-select-all]'));
  const bulkBtn = () => q(container, '[data-book-delete-checked]') as HTMLButtonElement;
  click(bulkBtn());
  assert.equal(text(bulkBtn()), 'Na pewno usunac zaznaczone (2)?', 'guard liczy zaznaczenie');
  click(bulkBtn());
  assert.deepEqual(calls.saves, [[]], 'wszystkie imiona skasowane');
});

// --- aliasy read-only --------------------------------------------------------

test('aliasy: sekcja read-only z nota', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    people: ['Fred'],
    importedAliases: [{ name: 'zgromadzenie', targets: ['Fred', 'Corge'] }],
  });
  const { container } = mount(s);
  switchToAliasy(container);
  const section = q(container, '[data-book-aliases]');
  assert.ok(section, 'sekcja aliasow istnieje w pigulce Aliasy Pocztowe');
  assert.ok(
    text(section).includes(
      'Aliasy pocztowe z gry - tylko odczyt, nie sa zapisywane do pliku. Aliasy edytujesz i usuniesz w grze.',
    ),
  );
  assert.ok(text(section).includes('zgromadzenie'), 'nazwa aliasu widoczna');
  assert.ok(text(section).includes('Fred'), 'adresat aliasu widoczny');
  assert.equal(qa(section as unknown as HTMLElement, 'input, textarea').length, 0, 'zero pol edycji');
  // Zgloszenie 2026-11-05: pisanie do aliasu jednym klikiem (serwer sam
  // rozwija aliasy przy wysylce).
  const write = q(section, '[data-alias-write]') as unknown as {
    click(): void;
    getAttribute(n: string): string | null;
  };
  assert.ok(write, 'klawisz Napisz przy aliasie');
  assert.equal(
    write.getAttribute('title'),
    'Otwiera zakladke Napisz z adresem: zgromadzenie.',
  );
  click(write);
  assert.equal(s.state.tab, 'napisz', 'przejscie na Napisz');
  const adresat = q(container, '[data-pane-key="napisz"] [data-field="adresat"]') as unknown as {
    value: string;
  };
  assert.equal(adresat.value, 'zgromadzenie', 'alias jako adresat');
});

test('aliasy: bez aliasow sekcja pokazuje nota o pustym stanie', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred'] });
  const { container } = mount(s);
  switchToAliasy(container);
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
test('ksiazka: filtr listy imion z przyciskiem czyszczenia', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault', 'Corge'] });
  const { container } = mount(s);
  const filter = q(container, '[data-book-filter]') as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  assert.ok(filter, 'pole filtra istnieje');
  filter.value = 'grau';
  filter.dispatchEvent(new window.Event('input') as unknown as Event);
  const rows = qa(container, '[data-book-row]');
  assert.equal(rows.length, 1, 'filtr zaweza liste do Grault');
  assert.equal(text(qs(rows[0], '[data-book-name]')), 'Grault');
  const clear = q(container, '[data-book-filter-clear]') as unknown as { click(): void };
  assert.ok(clear, 'przycisk czyszczenia filtra istnieje');
  click(clear);
  assert.equal(qa(container, '[data-book-row]').length, 3, 'po czyszczeniu znowu cala lista');
});

test('ksiazka: filtr bez trafien pokazuje komunikat pustej listy', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container } = mount(s);
  const filter = q(container, '[data-book-filter]') as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  filter.value = 'zzz';
  filter.dispatchEvent(new window.Event('input') as unknown as Event);
  assert.equal(qa(container, '[data-book-row]').length, 0, 'brak pasujacych imion');
  assert.match(container.textContent ?? '', /Brak imion pasujacych do filtra/);
});

// Zgloszenie 2026-11-05 (K3): total liczby imion w ksiazce - gracz widzi,
// ile ma pozycji, i ile z nich pokazuje aktywny filtr.
test('ksiazka: licznik total i widocznych przy aktywnym filtrze', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault', 'Corge'] });
  const { container } = mount(s);
  const count = () => text(q(container, '[data-book-count]'));
  assert.equal(count(), 'Ksiazka: 3 imiona', 'total przy pelnej liscie');
  const filter = q(container, '[data-book-filter]') as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  filter.value = 'grau';
  filter.dispatchEvent(new window.Event('input') as unknown as Event);
  assert.equal(count(), 'Ksiazka: 3 imiona (widoczne: 1)', 'filtr pokazuje liczbe widocznych');
});

// Zgloszenie 2026-11-05 (K8): filtr listy imion z ghost-podpowiedziami
// osob i aliasow (jak pole Osoba w Archiwum).
test('ksiazka: filtr imion podpowiada osoby ghostem', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container } = mount(s);
  const filter = q(container, '[data-book-filter]') as unknown as {
    value: string;
    selectionStart: number;
    selectionEnd: number;
    dispatchEvent(e: unknown): void;
    closest(s: string): unknown;
  };
  assert.ok(filter.closest('.arkmail-ghost-wrap'), 'filtr opakowany ghostem');
  filter.value = 'gr';
  filter.selectionStart = 2;
  filter.selectionEnd = 2;
  filter.dispatchEvent(new window.Event('input') as unknown as Event);
  const rest = (filter.closest('.arkmail-ghost-wrap') as { querySelector(s: string): unknown })
    .querySelector('.arkmail-ghost-rest') as { textContent?: string } | null;
  assert.equal(rest?.textContent ?? '', 'ault', 'Grault podpowiada w filtrze');
});
