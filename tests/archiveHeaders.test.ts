import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  contentKeyOf,
  fromMailboxEntry,
  fromOpenedLetter,
  normalizeArchive,
  replaceBoxLetters,
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { LetterContent } from '../src/arkmail/core/session/pager';
import {
  MemoryStorageDriver,
  WriteThroughStorage,
} from '../src/arkmail/adapters/writeThroughStorage';

interface HeadersSnapshot {
  from: string;
  to: string;
  cc: string | null;
}

type HeaderedArchiveLetter = Omit<ArchiveLetter, 'headers'> & {
  headers?: unknown;
  futureField?: unknown;
};

function record(over: Partial<HeaderedArchiveLetter> = {}): ArchiveLetter {
  const { headers, ...rest } = over;
  return {
    id: 'rekord-1',
    box: 'odebrane',
    number: 4,
    party: 'Listing',
    subject: 'Syntetyczny temat',
    forwarded: false,
    dateRaw: 'Wt, 24 VIII 1999, 00:11:12',
    sortKey: '1999-08-24 00:11:12',
    read: false,
    ...(headers !== undefined ? { headers } : {}),
    body: [],
    ...rest,
  } as ArchiveLetter;
}

function opened(over: Partial<LetterContent> = {}): LetterContent {
  return {
    number: 4,
    from: 'Nadawca',
    subject: 'Syntetyczny temat',
    to: 'Pierwszy, Drugi',
    cc: 'Trzeci',
    date: 'Wt, 24 VIII 1999, 00:11:12',
    body: ['Syntetyczna tresc'],
    ...over,
  };
}

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  const date = parseMailDate('Wt, 24 VIII 1999, 00:11:12');
  assert.ok(date);
  return {
    number: 4,
    isRead: false,
    subject: 'Syntetyczny temat',
    forwarded: false,
    party: 'Listing',
    partyKind: 'nadawca',
    date,
    archiveId: 'rekord-1',
    ...over,
  };
}

function headersOf(letter: ArchiveLetter): HeadersSnapshot | undefined {
  return (letter as HeaderedArchiveLetter).headers as HeadersSnapshot | undefined;
}

test('naglowki: sam listing nie tworzy pozornego kompletu', () => {
  const listed = fromMailboxEntry('odebrane', entry());
  assert.equal('headers' in listed, false);
  assert.equal(listed.party, 'Listing');
});

test('naglowki: swiezy odebrany zapisuje jeden komplet pod archiveId', () => {
  const saved = fromOpenedLetter('odebrane', opened({
    from: 'Nadawca',
    to: '',
    cc: null,
  }), entry());

  assert.equal(saved.id, 'rekord-1');
  assert.equal(saved.party, 'Listing');
  assert.deepEqual(headersOf(saved), { from: 'Nadawca', to: '', cc: null });
  assert.deepEqual(saved.body, ['Syntetyczna tresc']);
});

test('naglowki: swiezy wyslany bez wpisu zapisuje Od, Do i DW', () => {
  const saved = fromOpenedLetter('wyslane', opened({
    from: 'Nadawca',
    to: 'Pierwszy, Drugi',
    cc: 'Trzeci',
  }));

  assert.deepEqual(headersOf(saved), {
    from: 'Nadawca',
    to: 'Pierwszy, Drugi',
    cc: 'Trzeci',
  });
  assert.equal(saved.party, 'Pierwszy, Drugi');
});

test('naglowki: normalizacja zachowuje poprawny komplet i nieznane pola rekordu', () => {
  const original = record({
    headers: { from: 'Nadawca', to: '', cc: null },
    futureField: { zachowane: true },
  });
  const [normalized] = normalizeArchive([original]) as HeaderedArchiveLetter[];

  assert.deepEqual(normalized.headers, { from: 'Nadawca', to: '', cc: null });
  assert.deepEqual(normalized.futureField, { zachowane: true });
  assert.equal(normalized.id, original.id);
  assert.equal(normalized.party, original.party);
});

test('naglowki: niepoprawny ksztalt jest traktowany jako brak danych', () => {
  const invalid = [
    null,
    [],
    {},
    { from: 1, to: '', cc: null },
    { from: 'Nadawca', to: '', cc: undefined },
    { from: 'Nadawca', to: '', cc: 0 },
    { from: 'Nadawca', cc: null },
  ];
  const normalized = normalizeArchive(invalid.map((headers, index) => record({
    id: `niepoprawny-${index}`,
    headers,
  }))) as HeaderedArchiveLetter[];

  assert.equal(normalized.length, invalid.length);
  for (const letter of normalized) assert.equal('headers' in letter, false);
});

test('naglowki: upsert bez pola nie kasuje kompletu', () => {
  const full = record({ headers: { from: 'Nadawca', to: 'Pierwszy', cc: 'Trzeci' } });
  const listing = record({ number: 8 });
  const merged = upsertLetters([full], [listing]).letters[0];

  assert.deepEqual(headersOf(merged), { from: 'Nadawca', to: 'Pierwszy', cc: 'Trzeci' });
  assert.equal(merged.number, 8);
});

test('naglowki: nowy komplet zastepuje stary atomowo', () => {
  const previous = record({ headers: { from: 'Stary', to: 'Poprzedni', cc: 'Dawny' } });
  const incoming = record({ headers: { from: 'Nowy', to: '', cc: null } });
  const merged = upsertLetters([previous], [incoming]).letters[0];

  assert.deepEqual(headersOf(merged), { from: 'Nowy', to: '', cc: null });
});

test('naglowki: scalanie nie wybiera niekompletnego wariantu kosztem kompletu', () => {
  const incomplete = record({ body: ['Starsza tresc'] });
  const complete = record({
    headers: { from: 'Nadawca', to: 'Pierwszy', cc: null },
    body: ['Pelna tresc'],
  });

  const [merged] = normalizeArchive([incomplete, complete]);
  assert.deepEqual(headersOf(merged), { from: 'Nadawca', to: 'Pierwszy', cc: null });
  assert.equal(new Set(merged.body).size, 2);
});

test('naglowki: scalanie konfliktow jest deterministyczne i nie miesza migawek', () => {
  const first = record({
    headers: { from: 'Pierwszy', to: 'Do pierwszego', cc: 'DW pierwszego' },
    body: ['Pierwsza tresc'],
  });
  const second = record({
    headers: { from: 'Drugi', to: '', cc: null },
    body: ['Druga tresc'],
  });

  const forward = normalizeArchive([first, second]);
  const reverse = normalizeArchive([second, first]);
  assert.deepEqual(forward, reverse);
  const selected = JSON.stringify(headersOf(forward[0]));
  assert.ok(
    selected === JSON.stringify(first.headers) || selected === JSON.stringify(second.headers),
    'wynik jest jedna cala migawka, nie polaczeniem pol',
  );
});

test('naglowki: rozne id nie kopiuja kompletu miedzy blizniakami', () => {
  const complete = record({
    id: 'blizniak-1',
    headers: { from: 'Nadawca', to: 'Pierwszy', cc: 'Trzeci' },
  });
  const incomplete = record({ id: 'blizniak-2' });
  const normalized = normalizeArchive([complete, incomplete]);
  const byId = new Map(normalized.map((letter) => [letter.id, letter]));

  assert.deepEqual(headersOf(byId.get('blizniak-1')!), {
    from: 'Nadawca',
    to: 'Pierwszy',
    cc: 'Trzeci',
  });
  assert.equal('headers' in byId.get('blizniak-2')!, false);
});

test('naglowki: upsert jednego blizniaka nie zmienia drugiego', () => {
  const first = record({ id: 'blizniak-1' });
  const second = record({ id: 'blizniak-2', body: ['Druga tresc'] });
  const openedFirst = record({
    id: 'blizniak-1',
    body: ['Pierwsza tresc'],
    headers: { from: 'Nadawca', to: 'Pierwszy', cc: null },
  });

  const result = upsertLetters([first, second], [openedFirst]);
  const byId = new Map(result.letters.map((letter) => [letter.id, letter]));
  assert.deepEqual(headersOf(byId.get('blizniak-1')!), {
    from: 'Nadawca',
    to: 'Pierwszy',
    cc: null,
  });
  assert.deepEqual(byId.get('blizniak-2'), second);
});

test('naglowki: ponowna indeksacja zachowuje komplet, tresc i identyfikator', () => {
  const full = record({
    body: ['Zachowana tresc'],
    headers: { from: 'Nadawca', to: 'Pierwszy', cc: 'Trzeci' },
  });
  const listing = record({ number: 9 });

  const result = replaceBoxLetters([full], 'odebrane', [listing]);
  assert.equal(result.letters.length, 1);
  assert.equal(result.removedIds.size, 0);
  assert.equal(result.letters[0].id, 'rekord-1');
  assert.deepEqual(result.letters[0].body, ['Zachowana tresc']);
  assert.deepEqual(headersOf(result.letters[0]), {
    from: 'Nadawca',
    to: 'Pierwszy',
    cc: 'Trzeci',
  });
});

test('naglowki: nie zmieniaja klucza tresci ani tozsamosci rekordu', () => {
  const plain = record();
  const full = record({ headers: { from: 'Nadawca', to: 'Pierwszy', cc: null } });

  assert.equal(contentKeyOf(full), contentKeyOf(plain));
  assert.equal(full.id, plain.id);
  assert.equal(full.party, plain.party);
});

test('naglowki: potwierdzony zapis i ponowne otwarcie magazynu zachowuja komplet', async () => {
  const driver = new MemoryStorageDriver();
  const storage = await WriteThroughStorage.open(driver, () => {});
  const letter = record({ headers: { from: 'Nadawca', to: '', cc: null } });

  await storage.setLettersConfirmed('Testowa', [letter]);
  const reopened = await WriteThroughStorage.open(driver, () => {});
  const raw = reopened.getLetters('Testowa')['rekord-1'];
  assert.ok(raw);
  assert.deepEqual(JSON.parse(raw).headers, { from: 'Nadawca', to: '', cc: null });
});
