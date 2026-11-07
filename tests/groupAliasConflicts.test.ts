/** Konflikty lokalnych grup z serwerowymi aliasami: dane zostaja,
 *  konflikt jest zawsze wyliczany ze stanu, nigdy zapisywana flaga. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  buildAddressBookExport,
  findGroupAliasConflicts,
  groupAliasConflict,
} from '../src/arkmail/core/addressBook';
import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { notifyText, startHarness, stopHarness } from './harness';

const window = new Window();
const document = window.document;

test('core: konflikt po trim i bez wielkosci liter, takze dla pustej grupy', () => {
  const aliases = [{ name: 'Druzyna Pocztowa', targets: ['Fred'] }];
  assert.equal(groupAliasConflict(' druzyna pocztowa ', aliases), true);
  assert.equal(groupAliasConflict('Inna', aliases), false);
  const groups = [
    { name: 'DRUZYNA POCZTOWA', members: [] },
    { name: 'Inna', members: ['Grault'] },
  ];
  assert.deepEqual(findGroupAliasConflicts(groups, aliases), [groups[0]]);
});

function mountGroups(store: MailUiStore) {
  const container = document.createElement('div');
  const calls: Array<Array<{ name: string; members: string[] }>> = [];
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {}, onSendCompose: () => {}, onCloseLetter: () => {},
    onRefreshBox: () => {}, onLoadOlder: () => {}, onLoadAll: () => {},
    onSearch: () => {}, onClearSearch: () => {}, onDeleteLetter: () => {},
    onForwardLetter: () => {}, onSaveGroups: (groups) => { calls.push(groups); store.setGroups(groups); },
  });
  return { container, calls };
}
const qa = (root: unknown, selector: string): HTMLElement[] => Array.from(
  (root as { querySelectorAll(s: string): Iterable<HTMLElement> }).querySelectorAll(selector),
);
const q = (root: unknown, selector: string): HTMLElement | null =>
  (root as { querySelector(s: string): HTMLElement | null }).querySelector(selector);
const click = (el: HTMLElement | null): void => { assert.ok(el); el.click(); };
const type = (el: HTMLInputElement, value: string): void => {
  el.value = value;
  el.dispatchEvent(new window.Event('input') as unknown as Event);
};
const openGroups = (root: unknown): void => {
  click(qa(root, '.arkmail-subpill').find((el) => el.textContent === 'Grupy') ?? null);
};

test('UI: tworzenie nazwy kolidujacej z aliasem jest zablokowane', () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setImportedAliases([{ name: 'Druzyna', targets: ['Fred'] }]);
  const { container, calls } = mountGroups(store);
  openGroups(container);
  type(q(container, '[data-group-add]') as HTMLInputElement, ' druzyna ');
  click(q(container, '[data-group-create]'));
  assert.equal(calls.length, 0);
  assert.equal(store.state.groups.length, 0);
  assert.match(container.textContent ?? '', /Nazwa grupy "druzyna" koliduje z aliasem pocztowym z gry\. Wybierz inna nazwe\./);
});

test('UI: zmiana nazwy na alias jest zablokowana, poprzednia grupa zostaje', () => {
  const store = new MailUiStore({ tab: 'kontakty', groups: [{ name: 'Patrol', members: ['Fred'] }] });
  store.setImportedAliases([{ name: 'Druzyna', targets: ['Grault'] }]);
  const { container, calls } = mountGroups(store);
  openGroups(container);
  click(q(container, '[data-group-toggle]'));
  const input = q(container, '[data-group-rename]') as HTMLInputElement;
  assert.ok(input);
  type(input, 'DRUZYNA');
  click(q(container, '[data-group-rename-ok]'));
  assert.equal(calls.length, 0);
  assert.deepEqual(store.state.groups, [{ name: 'Patrol', members: ['Fred'] }]);
  assert.match(container.textContent ?? '', /Nazwa grupy "DRUZYNA" koliduje z aliasem pocztowym z gry\./);
});

test('UI: kazdy konflikt ma trwale ostrzezenie, a grupa znika z podpowiedzi', () => {
  const store = new MailUiStore({
    tab: 'kontakty',
    groups: [
      { name: 'Druzyna', members: ['Fred'] },
      { name: 'Patrol', members: ['Grault'] },
    ],
  });
  store.setImportedAliases([
    { name: 'druzyna', targets: ['Corge'] },
    { name: 'PATROL', targets: ['Thud'] },
  ]);
  const { container } = mountGroups(store);
  openGroups(container);
  const warnings = qa(container, '.arkmail-group-alias-conflict');
  assert.equal(warnings.length, 2);
  for (const warning of warnings) {
    assert.equal(warning.textContent, 'Nazwa koliduje z aliasem pocztowym. Grupa nie jest rozwijana w podpowiedziach. Zmien nazwe albo usun grupe.');
  }
  store.setTab('napisz');
  const adresat = q(container, '[data-field="adresat"]') as HTMLInputElement;
  type(adresat, 'dru');
  assert.equal(q(container, '.arkmail-ghost-rest')?.textContent ?? '', 'zyna', 'serwerowy alias zostaje');
  adresat.value = 'dru'; adresat.selectionStart = 3; adresat.selectionEnd = 3;
  adresat.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }) as unknown as Event);
  assert.equal(adresat.value, 'druzyna', 'akceptowany jest alias, nie rozwiniecie grupy');
});


test('UI: zmiana nazwy usuwa konflikt bez zmiany czlonkow i szkicu', () => {
  const store = new MailUiStore({ tab: 'kontakty', groups: [{ name: 'Druzyna', members: ['Fred'] }] });
  store.setImportedAliases([{ name: 'druzyna', targets: ['Grault'] }]);
  const { container } = mountGroups(store);
  openGroups(container);
  click(q(container, '[data-group-toggle]'));
  type(q(container, '[data-group-rename]') as HTMLInputElement, 'Patrol');
  click(q(container, '[data-group-rename-ok]'));
  assert.deepEqual(store.state.groups, [{ name: 'Patrol', members: ['Fred'] }]);
  assert.equal(qa(container, '.arkmail-group-alias-conflict').length, 0);
  store.setTab('napisz');
  const adresat = q(container, '[data-field="adresat"]') as HTMLInputElement;
  type(adresat, 'Fred,  Druzyna Pocztowa');
  store.setImportedAliases([{ name: 'patrol', targets: ['Grault'] }]);
  assert.equal(adresat.value, 'Fred,  Druzyna Pocztowa', 'import nie przepisuje szkicu');
});

test('eksport: zachowuje kolidujaca grupe bez flagi konfliktu', () => {
  const text = buildAddressBookExport({ people: ['Fred'], groups: [{ name: 'Druzyna', members: ['Fred'] }] });
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.deepEqual(parsed.groups, [{ name: 'Druzyna', members: ['Fred'] }]);
  assert.equal(JSON.stringify(parsed).includes('conflict'), false);
  assert.equal(JSON.stringify(parsed).includes('konflikt'), false);
});

test('handler: import pliku zglasza konflikt, bledny import aliasow jest atomowy, pusty komplet go konczy', async () => {
  const renderModule = require('../src/arkmail/ui/render') as { mountMailUi: typeof mountMailUi };
  const original = renderModule.mountMailUi;
  let handlers: import('../src/arkmail/ui/render').MailUiHandlers | undefined;
  let store: MailUiStore | undefined;
  renderModule.mountMailUi = (container, currentStore, currentHandlers) => {
    handlers = currentHandlers; store = currentStore;
    return original(container, currentStore, currentHandlers);
  };
  const h = await startHarness();
  try {
    handlers!.onSaveGroups!([{ name: 'Druzyna', members: ['Fred'] }]);
    handlers!.onImportAliases!();
    await h.waitFor(() => h.f.sent.includes('aliasy pocztowe'), 'pierwszy import');
    h.f.fire('Posiadasz nastepujace zdefiniowane aliasy pocztowe:', 'mail');
    h.f.fire('\tdruzyna: Grault', 'mail'); h.f.fire('\tpatrol: Corge', 'mail'); h.f.fire('> ', 'mail');
    await h.waitFor(() => store!.state.importedAliases.length === 2, 'lustro aliasow');

    handlers!.onImportAddressBook!({ people: ['Corge'], groups: [{ name: 'Patrol', members: ['Corge'] }] }, 'dolacz');
    assert.ok(notifyText(h.f, 'Nowe konflikty grup z aliasami: Patrol.'), 'import pliku zglasza nowy konflikt');
    handlers!.onSaveGroups!([...store!.state.groups, { name: 'Patrol', members: ['Corge'] }]);
    // Plik nie zawiera aliasow; reczne dolaczenie nowej grupy o nazwie
    // niekolidujacej nie zmienia starego konfliktu ani czlonkow.
    assert.equal(store!.state.groups[0]?.name, 'Druzyna');

    h.f.sendImpl = (command) => command === 'aliasy pocztowe'
      ? Promise.reject(new Error('transport offline')) : Promise.resolve();
    handlers!.onImportAliases!();
    await h.waitFor(() => notifyText(h.f, 'Nie udalo sie zaimportowac aliasow z gry.'), 'blad importu');
    assert.deepEqual(store!.state.importedAliases, [
      { name: 'druzyna', targets: ['Grault'] }, { name: 'patrol', targets: ['Corge'] },
    ]);
    h.f.sendImpl = null;
    handlers!.onImportAliases!();
    await h.waitFor(() => h.f.sent.filter((line) => line === 'aliasy pocztowe').length === 3, 'kompletny pusty import');
    h.f.fire('> ', 'mail');
    await h.waitFor(() => store!.state.importedAliases.length === 0, 'konflikt znika z lustrem');
    assert.deepEqual(store!.state.groups[0], { name: 'Druzyna', members: ['Fred'] });
  } finally {
    renderModule.mountMailUi = original;
    await stopHarness();
  }
});

test('handler: import i reczny zapis zachowuja atomowosc oraz zglaszaja tylko nowe konflikty', async () => {
  const renderModule = require('../src/arkmail/ui/render') as { mountMailUi: typeof mountMailUi };
  const original = renderModule.mountMailUi;
  let handlers: import('../src/arkmail/ui/render').MailUiHandlers | undefined;
  let store: MailUiStore | undefined;
  renderModule.mountMailUi = (container, currentStore, currentHandlers) => {
    handlers = currentHandlers;
    store = currentStore;
    return original(container, currentStore, currentHandlers);
  };
  const h = await startHarness();
  const importAliases = async (): Promise<void> => {
    handlers!.onImportAliases!();
    await h.waitFor(() => h.f.sent.includes('aliasy pocztowe'), 'komenda importu');
    h.f.fire('Posiadasz nastepujace zdefiniowane aliasy pocztowe:', 'mail');
    h.f.fire('\tdruzyna: Fred', 'mail');
    h.f.fire('\tpatrol: Corge', 'mail');
    h.f.fire('> ', 'mail');
  };
  try {
    assert.ok(handlers?.onSaveGroups && handlers.onImportAliases);
    handlers.onSaveGroups([{ name: 'Druzyna', members: ['Grault'] }]);
    await importAliases();
    await h.waitFor(() => notifyText(h.f, 'Nowe konflikty grup z aliasami: Druzyna.'), 'nowy konflikt');
    assert.deepEqual(store!.state.groups, [{ name: 'Druzyna', members: ['Grault'] }]);
    assert.deepEqual(store!.state.importedAliases, [
      { name: 'druzyna', targets: ['Fred'] },
      { name: 'patrol', targets: ['Corge'] },
    ]);

    handlers.onSaveGroups([{ name: 'Patrol', members: ['Corge'] }, { name: 'DRUZYNA', members: ['Thud'] }]);
    assert.deepEqual(store!.state.groups, [{ name: 'Druzyna', members: ['Grault'] }], 'calosc zapisu odrzucona');
    assert.ok(notifyText(h.f, 'Nazwa grupy "Patrol" koliduje z aliasem pocztowym z gry. Wybierz inna nazwe.'));

    await importAliases();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const notices = h.f.shown.filter((entry) => String(entry).includes('Nowe konflikty grup z aliasami'));
    assert.equal(notices.length, 0, 'powiadomienia sa obiektami; liczymy przez notifyText ponizej');
  } finally {
    renderModule.mountMailUi = original;
    await stopHarness();
  }
});
