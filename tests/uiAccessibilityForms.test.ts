/**
 * Etap 8: bezpieczny fokus, natywne klasy, klawiatura formularzy,
 * semantyka zakladek, statusy oraz pelna walidacja szerokosci compose.
 * Wszystkie nazwy sa syntetyczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { ContactGroup } from '../src/arkmail/core/addressBook';

const window = new Window();
const document = window.document;

type Call = { name: string; args: unknown[] };
type TestElement = HTMLElement & {
  value: string;
  checked: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  setSelectionRange(start: number, end: number): void;
};

function mount(store: MailUiStore): {
  container: HTMLElement;
  calls: Call[];
  off: () => void;
} {
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
    onForwardLetter: rec('forward'),
    onSaveGroups: rec('groups'),
    onAddGroupMember: rec('member'),
    onDeletionSearch: rec('deletion-search'),
  } as unknown as MailUiHandlers);
  return { container, calls, off };
}

function cleanup(off: () => void, container: HTMLElement): void {
  off();
  container.remove();
}

const q = (root: ParentNode, selector: string): TestElement => {
  const element = root.querySelector(selector) as unknown as TestElement | null;
  assert.ok(element, `element istnieje: ${selector}`);
  return element;
};
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
const press = (element: TestElement, key: string): KeyboardEvent => {
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event as unknown as Event);
  return event as unknown as KeyboardEvent;
};
const callsNamed = (calls: Call[], name: string): Call[] =>
  calls.filter((call) => call.name === name);

function openGroups(container: ParentNode): void {
  click(byText(container, '.arkmail-subpill', 'Grupy'));
}

function groupStore(groups: ContactGroup[]): MailUiStore {
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setGroups(groups);
  return store;
}

test('T3: fokus checkboxa przetrwa repaint dla znakow specjalnych w nazwie', () => {
  for (const name of ['A"B', 'A\\B', 'A[B', 'A]B']) {
    const store = new MailUiStore({ tab: 'kontakty' });
    store.setPeople([name]);
    const { container, off } = mount(store);
    try {
      const checkbox = q(container, '[data-book-check]');
      checkbox.focus();
      checkbox.checked = true;
      checkbox.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
      const active = document.activeElement as unknown as TestElement | null;
      assert.equal(active?.getAttribute('data-book-check'), name, `fokus: ${name}`);
      assert.equal(active?.checked, true, `zaznaczenie: ${name}`);
    } finally {
      cleanup(off, container);
    }
  }
});

test('T3: repaint zachowuje wartosc i zaznaczenie karetki pola', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, off } = mount(store);
  try {
    const input = q(container, '[data-search="temat"]');
    setInput(input, 'ABCD');
    input.focus();
    input.setSelectionRange(1, 3);
    store.refresh();
    const active = document.activeElement as unknown as TestElement | null;
    assert.equal(active?.getAttribute('data-search'), 'temat');
    assert.equal(active?.value, 'ABCD');
    assert.equal(active?.selectionStart, 1);
    assert.equal(active?.selectionEnd, 3);
  } finally {
    cleanup(off, container);
  }
});

test('T3: repaint zachowuje fokus i karetke wszystkich pol Kontaktow', () => {
  const checkFocus = (
    container: HTMLElement,
    store: MailUiStore,
    selector: string,
    attribute: string,
    expectedKey: string,
    index = 0,
  ): void => {
    const input = qa(container, selector)[index];
    assert.ok(input, `pole istnieje: ${selector}[${index}]`);
    input.value = 'ABCD';
    input.focus();
    input.setSelectionRange(1, 3);
    store.refresh();
    const active = document.activeElement as unknown as TestElement | null;
    assert.equal(active?.getAttribute(attribute), expectedKey, `fokus: ${selector}[${index}]`);
    assert.equal(active?.value, 'ABCD', `wartosc: ${selector}[${index}]`);
    assert.equal(active?.selectionStart, 1, `poczatek karetki: ${selector}[${index}]`);
    assert.equal(active?.selectionEnd, 3, `koniec karetki: ${selector}[${index}]`);
  };

  const book = new MailUiStore({ tab: 'kontakty' });
  book.setPeople(['Testalpha']);
  const first = mount(book);
  try {
    checkFocus(first.container, book, '[data-book-filter]', 'data-book-filter', '');
    checkFocus(first.container, book, '[data-book-new]', 'data-book-new', '');
  } finally {
    cleanup(first.off, first.container);
  }

  const groups = groupStore([
    { name: 'RadaA', members: [] },
    { name: 'RadaB', members: [] },
  ]);
  const second = mount(groups);
  try {
    openGroups(second.container);
    checkFocus(second.container, groups, '[data-group-filter]', 'data-group-filter', '');
    checkFocus(second.container, groups, '[data-group-add]', 'data-group-add', '');
    click(qa(second.container, '[data-group-toggle]')[0]);
    click(qa(second.container, '[data-group-toggle]')[1]);
    checkFocus(second.container, groups, '[data-group-rename]', 'data-group-rename', 'RadaB', 1);
    checkFocus(second.container, groups, '[data-member-add]', 'data-member-add', 'RadaB', 1);
  } finally {
    cleanup(second.off, second.container);
  }
});

test('T6: select Usuwania i pole Tresc zachowuja natywne klasy', () => {
  const deletion = new MailUiStore({ tab: 'usuwanie' });
  const first = mount(deletion);
  try {
    const box = q(first.container, '.arkmail-deletion-box');
    assert.ok(box.classList.contains('popup-input'));
    assert.ok(box.classList.contains('popup-input--control'));
  } finally {
    cleanup(first.off, first.container);
  }
  const compose = new MailUiStore({ tab: 'napisz' });
  const second = mount(compose);
  try {
    const body = q(second.container, '[data-field="tresc"]');
    assert.ok(body.classList.contains('popup-input'));
    assert.ok(body.classList.contains('popup-input--control'));
  } finally {
    cleanup(second.off, second.container);
  }
});

test('T12: Enter tworzy grupe dokladnie raz i uzywa walidacji klawisza', () => {
  const store = groupStore([]);
  const { container, calls, off } = mount(store);
  try {
    openGroups(container);
    const input = q(container, '[data-group-add]');
    press(input, 'Enter');
    assert.equal(q(container, '[data-group-error]').textContent, 'Podaj nazwe grupy.');
    assert.equal(callsNamed(calls, 'groups').length, 0);
    setInput(input, 'Patrol');
    press(input, 'Enter');
    const groups = callsNamed(calls, 'groups');
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].args[0], [{ name: 'Patrol', members: [] }]);
  } finally {
    cleanup(off, container);
  }
});

test('T12: Enter zapisuje nowa nazwe grupy dokladnie raz', () => {
  const store = groupStore([{ name: 'Patrol', members: [] }]);
  const { container, calls, off } = mount(store);
  try {
    openGroups(container);
    click(q(container, '[data-group-toggle]'));
    const input = q(container, '[data-group-rename]');
    setInput(input, 'Rada');
    press(input, 'Enter');
    const groups = callsNamed(calls, 'groups');
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].args[0], [{ name: 'Rada', members: [] }]);
  } finally {
    cleanup(off, container);
  }
});

test('T12: Enter dodaje czlonka grupy dokladnie raz', () => {
  const store = groupStore([{ name: 'Patrol', members: [] }]);
  const { container, calls, off } = mount(store);
  try {
    openGroups(container);
    click(q(container, '[data-group-toggle]'));
    const input = q(container, '[data-member-add]');
    setInput(input, 'Fred');
    press(input, 'Enter');
    const additions = callsNamed(calls, 'member');
    assert.equal(additions.length, 1);
    assert.deepEqual(additions[0].args, ['Patrol', 'Fred']);
  } finally {
    cleanup(off, container);
  }
});

test('T12: Enter przekazuje list dokladnie raz', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const source = {
    number: 1,
    isRead: true,
    subject: 'Temat',
    forwarded: false,
    party: 'Fred',
    partyKind: 'nadawca',
    date: null,
    ctx: { query: null, anchor: 1 },
  };
  store.openLetter(
    'odebrane',
    { number: 1, from: 'Fred', subject: 'Temat', to: 'Grault', cc: null, date: null, body: ['Tresc'] },
    source as never,
  );
  const { container, calls, off } = mount(store);
  try {
    const input = q(container, '[data-field="forward"]');
    setInput(input, 'Corge');
    press(input, 'Enter');
    const forwarded = callsNamed(calls, 'forward');
    assert.equal(forwarded.length, 1);
    assert.deepEqual(forwarded[0].args, ['odebrane', source, 'Corge']);
  } finally {
    cleanup(off, container);
  }
});

test('T12: Enter w filtrze Usuwania uruchamia jedno wyszukiwanie', () => {
  const store = new MailUiStore({ tab: 'usuwanie' });
  const { container, calls, off } = mount(store);
  try {
    const input = q(container, '[data-deletion-filter="osoba"]');
    setInput(input, 'Fred');
    press(input, 'Enter');
    const searches = callsNamed(calls, 'deletion-search');
    assert.equal(searches.length, 1);
    assert.deepEqual(searches[0].args, ['odebrane', { osoba: 'Fred' }]);
  } finally {
    cleanup(off, container);
  }
});

test('T12: Enter w compose nie wysyla listu, a textarea zachowuje domyslny klawisz', () => {
  const store = new MailUiStore({ tab: 'napisz' });
  const { container, calls, off } = mount(store);
  try {
    setInput(q(container, '[data-field="adresat"]'), 'Fred');
    setInput(q(container, '[data-field="temat"]'), 'Temat');
    setInput(q(container, '[data-field="tresc"]'), 'Tresc');
    press(q(container, '[data-field="adresat"]'), 'Enter');
    press(q(container, '[data-field="temat"]'), 'Enter');
    const bodyEvent = press(q(container, '[data-field="tresc"]'), 'Enter');
    assert.equal(bodyEvent.defaultPrevented, false);
    assert.equal(callsNamed(calls, 'send').length, 0);
  } finally {
    cleanup(off, container);
  }
});

test('T13: kazde pole compose ma unikalny identyfikator i powiazany label', () => {
  const store = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(store);
  try {
    const expected = new Map([
      ['adresat', 'Adresat'],
      ['temat', 'Temat'],
      ['dw', 'DW (opcjonalnie)'],
      ['szablon', 'Szablon'],
      ['szerokosc', 'Szerokosc linii (20-120)'],
      ['tresc', 'Tresc'],
    ]);
    const ids = new Set<string>();
    for (const [field, label] of expected) {
      const input = q(container, `[data-field="${field}"]`);
      const id = input.id;
      assert.ok(id.length > 0, `${field}: identyfikator`);
      assert.ok(!ids.has(id), `${field}: identyfikator unikalny`);
      ids.add(id);
      const labels = qa(container, 'label').filter((candidate) => candidate.getAttribute('for') === id);
      assert.equal(labels.length, 1, `${field}: jeden label`);
      assert.equal(labels[0].textContent, label);
    }
  } finally {
    cleanup(off, container);
  }
});

test('T13: glowne zakladki maja kompletna semantyke i panel', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, off } = mount(store);
  try {
    assert.equal(q(container, '.arkmail-tabs').getAttribute('role'), 'tablist');
    const tabs = qa(container, '.arkmail-tab');
    assert.equal(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length, 1);
    const panels = qa(container, '[role="tabpanel"]');
    assert.equal(panels.length, 1);
    for (const tab of tabs) {
      assert.equal(tab.getAttribute('role'), 'tab');
      assert.ok(tab.id.length > 0);
      assert.equal(tab.getAttribute('tabindex'), tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      if (tab.getAttribute('aria-selected') === 'true') {
        assert.equal(tab.getAttribute('aria-controls'), panels[0].id);
        assert.equal(panels[0].getAttribute('aria-labelledby'), tab.id);
      }
    }
  } finally {
    cleanup(off, container);
  }
});

test('T13: strzalki, Home i End zmieniaja glowna zakladke oraz fokus po repaint', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, off } = mount(store);
  try {
    q(container, '[data-tab="listy"]').focus();
    press(document.activeElement as unknown as TestElement, 'ArrowRight');
    assert.equal(store.state.tab, 'napisz');
    assert.equal((document.activeElement as unknown as TestElement).getAttribute('data-tab'), 'napisz');
    press(document.activeElement as unknown as TestElement, 'End');
    assert.equal(store.state.tab, 'usuwanie');
    assert.equal((document.activeElement as unknown as TestElement).getAttribute('data-tab'), 'usuwanie');
    press(document.activeElement as unknown as TestElement, 'Home');
    assert.equal(store.state.tab, 'listy');
    press(document.activeElement as unknown as TestElement, 'ArrowLeft');
    assert.equal(store.state.tab, 'usuwanie');
    press(document.activeElement as unknown as TestElement, 'ArrowRight');
    assert.equal(store.state.tab, 'listy');
    assert.equal((document.activeElement as unknown as TestElement).getAttribute('data-tab'), 'listy');
  } finally {
    cleanup(off, container);
  }
});

test('T13: podzakladki Kontaktow maja semantyke, klawiature i fokus', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  const { container, off } = mount(store);
  try {
    const list = q(container, '.arkmail-boxes');
    assert.equal(list.getAttribute('role'), 'tablist');
    const pills = qa(container, '.arkmail-subpill');
    assert.equal(pills.filter((pill) => pill.getAttribute('aria-selected') === 'true').length, 1);
    const active = pills.find((pill) => pill.getAttribute('aria-selected') === 'true')!;
    const panel = qa(container, '[role="tabpanel"]').find(
      (candidate) => candidate.id === active.getAttribute('aria-controls'),
    );
    assert.ok(panel, 'aktywna podzakladka wskazuje panel');
    assert.equal(panel.getAttribute('aria-labelledby'), active.id);
    active.focus();
    press(document.activeElement as unknown as TestElement, 'ArrowRight');
    let focused = document.activeElement as unknown as TestElement;
    assert.equal(focused.textContent, 'Aliasy pocztowe');
    press(focused, 'End');
    focused = document.activeElement as unknown as TestElement;
    assert.equal(focused.textContent, 'Import i eksport');
    press(focused, 'Home');
    focused = document.activeElement as unknown as TestElement;
    assert.equal(focused.textContent, 'Ksiazka adresowa');
  } finally {
    cleanup(off, container);
  }
});

test('T13: podzakladki Archiwum maja semantyke i obsluguja strzalke', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const { container, off } = mount(store);
  try {
    const pills = qa(container, '.arkmail-subpill');
    assert.equal(pills.length, 2);
    for (const pill of pills) assert.equal(pill.getAttribute('role'), 'tab');
    const active = pills.find((pill) => pill.getAttribute('aria-selected') === 'true')!;
    active.focus();
    press(active, 'ArrowRight');
    const focused = document.activeElement as unknown as TestElement;
    assert.equal(focused.textContent, 'Osoby z listow');
    assert.equal(focused.getAttribute('aria-selected'), 'true');
    const panel = qa(container, '[role="tabpanel"]').find(
      (candidate) => candidate.id === focused.getAttribute('aria-controls'),
    );
    assert.ok(panel, 'podpanel Osoby z listow istnieje');
  } finally {
    cleanup(off, container);
  }
});

test('T13: status i pasek pobierania maja zywe semantyki oraz aktualna wartosc', () => {
  const store = new MailUiStore({ tab: 'listy' });
  const { container, off } = mount(store);
  try {
    store.setBusy('Pobieram tresci do archiwum...');
    store.setArchiveDownload({ done: 2, total: 5, etaMs: 9000 });
    const busy = q(container, '.arkmail-busy');
    assert.equal(busy.getAttribute('role'), 'status');
    assert.equal(busy.getAttribute('aria-live'), 'polite');
    assert.equal(busy.getAttribute('aria-atomic'), 'true');
    const track = q(container, '.arkmail-busy-track');
    assert.equal(track.getAttribute('role'), 'progressbar');
    assert.equal(track.getAttribute('aria-valuemin'), '0');
    assert.equal(track.getAttribute('aria-valuemax'), '100');
    assert.equal(track.getAttribute('aria-valuenow'), '40');
    store.setArchiveDownload({ done: 4, total: 5, etaMs: 3000 });
    assert.equal(q(container, '.arkmail-busy-track').getAttribute('aria-valuenow'), '80');
  } finally {
    cleanup(off, container);
  }
});

test('T13: ikonowy przycisk usuwania oglasza tekstowo uzbrojenie i rozbrojenie', () => {
  const store = groupStore([{ name: 'Patrol', members: ['Fred'] }]);
  const { container, off } = mount(store);
  try {
    openGroups(container);
    click(q(container, '[data-group-toggle]'));
    const button = q(container, '[data-member-remove]');
    const initial = button.getAttribute('aria-label');
    assert.ok(initial && initial.includes('Fred'), 'przycisk ma tekstowa nazwe');
    click(button);
    const armed = button.getAttribute('aria-label') ?? '';
    assert.ok(armed.includes('Fred'));
    assert.match(armed, /ponownie|potwierdz/i);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(button.getAttribute('aria-label'), initial);
  } finally {
    cleanup(off, container);
  }
});

test('T23: bledny zapis szerokosci nie zmienia ustawienia i pokazuje komunikat', () => {
  const store = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(store);
  try {
    const input = q(container, '[data-field="szerokosc"]');
    for (const value of ['60abc', '', '60.5', '19', '121']) {
      const before = store.state.composeWidth;
      change(input, value);
      assert.equal(store.state.composeWidth, before, `bez zapisu: "${value}"`);
      assert.equal(input.getAttribute('aria-invalid'), 'true', `aria-invalid: "${value}"`);
      assert.equal(
        q(container, '[data-compose-width-error]').textContent,
        'Podaj liczbe calkowita od 20 do 120.',
      );
    }
  } finally {
    cleanup(off, container);
  }
});

test('T23: poprawne szerokosci przechodza przez istniejace ograniczenia', () => {
  const store = new MailUiStore({ tab: 'napisz' });
  const { container, off } = mount(store);
  try {
    for (const value of [20, 80, 120]) {
      change(q(container, '[data-field="szerokosc"]'), String(value));
      assert.equal(store.state.composeWidth, value);
      assert.equal(q(container, '[data-field="szerokosc"]').getAttribute('aria-invalid'), null);
      assert.equal(q(container, '[data-compose-width-error]').textContent, '');
    }
  } finally {
    cleanup(off, container);
  }
});
