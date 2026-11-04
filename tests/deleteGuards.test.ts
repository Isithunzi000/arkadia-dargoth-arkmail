/**
 * Konwencja guardow klawiszy usuwajacych (zgloszenie live 2026-11-05,
 * decyzja D7):
 *  - kazdy klawisz usuwajacy ma poziom danger (jedna kolorystyka);
 *  - klawisze z napisem: dwuklik z wygasnieciem 3 s, pierwszy klik
 *    zmienia etykiete na "Na pewno usunac?";
 *  - klawisze X: dwuklik z wygasnieciem 3 s, po pierwszym kliku
 *    data-armed="1" (regula CSS w styles.ts daje czerwone tlo) i
 *    tooltip "Kliknij ponownie, aby usunac" - zadnego kasowania od
 *    pierwszego klika;
 *  - ESC rozbraja kazde uzbrojenie w oknie (nie tylko zakladke
 *    Usuwanie).
 * Imiona syntetyczne (Fred/Grault/Corge - dozwolone przez guardy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { STYLES } from '../src/arkmail/ui/styles';
import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const window = new Window();
const document = window.document;

interface Calls {
  people: string[][];
  groups: string[][];
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Calls = { people: [], groups: [] };
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
    onSavePeople: (people) => {
      calls.people.push([...people]);
      store.setPeople(people);
    },
    onSaveGroups: (groups) => {
      calls.groups.push(groups.map((g) => `${g.name}=${g.members.join('+')}`));
      store.setGroups(groups);
    },
  });
  return { container: container as unknown as GuardRoot, calls };
}

interface GuardRoot {
  querySelector(s: string): unknown;
  querySelectorAll(s: string): Iterable<unknown>;
}

const q = (root: GuardRoot, selector: string): unknown => root.querySelector(selector);
const qa = (root: GuardRoot, selector: string): unknown[] => Array.from(root.querySelectorAll(selector));
const click = (el: unknown): void => (el as { click(): void }).click();

/** Klik w pigulke sekcji Kontaktow (Ksiazka adresowa / Grupy). */
const switchSub = (root: GuardRoot, label: string): void => {
  for (const pill of qa(root, '.arkmail-subpill')) {
    if ((pill as { textContent?: string }).textContent === label) {
      click(pill);
      return;
    }
  }
  assert.fail(`brak sub-pigulki: ${label}`);
};

const classesOf = (el: unknown): string[] =>
  ((el as { className?: string }).className ?? '').split(' ');

test('guardy: klawisze usuwajace z napisem maja poziom danger', () => {
  const book = mount(new MailUiStore({ tab: 'kontakty', people: ['Fred'] }));
  assert.ok(
    classesOf(q(book.container, '[data-book-delete-checked]')).includes('arkmail-btn-danger'),
    'Usun zaznaczone imiona: danger',
  );
  const groups = mount(
    new MailUiStore({ tab: 'kontakty', groups: [{ name: 'Gildia', members: ['Fred'] }] }),
  );
  switchSub(groups.container, 'Grupy');
  assert.ok(
    classesOf(q(groups.container, '[data-group-delete]')).includes('arkmail-btn-danger'),
    'Usun grupe: danger',
  );
  assert.ok(
    classesOf(q(groups.container, '[data-groups-delete-all]')).includes('arkmail-btn-danger'),
    'Usun wszystkie grupy: danger',
  );
});

test('guardy: klawisze X maja poziom danger', () => {
  const book = mount(new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] }));
  for (const x of qa(book.container, '[data-book-remove]')) {
    assert.ok(classesOf(x).includes('arkmail-btn-danger'), 'X ksiazki: danger');
  }
  const groups = mount(
    new MailUiStore({ tab: 'kontakty', groups: [{ name: 'Gildia', members: ['Fred'] }] }),
  );
  switchSub(groups.container, 'Grupy');
  for (const x of qa(groups.container, '[data-member-remove]')) {
    assert.ok(classesOf(x).includes('arkmail-btn-danger'), 'X czlonka grupy: danger');
  }
});

test('guardy: X ksiazki usuwa dopiero z drugiego klika', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container, calls } = mount(s);
  const x = q(container, '[data-book-remove]') as HTMLElement & { click(): void };
  click(x);
  assert.equal(calls.people.length, 0, 'pierwszy klik nie kasuje');
  // Po uzbrojeniu render przemalowuje - szukamy na swiezym drzewie.
  const armed = q(container, '[data-book-remove][data-armed="1"]');
  assert.ok(armed, 'uzbrojony X ma data-armed="1"');
  click(q(container, '[data-book-remove][data-armed="1"]'));
  assert.deepEqual(calls.people, [['Grault']], 'drugi klik kasuje imie');
});

test('guardy: X czlonka grupy usuwa dopiero z drugiego klika', () => {
  const s = new MailUiStore({
    tab: 'kontakty',
    groups: [{ name: 'Gildia', members: ['Fred', 'Grault'] }],
  });
  const { container, calls } = mount(s);
  switchSub(container, 'Grupy');
  click(qa(container, '[data-member-remove]')[1]);
  assert.equal(calls.groups.length, 0, 'pierwszy klik nie kasuje');
  assert.ok(q(container, '[data-member-remove][data-armed="1"]'), 'uzbrojony X ma data-armed');
  click(q(container, '[data-member-remove][data-armed="1"]'));
  assert.deepEqual(calls.groups, [['Gildia=Fred']], 'drugi klik zdejmuje czlonka');
});

test('guardy: styles.ts ma czerwona regule dla uzbrojonego klawisza', () => {
  const m = STYLES.match(/\[data-armed="1"\]\s*\{([^}]*)\}/);
  assert.ok(m, 'regula [data-armed="1"] istnieje');
  assert.match(m![1]!, /#b04a42/, 'uzbrojony klawisz ma kolor danger');
});

test('guardy: ESC rozbraja uzbrojony X', () => {
  const s = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault'] });
  const { container, calls } = mount(s);
  click(q(container, '[data-book-remove]'));
  assert.ok(q(container, '[data-book-remove][data-armed="1"]'), 'uzbrojony');
  (document as unknown as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape' }),
  );
  assert.equal(q(container, '[data-book-remove][data-armed="1"]'), null, 'ESC rozbral');
  // Klik po ESC znowu tylko uzbraja - kasowanie nie przechodzi.
  click(q(container, '[data-book-remove]'));
  assert.equal(calls.people.length, 0, 'klik po ESC nie kasuje');
});
