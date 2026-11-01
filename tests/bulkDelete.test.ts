import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { ArchiveLetter } from '../src/arkmail/core/archive';
import type { MailBox } from '../src/arkmail/core/protocol/types';
import { fromMailboxEntry } from '../src/arkmail/core/archive';

interface BulkDeleteModule {
  matchSelectionOnFreshListing(
    selected: readonly MailboxEntry[],
    fresh: readonly MailboxEntry[],
  ): { entries: MailboxEntry[]; numbers: number[]; range: string } | null;
  applyConfirmedDeletions(
    archive: readonly ArchiveLetter[],
    box: MailBox,
    fresh: readonly MailboxEntry[],
    confirmedNumbers: readonly number[],
  ): { letters: ArchiveLetter[]; changedIds: Set<string>; changedBoxes: Set<MailBox> };
}

const modulePath = '../src/arkmail/core/bulkDelete.js';
const loadModule = (): Promise<BulkDeleteModule> => import(modulePath) as Promise<BulkDeleteModule>;

const entry = (
  number: number,
  party: string,
  subject: string,
  dateRaw = 'Wt, 24 VIII 1999, 00:11:12',
): MailboxEntry => ({
  number,
  isRead: true,
  subject,
  forwarded: false,
  party,
  partyKind: 'nadawca',
  date: {
    raw: dateRaw,
    weekday: 'Wt',
    day: 24,
    month: 8,
    year: 1999,
    time: dateRaw.slice(-8),
  },
});

test('usuwanie zbiorcze: swieze numery po renumeracji tworza jeden zakres', async () => {
  const { matchSelectionOnFreshListing } = await loadModule();
  const selected = [
    entry(50, 'Foo', 'A'),
    entry(40, 'Bar', 'B'),
    entry(30, 'Corge', 'C'),
    entry(20, 'Waldo', 'D'),
  ];
  const fresh = [
    entry(7, 'Waldo', 'D'),
    entry(4, 'Corge', 'C'),
    entry(3, 'Bar', 'B'),
    entry(2, 'Foo', 'A'),
    entry(1, 'Baz', 'Inny'),
  ];
  const match = matchSelectionOnFreshListing(selected, fresh);
  assert.ok(match);
  assert.deepEqual(match.numbers, [2, 3, 4, 7]);
  assert.equal(match.range, '2-4,7');
  assert.deepEqual(match.entries.map((item) => item.number), [2, 3, 4, 7]);
});

test('usuwanie zbiorcze: duplikaty porownywane sa jako liczba wystapien', async () => {
  const { matchSelectionOnFreshListing } = await loadModule();
  const selected = [entry(2, 'Foo', 'A'), entry(1, 'Foo', 'A')];
  const fresh = [entry(5, 'Foo', 'A'), entry(4, 'Bar', 'B')];
  assert.equal(matchSelectionOnFreshListing(selected, fresh), null);
});


test('usuwanie zbiorcze: potwierdzony list i jego blizniak USUWANE fizycznie z Archiwum (Fala 28)', async () => {
  const { applyConfirmedDeletions } = await loadModule();
  const removed = entry(4, 'Foo', 'A');
  const other = entry(3, 'Bar', 'B', 'Pn, 23 VIII 1999, 02:20:05');
  const archive = [
    fromMailboxEntry('odebrane', removed),
    fromMailboxEntry('nieprzeczytane', { ...removed, isRead: false }),
    fromMailboxEntry('odebrane', other),
  ];
  const result = applyConfirmedDeletions(archive, 'odebrane', [removed, other], [4]);
  assert.deepEqual(
    result.letters.map((l) => l.subject),
    ['B'],
    'obie kopie fizycznie usuniete (Fala 28: zadnych zombie)',
  );
  assert.equal(result.letters[0], archive[2], 'nietkniety rekord zachowuje referencje');
  assert.equal(archive.length, 3, 'wejscie bez mutacji');
  assert.deepEqual([...result.changedIds].sort(), [archive[0]!.id, archive[1]!.id].sort());
  assert.deepEqual([...result.changedBoxes].sort(), ['nieprzeczytane', 'odebrane']);
});

test('usuwanie zbiorcze: pozostaly duplikat chroni rekord Archiwum', async () => {
  const { applyConfirmedDeletions } = await loadModule();
  const first = entry(4, 'Foo', 'A');
  const duplicate = entry(3, 'Foo', 'A');
  const archive = [fromMailboxEntry('odebrane', first)];
  const result = applyConfirmedDeletions(archive, 'odebrane', [first, duplicate], [4]);
  assert.equal(result.letters, archive, 'bez zmian zwracana jest ta sama tablica');
  assert.equal(result.changedIds.size, 0);
});

test('usuwanie zbiorcze: brak fizycznego potwierdzenia nie zmienia Archiwum', async () => {
  const { applyConfirmedDeletions } = await loadModule();
  const fresh = [entry(4, 'Foo', 'A')];
  const archive = [fromMailboxEntry('odebrane', fresh[0]!)];
  const result = applyConfirmedDeletions(archive, 'odebrane', fresh, []);
  assert.equal(result.letters, archive);
  assert.equal(result.changedBoxes.size, 0);
});
