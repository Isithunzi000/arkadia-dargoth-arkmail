/**
 * Fala UI-2 krok 3: widok Grupy w zakladce Kontakty.
 * Sub-pigulki Osoby/Grupy (klasy .arkmail-boxes, zero nowych kolorow),
 * pelny CRUD grup (zmiana nazwy z walidacja kolizji, usuwanie czlonka,
  * dokladanie czlonka z ghosta, uzbrojone usuwanie), eksport/import
 * JSON ksiazki adresowej. Format v2 (imiona + grupy, bez aliasow);
 * pliki v1 czytane wstecz (suma pul). Kolizja nazw grup NIE dostaje
 * suffixu - scalanie robi mergeAddressBook. Imiona syntetyczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { parseAddressBookExport } from '../src/arkmail/core/addressBook';
import { setDownloadImpl } from '../src/arkmail/ui/download';

const window = new Window();
const document = window.document;

interface Calls {
  groups: string[][];
  imports: unknown[];
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Calls = { groups: [], imports: [] };
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
    // UI), wiec render pracuje na swiezej liscie grup.
    onSaveGroups: (groups) => {
      calls.groups.push(groups.map((g) => `${g.name}=${g.members.join('+')}`));
      store.setGroups(groups);
    },
    onImportAddressBook: (data) => calls.imports.push(data),
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

const switchToGrupy = (container: unknown): void => {
  click(qa(container, '.arkmail-subpill')[1]);
};

const type = (el: unknown, value: string): void => {
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new window.Event('input') as unknown as Event);
};

// --- eksport/import JSON ----------------------------------------------------

test('ksiazka: eksport/import JSON v2 1:1', () => {
  const data = {
    format: 'arkmail-addressbook',
    version: 2,
    people: ['Corge'],
    groups: [{ name: 'Gildia', members: ['Fred', 'Grault'] }],
  };
  assert.deepEqual(parseAddressBookExport(JSON.stringify(data)), {
    people: ['Corge'],
    groups: data.groups,
  });
});

test('ksiazka: zly format albo uszkodzony JSON odrzucane', () => {
  assert.equal(parseAddressBookExport('{"format":"inny","version":2}'), null);
  assert.equal(parseAddressBookExport('nie-json'), null);
  assert.equal(parseAddressBookExport('{"format":"arkmail-addressbook"}'), null, 'brak wersji odrzucony');
});

test('ksiazka: plik v1 czytany wstecz - suma pul, aliasy ignorowane', () => {
  const parsed = parseAddressBookExport(
    JSON.stringify({
      format: 'arkmail-addressbook',
      version: 1,
      groups: [{ name: 'Gildia', members: ['Fred'] }],
      importedPeople: { zapamietani: ['Corge'], przedstawieni: ['Waldo'] },
      importedAliases: [{ name: 'zgromadzenie', targets: ['Fred'] }],
    }),
  );
  assert.deepEqual(parsed, {
    people: ['Corge', 'Waldo'],
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
});

// --- store -------------------------------------------------------------------

test('grupy: stan grup w store, wipe ich nie tyka', () => {
  const s = new MailUiStore();
  assert.deepEqual(s.state.groups, [], 'domyslnie pusto');
  s.setGroups([{ name: 'Gildia', members: ['Fred'] }]);
  s.clearCacheData();
  assert.deepEqual(s.state.groups, [{ name: 'Gildia', members: ['Fred'] }]);
});

// --- widok -------------------------------------------------------------------

test('grupy: sub-pigulki Osoby/Grupy w zakladce Kontakty', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container } = mount(s);
  const pills = qa(container, '.arkmail-subpill');
  assert.deepEqual(pills.map(text), ['Osoby', 'Grupy']);
  assert.ok(q(container, '[data-import]'), 'domyslnie Osoby: przyciski importu widoczne');
  assert.ok(!q(container, '[data-group-add]'), 'domyslnie Grupy: formularz ukryty');
});

test('grupy: przełączanie sub-pigulek', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container } = mount(s);
  const grupy = qa(container, '.arkmail-subpill')[1];
  click(grupy);
  assert.ok(q(container, '[data-group-add]'), 'po kliku Grupy: formularz widoczny');
  const osoby = qa(container, '.arkmail-subpill')[0];
  click(osoby);
  assert.ok(q(container, '[data-import]'), 'powrot do Osoby');
});

test('grupy: dodanie grupy wywoluje zapis, pusta nazwa odrzucana', () => {
  const s = new MailUiStore({ tab: 'kontakty' });
  const { container, calls } = mount(s);
  switchToGrupy(container);
  type(q(container, '[data-group-add]'), '   ');
  click(q(container, '[data-group-create]'));
  assert.equal(calls.groups.length, 0, 'pusta nazwa: bez zapisu');
  type(q(container, '[data-group-add]'), 'Gildia');
  click(q(container, '[data-group-create]'));
  assert.deepEqual(calls.groups, [['Gildia=']], 'grupa utworzona pusta');
});

test('grupy: zmiana nazwy z walidacja kolizji', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [
      { name: 'Gildia', members: ['Fred'] },
      { name: 'Patrol', members: ['Corge'] },
    ],
  });
  const { container, calls } = mount(s);
  switchToGrupy(container);
  const rename = q(container, '[data-group-rename]') as HTMLInputElement;
  type(rename, 'Patrol');
  click(q(container, '[data-group-rename-ok]'));
  assert.equal(calls.groups.length, 0, 'kolizja nazw: bez zapisu');
  assert.ok(
    text(q(container, '[data-group-error]')).length > 3,
    'komunikat walidacji widoczny',
  );
  type(rename, 'Rada');
  click(q(container, '[data-group-rename-ok]'));
  assert.deepEqual(calls.groups, [['Rada=Fred', 'Patrol=Corge']]);
});

test('grupy: usuniecie czlonka i dodanie z ghosta', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred', 'Grault'] }],
    people: ['Corge'],
  });
  const { container, calls } = mount(s);
  switchToGrupy(container);
  click(qa(container, '[data-member-remove]')[1]);
  assert.deepEqual(calls.groups, [['Gildia=Fred']], 'Grault odpada');
  const add = q(container, '[data-member-add]') as HTMLInputElement;
  type(add, 'cor');
  add.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }) as unknown as Event);
  click(q(container, '[data-member-add-ok]'));
  assert.deepEqual(calls.groups.at(-1), ['Gildia=Fred+Corge'], 'Corge z ghosta dolacza');
});

test('grupy: usuniecie grupy i wszystkich grup - uzbrojone potwierdzenie', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [
      { name: 'Gildia', members: ['Fred'] },
      { name: 'Patrol', members: ['Corge'] },
    ],
  });
  const { container, calls } = mount(s);
  switchToGrupy(container);
  // Pierwszy klik uzbraja, drugi kasuje.
  const del = qa(container, '[data-group-delete]')[0];
  click(del);
  assert.equal(calls.groups.length, 0, 'pierwszy klik tylko uzbraja');
  click(del);
  assert.deepEqual(calls.groups, [['Patrol=Corge']], 'Gildia skasowana');
  // Wszystkie grupy: tez uzbrojone.
  const delAll = q(container, '[data-groups-delete-all]');
  click(delAll);
  assert.equal(calls.groups.length, 1, 'pierwszy klik tylko uzbraja');
  click(delAll);
  assert.deepEqual(calls.groups.at(-1), [], 'wszystkie grupy skasowane');
});

test('grupy: eksport JSON przez pobieranie pliku', async () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
  const downloads: Array<[string, string]> = [];
  setDownloadImpl((name, blob) => {
    void blob.text().then((t) => downloads.push([name, t]));
  });
  try {
    const { container } = mount(s);
  switchToGrupy(container);
    click(q(container, '[data-book-export]'));
    await new Promise((r) => setImmediate(r));
    assert.equal(downloads.length, 1);
    assert.match(downloads[0][0], /arkmail-adresy/i);
    const parsed = JSON.parse(downloads[0][1]);
    assert.equal(parsed.format, 'arkmail-addressbook');
    assert.equal(parsed.version, 2);
    assert.deepEqual(parsed.people, []);
    assert.deepEqual(parsed.groups, [{ name: 'Gildia', members: ['Fred'] }]);
  } finally {
    setDownloadImpl(null);
  }
});

test('grupy: import JSON wywoluje handler z danymi', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred'] }],
  });
  const { container, calls } = mount(s);
  switchToGrupy(container);
  const fileInput = q(container, '[data-book-import]') as HTMLInputElement;
  const payload = JSON.stringify({
    format: 'arkmail-addressbook',
    version: 2,
    people: ['Corge'],
    groups: [{ name: 'Gildia', members: ['Grault'] }],
  });
  const file = new window.File([payload], 'adresy.json', { type: 'application/json' });
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new window.Event('change') as unknown as Event);
  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    assert.equal(calls.imports.length, 1, 'handler wywolany');
    const data = calls.imports[0] as { groups: Array<{ name: string }>; people: string[] };
    assert.equal(data.groups[0].name, 'Gildia', 'bez suffixu - kolizje scala mergeAddressBook');
    assert.deepEqual(data.people, ['Corge']);
  });
});
