import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry, MailboxResult } from '../src/arkmail/core/session/mailbox';
import type { MailBox } from '../src/arkmail/core/protocol/types';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

interface DeletionStateShape {
  box: MailBox;
  filters: Record<string, string>;
  command: string | null;
  result: MailboxResult | null;
  selected: number[];
  message: string | null;
  revision: number;
}

interface DeletionStoreApi {
  state: { deletion: DeletionStateShape; archive: ArchiveLetter[] };
  setTab(tab: string): void;
  setDeletionBox(box: MailBox): void;
  setDeletionFilters(filters: Record<string, string>): void;
  applyDeletionResult(box: MailBox, command: string, result: MailboxResult): void;
  toggleDeletionEntry(number: number): void;
  selectAllDeletionEntries(): void;
  clearDeletionSelection(): void;
  clearDeletionResult(message: string | null): void;
  resetDeletion(): void;
  setArchive(archive: ArchiveLetter[]): void;
}

const asDeletionStore = (store: MailUiStore): DeletionStoreApi =>
  store as unknown as DeletionStoreApi;

const entry = (number: number): MailboxEntry => ({
  number,
  isRead: true,
  subject: `Temat ${number}`,
  forwarded: false,
  party: 'Foo',
  partyKind: 'nadawca',
  date: null,
});

const result = (): MailboxResult => ({
  kind: 'lista',
  header: { box: 'odebrane', truncated: false },
  entries: [entry(1), entry(2), entry(3)],
});

const deletionModulePath = '../src/arkmail/ui/deletion.js';
const loadDeletionModule = (): Promise<{ formatListCount(count: number): string }> =>
  import(deletionModulePath) as Promise<{ formatListCount(count: number): string }>;

test('usuwanie: odmiana liczby listow jest dynamiczna', async () => {
  const { formatListCount } = await loadDeletionModule();
  const expected = new Map([
    [0, '0 listow'], [1, '1 list'], [2, '2 listy'], [4, '4 listy'], [5, '5 listow'],
    [11, '11 listow'], [12, '12 listow'], [14, '14 listow'], [21, '21 listow'],
    [22, '22 listy'], [24, '24 listy'], [25, '25 listow'], [101, '101 listow'],
    [102, '102 listy'], [111, '111 listow'], [122, '122 listy'],
  ]);
  for (const [count, text] of expected) assert.equal(formatListCount(count), text);
});

test('usuwanie: wyjscie czysci wynik, filtry i zaznaczenie bez kopiowania Archiwum', () => {
  const store = asDeletionStore(new MailUiStore());
  store.setTab('usuwanie');
  store.applyDeletionResult('odebrane', 'listy odebrane', result());
  store.toggleDeletionEntry(2);
  store.toggleDeletionEntry(1);
  assert.deepEqual(store.state.deletion.selected, [2, 1]);
  store.clearDeletionSelection();
  store.selectAllDeletionEntries();
  assert.deepEqual(store.state.deletion.selected, [1, 2, 3]);

  const archive: ArchiveLetter[] = [];
  store.setArchive(archive);
  store.toggleDeletionEntry(2);
  assert.equal(store.state.archive, archive, 'zaznaczenie nie tworzy kopii Archiwum');
  const revision = store.state.deletion.revision;
  store.setTab('archiwum');
  assert.equal(store.state.deletion.result, null);
  assert.deepEqual(store.state.deletion.selected, []);
  assert.equal(store.state.deletion.command, null);
  assert.equal(store.state.deletion.filters.temat, '');
  assert.ok(store.state.deletion.revision > revision, 'reset uniewaznia stara odpowiedz');
});

test('usuwanie: po operacji zostaja tylko skrzynka, filtry i ostatnie zapytanie', () => {
  const store = asDeletionStore(new MailUiStore());
  store.setDeletionBox('wyslane');
  store.setDeletionFilters({ osoba: '', temat: 'A', tresc: '', odDaty: '', doDaty: '' });
  store.applyDeletionResult('wyslane', 'listy wyslane o temacie A', result());
  store.toggleDeletionEntry(1);
  store.clearDeletionResult('Usunieto: 1 list.');
  assert.equal(store.state.deletion.box, 'wyslane');
  assert.equal(store.state.deletion.filters.temat, 'A');
  assert.equal(store.state.deletion.command, 'listy wyslane o temacie A');
  assert.equal(store.state.deletion.result, null);
  assert.deepEqual(store.state.deletion.selected, []);
  assert.equal(store.state.deletion.message, 'Usunieto: 1 list.');

  store.resetDeletion();
  assert.equal(store.state.deletion.box, 'odebrane');
  assert.equal(store.state.deletion.filters.temat, '');
  assert.equal(store.state.deletion.command, null);
  assert.equal(store.state.deletion.message, null);
});
