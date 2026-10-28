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
  dateRaw = 'Wt, 23 XII 2025, 00:11:12',
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
    day: 23,
    month: 12,
    year: 2025,
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


test('usuwanie zbiorcze: potwierdzony list i jego blizniak znikaja z Archiwum', async () => {
  const { applyConfirmedDeletions } = await loadModule();
  const removed = entry(4, 'Foo', 'A');
  const other = entry(3, 'Bar', 'B', 'Pn, 22 XII 2025, 02:20:05');
  const archive = [
    fromMailboxEntry('odebrane', removed),
    fromMailboxEntry('nieprzeczytane', { ...removed, isRead: false }),
    fromMailboxEntry('odebrane', other),
  ];
  const result = applyConfirmedDeletions(archive, 'odebrane', [removed, other], [4]);
  assert.equal(result.letters[0]!.missingOnServer, true);
  assert.equal(result.letters[1]!.missingOnServer, true);
  assert.equal(result.letters[2]!.missingOnServer, undefined);
  assert.equal(result.letters[2], archive[2], 'nietkniety rekord zachowuje referencje');
  assert.equal(archive[0]!.missingOnServer, undefined, 'wejscie bez mutacji');
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
  assert.equal(result.letters[0]!.missingOnServer, undefined);
});

test('usuwanie zbiorcze: brak fizycznego potwierdzenia nie zmienia Archiwum', async () => {
  const { applyConfirmedDeletions } = await loadModule();
  const fresh = [entry(4, 'Foo', 'A')];
  const archive = [fromMailboxEntry('odebrane', fresh[0]!)];
  const result = applyConfirmedDeletions(archive, 'odebrane', fresh, []);
  assert.equal(result.letters, archive);
  assert.equal(result.changedBoxes.size, 0);
  assert.equal(result.letters[0]!.missingOnServer, undefined);
});
