/**
 * Etap 9: wspolne filtry Archiwum, macierz przyciskow, uklady i teksty.
 * Wszystkie nazwy i tresci fixturek sa syntetyczne.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { STYLES } from '../src/arkmail/ui/styles';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

type Call = { name: string; args: unknown[] };
type TestElement = HTMLElement & {
  value: string;
  disabled: boolean;
};

const mounted: Array<{ off: () => void; container: HTMLElement }> = [];
afterEach(() => {
  for (const item of mounted.splice(0)) {
    item.off();
    item.container.remove();
  }
});

function mount(store: MailUiStore): { container: HTMLElement; calls: Call[] } {
  const container = document.createElement('div') as unknown as HTMLElement;
  (document.body as unknown as { appendChild(node: unknown): void }).appendChild(container);
  const calls: Call[] = [];
  const rec = (name: string) => (...args: unknown[]): void => {
    calls.push({ name, args });
  };
  const off = mountMailUi(container, store, {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('delete'),
    onImportAliases: rec('import-aliases'),
    onDownloadArchiveBodies: rec('download'),
  } as unknown as MailUiHandlers);
  mounted.push({ off, container });
  return { container, calls };
}

const q = (root: ParentNode, selector: string): TestElement => {
  const element = root.querySelector(selector) as unknown as TestElement | null;
  assert.ok(element, `element istnieje: ${selector}`);
  return element;
};
const maybe = (root: ParentNode, selector: string): TestElement | null =>
  root.querySelector(selector) as unknown as TestElement | null;
const qa = (root: ParentNode, selector: string): TestElement[] =>
  Array.from(root.querySelectorAll(selector)) as unknown as TestElement[];
const click = (element: TestElement): void => element.click();
const byText = (root: ParentNode, selector: string, text: string): TestElement => {
  const element = qa(root, selector).find((candidate) => candidate.textContent === text);
  assert.ok(element, `element "${text}" istnieje`);
  return element;
};
const setInput = (element: TestElement, value: string): void => {
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
};
const change = (element: TestElement, value: string): void => {
  element.value = value;
  element.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
};
const activeSub = (root: ParentNode): string =>
  q(root, '.arkmail-subpill.is-active').textContent ?? '';
const hasClasses = (element: TestElement, classes: string[]): void => {
  for (const cls of classes) assert.ok(element.classList.contains(cls), `brak klasy ${cls}`);
};
const CLEAR_TITLE =
  'Czysci filtry Archiwum i Osob z listow oraz przywraca sortowanie osob: Nazwa A-Z.';

function openArchiveSub(container: ParentNode, label: 'Archiwum listow' | 'Osoby z listow'): void {
  if (activeSub(container) !== label) click(byText(container, '.arkmail-subpill', label));
}

function resetArchive(container: ParentNode): void {
  openArchiveSub(container, 'Archiwum listow');
  const clear = maybe(container, '.arkmail-arch-clear');
  if (clear && !clear.hasAttribute('disabled')) click(clear);
}

function openContactSub(
  container: ParentNode,
  label: 'Ksiazka adresowa' | 'Aliasy pocztowe' | 'Grupy' | 'Import i eksport',
): void {
  const pill = byText(container, '.arkmail-subpill', label);
  if (!pill.classList.contains('is-active')) click(pill);
}

const contact = (over: Partial<Contact> = {}): Contact => ({
  name: 'Corge',
  sources: ['korespondencja'],
  lettersReceived: 2,
  lettersSent: 1,
  mailAlias: 'AliasTest',
  ...over,
});

test('4.1/4.11: oba widoki maja ten sam przycisk, tooltip i domyslnie stan wylaczony', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const { container } = mount(store);
  resetArchive(container);
  const archiveClear = q(container, '.arkmail-arch-clear');
  assert.equal(archiveClear.getAttribute('title'), CLEAR_TITLE);
  assert.equal(archiveClear.getAttribute('disabled'), '1');
  openArchiveSub(container, 'Osoby z listow');
  const peopleClear = q(container, '[data-arch-people-clear]');
  assert.equal(peopleClear.textContent, 'Wyczysc filtry');
  assert.equal(peopleClear.getAttribute('title'), CLEAR_TITLE);
  assert.equal(peopleClear.getAttribute('disabled'), '1');
  hasClasses(peopleClear, ['popup-btn', 'popup-btn--control', 'popup-btn--danger', 'popup-btn--ghost']);
});

test('4.11: czyszczenie z Osob resetuje oba widoki i nie zmienia podzakladki', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setContacts([contact()]);
  const { container } = mount(store);
  resetArchive(container);
  for (const [key, value] of [
    ['osoba', 'Foo'],
    ['temat', 'Temat'],
    ['tresc', 'Tresc'],
    ['odDaty', '2000-01-01'],
    ['doDaty', '2000-01-02'],
  ] as const) setInput(q(container, `[data-filter="${key}"]`), value);
  change(q(container, '[data-filter="skrzynka"]'), 'odebrane');
  openArchiveSub(container, 'Osoby z listow');
  setInput(q(container, '[data-filter="kontakty"]'), 'Cor');
  change(q(container, '.arkmail-contact-sort'), 'ostatni');
  click(q(container, '[data-arch-people-clear]'));
  assert.equal(activeSub(container), 'Osoby z listow');
  assert.equal(q(container, '[data-filter="kontakty"]').value, '');
  assert.equal(q(container, '.arkmail-contact-sort').value, 'nazwa');
  openArchiveSub(container, 'Archiwum listow');
  for (const key of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty', 'skrzynka']) {
    assert.equal(q(container, `[data-filter="${key}"]`).value, '', key);
  }
  assert.equal(q(container, '.arkmail-arch-clear').getAttribute('disabled'), '1');
});

test('4.11: czyszczenie z Archiwum resetuje Osoby, a domyslny stan jest no-op', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setContacts([contact()]);
  const { container } = mount(store);
  resetArchive(container);
  setInput(q(container, '[data-filter="temat"]'), 'Temat');
  openArchiveSub(container, 'Osoby z listow');
  setInput(q(container, '[data-filter="kontakty"]'), 'Cor');
  change(q(container, '.arkmail-contact-sort'), 'liczba');
  openArchiveSub(container, 'Archiwum listow');
  click(q(container, '.arkmail-arch-clear'));
  assert.equal(activeSub(container), 'Archiwum listow');
  openArchiveSub(container, 'Osoby z listow');
  assert.equal(q(container, '[data-filter="kontakty"]').value, '');
  assert.equal(q(container, '.arkmail-contact-sort').value, 'nazwa');
  const originalRefresh = store.refresh.bind(store);
  let refreshes = 0;
  store.refresh = () => {
    refreshes += 1;
    originalRefresh();
  };
  q(container, '[data-arch-people-clear]').dispatchEvent(
    new window.Event('click', { bubbles: true }) as unknown as Event,
  );
  assert.equal(refreshes, 0, 'domyslny stan nie wywoluje repaintu');
});

test('4.1/4.11: kazde odstepstwo od domyslnego stanu aktywuje oba przyciski', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setContacts([contact()]);
  const { container } = mount(store);
  resetArchive(container);
  for (const [key, value] of [
    ['osoba', 'Foo'],
    ['temat', 'Temat'],
    ['tresc', 'Tresc'],
    ['odDaty', '2000-01-01'],
    ['doDaty', '2000-01-02'],
  ] as const) {
    setInput(q(container, `[data-filter="${key}"]`), value);
    openArchiveSub(container, 'Osoby z listow');
    assert.equal(q(container, '[data-arch-people-clear]').getAttribute('disabled'), null, key);
    click(q(container, '[data-arch-people-clear]'));
    openArchiveSub(container, 'Archiwum listow');
  }
  change(q(container, '[data-filter="skrzynka"]'), 'wyslane');
  openArchiveSub(container, 'Osoby z listow');
  assert.equal(q(container, '[data-arch-people-clear]').getAttribute('disabled'), null);
  click(q(container, '[data-arch-people-clear]'));
  setInput(q(container, '[data-filter="kontakty"]'), 'Cor');
  assert.equal(q(container, '[data-arch-people-clear]').getAttribute('disabled'), null);
  click(q(container, '[data-arch-people-clear]'));
  change(q(container, '.arkmail-contact-sort'), 'ostatni');
  assert.equal(q(container, '[data-arch-people-clear]').getAttribute('disabled'), null);
});

test('4.3/4.8: filtry Grup i Ksiazki maja danger ghost oraz jeden klik', () => {
  const store = new MailUiStore({ tab: 'kontakty', people: ['Corge'] });
  store.setGroups([{ name: 'Patrol', members: [] }]);
  const { container } = mount(store);
  openContactSub(container, 'Grupy');
  setInput(q(container, '[data-group-filter]'), 'Pat');
  const groupClear = q(container, '[data-group-filter-clear]');
  hasClasses(groupClear, ['popup-btn--danger', 'popup-btn--ghost']);
  click(groupClear);
  assert.equal(q(container, '[data-group-filter]').value, '');
  assert.equal(groupClear.getAttribute('data-armed'), null);
  openContactSub(container, 'Ksiazka adresowa');
  setInput(q(container, '[data-book-filter]'), 'Cor');
  const bookClear = q(container, '[data-book-filter-clear]');
  hasClasses(bookClear, ['popup-btn--danger', 'popup-btn--ghost']);
  click(bookClear);
  assert.equal(q(container, '[data-book-filter]').value, '');
  assert.equal(bookClear.getAttribute('data-armed'), null);
});

test('4.7/S39/S22: wyniki List i compose maja jednoznaczne etykiety', () => {
  const store = new MailUiStore({ tab: 'listy' });
  store.setSearch({ box: 'odebrane', label: 'temat: test' });
  const { container, calls } = mount(store);
  const clear = q(container, '.arkmail-search-clear');
  assert.equal(clear.textContent, 'Wyczysc wyniki i filtry');
  assert.equal(
    clear.getAttribute('title'),
    'Usuwa wyniki szukania, czysci wszystkie pola i przywraca pelny widok skrzynki.',
  );
  hasClasses(clear, ['popup-btn--danger', 'popup-btn--ghost']);
  click(clear);
  assert.equal(clear.getAttribute('data-armed'), null);
  assert.equal(calls.filter((call) => call.name === 'clear-search').length, 1);
  store.setTab('napisz');
  const composeClear = q(container, '.arkmail-compose-clear');
  assert.equal(composeClear.textContent, 'Wyczysc pola listu');
  hasClasses(composeClear, ['popup-btn--danger', 'popup-btn--ghost']);
});

test('4.8: dlugie pobieranie zostaje neutralne i wymaga dwoch klikow', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const { container, calls } = mount(store);
  const download = q(container, '.arkmail-arch-download');
  hasClasses(download, ['popup-btn', 'popup-btn--control']);
  assert.equal(download.classList.contains('popup-btn--danger'), false);
  click(download);
  assert.equal(download.getAttribute('data-armed'), '1');
  assert.equal(calls.filter((call) => call.name === 'download').length, 0);
  click(download);
  assert.equal(calls.filter((call) => call.name === 'download').length, 1);
});

test('4.8: Odebrane, Wyslane i Do ksiazki maja natywne klasy oraz klasy ArkMaila', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setContacts([contact()]);
  const { container } = mount(store);
  openArchiveSub(container, 'Osoby z listow');
  for (const element of [
    q(container, '[data-dir="odebrane"]'),
    q(container, '[data-dir="wyslane"]'),
    q(container, '[data-arch-add-book]'),
  ]) {
    hasClasses(element, ['popup-btn', 'popup-btn--control']);
  }
  hasClasses(q(container, '[data-dir="odebrane"]'), ['arkmail-contact-dir']);
  hasClasses(q(container, '[data-arch-add-book]'), ['arkmail-contact-addbook']);
});

test('4.8: Zaznacz wszystkie i Odznacz wszystkie sa zwyklymi kontrolkami', () => {
  const store = new MailUiStore({ tab: 'kontakty', people: ['Corge'] });
  const { container } = mount(store);
  openContactSub(container, 'Ksiazka adresowa');
  for (const selector of ['[data-book-select-all]', '[data-book-deselect-all]']) {
    const button = q(container, selector);
    hasClasses(button, ['popup-btn', 'popup-btn--control']);
    assert.equal(button.classList.contains('popup-btn--danger'), false);
    assert.equal(button.getAttribute('data-armed'), null);
  }
});

test('4.4: import aliasow jest w Aliasach, a Import i eksport zachowuje pozostale operacje', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  const { container, calls } = mount(store);
  openContactSub(container, 'Aliasy pocztowe');
  const importAliases = q(container, '#arkmail-contact-panel-aliasy [data-import="aliasy"]');
  assert.equal(importAliases.textContent, 'Importuj aliasy pocztowe');
  click(importAliases);
  assert.equal(calls.filter((call) => call.name === 'import-aliases').length, 1);
  openContactSub(container, 'Import i eksport');
  assert.equal(maybe(container, '[data-import="aliasy"]'), null);
  for (const selector of [
    '[data-import="zapamietani"]',
    '[data-import="przedstawieni"]',
    '[data-book-export]',
    '[data-book-import-trigger]',
  ]) assert.ok(maybe(container, selector), selector);
});

test('4.5/4.6: Grupy, Aliasy i czyszczenie Ksiazki maja wspolna dolna strefe', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setGroups([{ name: 'Patrol', members: [] }]);
  const { container } = mount(store);
  for (const [sub, panelId, selector] of [
    ['Grupy', 'arkmail-contact-panel-grupy', '[data-groups-delete-all]'],
    ['Aliasy pocztowe', 'arkmail-contact-panel-aliasy', '[data-aliases-clear]'],
    ['Import i eksport', 'arkmail-contact-panel-importeksport', '[data-book-clear-all]'],
  ] as const) {
    openContactSub(container, sub);
    const button = q(container, selector);
    const zone = button.parentElement as unknown as TestElement;
    assert.ok(zone.classList.contains('arkmail-destructive-zone'), `${sub}: strefa`);
    assert.equal(zone.id, '', `${sub}: strefa nie jest osobnym tabpanelem`);
    assert.equal(zone.parentElement?.id, panelId, `${sub}: strefa w podpanelu`);
    assert.equal(zone.parentElement?.lastElementChild, zone, `${sub}: strefa na koncu`);
    hasClasses(button, ['popup-btn--danger', 'popup-btn--ghost']);
  }
  assert.equal(q(container, '[data-book-clear-all]').textContent, 'Wyczysc cala ksiazke i aliasy');
});

function ruleBody(selectorRe: RegExp): string {
  const match = STYLES.match(new RegExp(`${selectorRe.source}[^{]*\\{([^}]*)\\}`, 'm'));
  assert.ok(match, `regula istnieje: ${selectorRe.source}`);
  return match[1];
}

test('4.2: lista osob uzywa dostepnej wysokosci bez sztywnych 240px', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const { container } = mount(store);
  openArchiveSub(container, 'Osoby z listow');
  const panel = q(container, '[data-arch-people]');
  hasClasses(panel, ['arkmail-arch-people-panel']);
  const panelStyle = ruleBody(/\.arkmail-arch-people-panel\b/);
  assert.match(panelStyle, /display:\s*flex/);
  assert.match(panelStyle, /flex-direction:\s*column/);
  assert.match(panelStyle, /flex:\s*1/);
  assert.match(panelStyle, /min-height:\s*0/);
  const controls = ruleBody(/\.arkmail-arch-people-panel\s+\.arkmail-contact-controls\b/);
  assert.match(controls, /flex:\s*none/);
  const list = ruleBody(/\.arkmail-arch-people-list\b/);
  assert.doesNotMatch(list, /240px|max-height/);
  assert.match(list, /flex:\s*1/);
  assert.match(list, /min-height:\s*0/);
  assert.match(list, /overflow-y:\s*auto/);
});

test('S24-S27: widok Osob uzywa precyzyjnych tekstow i separatora aliasu', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const { container } = mount(store);
  openArchiveSub(container, 'Osoby z listow');
  assert.match(container.textContent ?? '', /Osoby z listow powstaja z listow zebranych ze wszystkich skrzynek\./);
  assert.match(container.textContent ?? '', /Brak osob z listow - pojawia sie po pobraniu skrzynek\./);
  assert.equal(qa(container, '.arkmail-contact-sort option')[2].textContent, 'Ostatni list');
  store.setContacts([contact()]);
  assert.equal(q(container, '.arkmail-contact-name').getAttribute('title'), 'Pokaz listy tej osoby w archiwum.');
  assert.equal(q(container, '.arkmail-contact-stats').textContent, '(odebrane: 2, wyslane: 1) | alias: AliasTest');
  setInput(q(container, '[data-filter="kontakty"]'), 'NieMa');
  assert.match(container.textContent ?? '', /Zadna osoba nie pasuje do filtra\./);
});

test('S33/S37-S40: Archiwum i Listy maja poprawione komunikaty', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const { container } = mount(store);
  resetArchive(container);
  assert.match(container.textContent ?? '', /Archiwum jest puste albo zaden list nie pasuje do filtra\./);
  store.setTab('listy');
  assert.equal(
    q(container, '.arkmail-search-go').getAttribute('title'),
    'Szuka listow po wpisanych filtrach. Przy pustych filtrach odswieza wybrana skrzynke.',
  );
  assert.equal(
    q(container, '[data-search="osoba"]').getAttribute('title'),
    'Wpisz szukana fraze w dopelniaczu (kogo? czego?).',
  );
  assert.match(container.textContent ?? '', /Skrzynka nie zaladowana - kliknij jej nazwe, aby ja pobrac\./);
  store.applyMailbox('odebrane', { kind: 'pusta', box: 'odebrane', reason: 'puste' });
  assert.match(container.textContent ?? '', /Skrzynka jest pusta\./);
});

test('S41-S43: tooltips filtrow, nazwa zakladki Napisz list i eksport TXT', () => {
  const store = new MailUiStore({ tab: 'kontakty', people: ['Corge'] });
  const { container } = mount(store);
  openContactSub(container, 'Ksiazka adresowa');
  assert.equal(
    q(container, '[data-book-filter-clear]').getAttribute('title'),
    'Czysci filtr imion i pokazuje cala ksiazke adresowa.',
  );
  assert.equal(
    q(container, '[data-book-write]').getAttribute('title'),
    'Otwiera zakladke Napisz list z adresem: Corge.',
  );
  openContactSub(container, 'Grupy');
  assert.equal(
    q(container, '[data-group-filter-clear]').getAttribute('title'),
    'Czysci filtr grup i pokazuje wszystkie grupy.',
  );
  const source = readFileSync(join(__dirname, '..', '..', 'src/arkmail/ui/render.ts'), 'utf8');
  assert.doesNotMatch(source, /Otwiera zakladke Napisz z/);
  assert.match(source, /Otwiera zakladke Napisz list z/);
  assert.match(source, /Zapisz list jako TXT/);
  assert.doesNotMatch(source, /Zapisz list TXT/);
});
