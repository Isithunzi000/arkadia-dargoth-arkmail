/** Regresja 1.30.5 -> 1.30.6: uzyteczny listing bez promptu. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailboxSession, type MailboxEntry, type MailboxResult } from '../src/arkmail/core/session/mailbox';
import { scanMailboxPages } from '../src/arkmail/core/pagination';
import { MockTransport } from '../src/arkmail/core/session/transport';
import { fromMailboxEntry, scanKeyOfEntries, type ArchiveLetter } from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  notifyText,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const flushPromises = async (): Promise<void> => {
  await new Promise<void>((resolve) => { setImmediate(resolve); });
};

const listing = [
  { cls: 'mail', text: 'Listy odebrane:' },
  { cls: 'mail', text: ' 1. *R* Temat: syntetyczny' },
  { cls: 'mail', text: 'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12' },
];

const fireListing = (h: Harness, subject: string): void => {
  h.f.fire('Listy odebrane:', 'mail');
  h.f.fire(` 1. *R* Temat: ${subject}`, 'mail');
  h.f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
};

const oldArchive = (subject: string, dateRaw = 'Pn, 23 VIII 1999, 02:20:05'): ArchiveLetter => ({
  ...fromMailboxEntry('odebrane', {
    number: 9,
    isRead: true,
    subject,
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: parseMailDate(dateRaw),
  }),
  body: ['Syntetyczna tresc.'],
});

async function storedSubjects(): Promise<string[]> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const values = (await driver.loadAllLetters()).foo ?? {};
  await driver.close();
  return Object.values(values)
    .map((value) => (JSON.parse(value) as ArchiveLetter).subject)
    .sort();
}

test('mailbox: listing bez promptu jest kompletny i zwalnia kolejna operacje', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new MockTransport();
  const mailbox = new MailboxSession(transport, { timeoutMs: 8000, idleMs: 400 });
  const operation = mailbox.fetch('odebrane');
  let settlement = 'pending';
  void operation.then(
    () => { settlement = 'resolved'; },
    () => { settlement = 'rejected'; },
  );

  await transport.replay(listing);
  context.mock.timers.tick(400);
  await flushPromises();
  assert.equal(settlement, 'resolved');
  const result = await operation;
  assert.equal(result.kind, 'lista');
  assert.equal(result.kind === 'lista' ? result.entries.length : 0, 1);

  const next = mailbox.fetch('odebrane');
  await transport.replay([
    { cls: 'mail', text: 'Nie masz zadnych odebranych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  assert.equal((await next).kind, 'pusta');
});

test('odswiezenie: listing bez promptu trafia do widoku, zastepuje archiwum i nie blokuje ponowienia', async () => {
  const h = await startHarness({
    archive: [oldArchive('Stary wpis')],
    autoRefreshEnabled: false,
  });
  try {
    click(h, '.arkmail-search-go');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'pierwsze odswiezenie');
    fireListing(h, 'Nowy wpis');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec listingu bez promptu');
    await waitRt(
      () => Array.from(h.content.querySelectorAll('.arkmail-entry-subject'))
        .some((element) => (element as { textContent?: string }).textContent === 'Nowy wpis'),
      'nowy wpis w widoku',
    );
    assert.ok(!notifyText(h.f, 'Blad odswiezania'));
    let subjects: string[] = [];
    for (let i = 0; i < 240; i++) {
      subjects = await storedSubjects();
      if (subjects.join('|') === 'Nowy wpis') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.deepEqual(subjects, ['Nowy wpis']);

    click(h, '.arkmail-search-go');
    await waitRt(
      () => h.f.sent.filter((command) => command === 'listy odebrane').length === 2,
      'ponowne odswiezenie bez odzyskiwania',
    );
    h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec ponownego odswiezenia');
  } finally {
    await stopHarness();
  }
});

test('indeksacja: listing bez promptu konczy skrzynke sukcesem i nie blokuje kolejnej', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'indeksacja odebranych');
    fireListing(h, 'Wpis bez promptu');

    await waitRt(() => h.f.sent.includes('listy nieprzeczytane'), 'nastepna skrzynka');
    h.f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => h.f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
    h.f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => h.f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
    h.f.fire('Nie masz zadnych niewyslanych listow.', 'mail');

    await waitRt(
      () => notifyText(h.f, 'Indeksowanie niekompletne') || notifyText(h.f, 'Zindeksowano skrzynki'),
      'koniec indeksacji',
    );
    assert.ok(notifyText(h.f, 'Zindeksowano skrzynki'));
    assert.ok(!notifyText(h.f, 'Indeksowanie niekompletne'));
    assert.ok(!notifyText(h.f, 'Pominiete: odebrane'));
    const snapshot = await waitStoredLetters(1, (current) => Boolean(current.indexMeta.odebrane));
    assert.deepEqual(snapshot.letters.map((letter) => letter.subject), ['Wpis bez promptu']);
    assert.ok(snapshot.indexMeta.odebrane);
  } finally {
    await stopHarness();
  }
});


interface StoredSnapshot {
  letters: ArchiveLetter[];
  indexMeta: Record<string, string>;
  archiveGaps: Record<string, string[]>;
}

async function storedSnapshot(): Promise<StoredSnapshot> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const stored = await driver.loadAllLetters();
  const values = await driver.loadAll();
  await driver.close();
  return {
    letters: Object.values(stored.foo ?? {}).map((value) => JSON.parse(value) as ArchiveLetter),
    indexMeta: JSON.parse(values['arkmail.foo.indeks'] ?? '{}') as Record<string, string>,
    archiveGaps: JSON.parse(values['arkmail.foo.luki-archiwum'] ?? '{}') as Record<string, string[]>,
  };
}

async function waitStoredLetters(
  count: number,
  ready: (snapshot: StoredSnapshot) => boolean = () => true,
): Promise<StoredSnapshot> {
  let last: StoredSnapshot | null = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const snapshot = await storedSnapshot();
    last = snapshot;
    if (snapshot.letters.length === count && ready(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`timeout: oczekiwano ${count} trwalych rekordow, stan: ${JSON.stringify(last)}`);
}

const fireOlderPage = (
  h: Harness,
  subject: string,
  dateRaw: string,
  truncated: boolean,
): void => {
  h.f.fire(`Wybrane listy odebrane${truncated ? ' (prezentowane jest pierwsze 50)' : ''}:`, 'mail');
  h.f.fire(`50. *R* Temat: ${subject}`, 'mail');
  h.f.fire(`Nadawca: Waldo                          ${dateRaw}`, 'mail');
};

const scanEntry = (subject: string, day: number, time: string): MailboxEntry => ({
  number: 1,
  isRead: true,
  subject,
  forwarded: false,
  party: 'Waldo',
  partyKind: 'nadawca',
  date: {
    raw: `Wt, ${day} VIII 1999, ${time}`,
    weekday: 'Wt', day, month: 8, year: 1999, time,
  },
});
const scanPage = (
  entries: MailboxEntry[],
  truncated: boolean,
): MailboxResult => ({
  kind: 'lista',
  header: { box: 'odebrane', truncated },
  entries,
});

test('skan: strona zwrocona po ciszy zostaje scalona i otwiera kolejna kotwice', async () => {
  const first = scanEntry('Pierwsza', 24, '10:00:00');
  const older = scanEntry('Starsza', 23, '10:00:00');
  const anchor = 'listy odebrane przed 25 VIII 1999';
  const commands: Array<string | undefined> = [];
  const visited: string[] = [];
  const result = await scanMailboxPages({
    box: 'odebrane',
    initialCommand: anchor,
    cancelled: () => false,
    fetchPage: async (command) => {
      commands.push(command);
      return commands.length === 1 ? scanPage([first], true) : scanPage([older], false);
    },
    wait: async () => {},
    onPage: (value) => {
      visited.push(...value.entries.map((entry) => entry.subject));
      return {};
    },
  });

  assert.equal(result.end, 'complete');
  assert.equal(result.pages, 2);
  assert.deepEqual(result.all, [first, older]);
  assert.deepEqual(visited, ['Pierwsza', 'Starsza']);
  assert.deepEqual(commands, [anchor, anchor]);
});

test('skan: znaleziony wpis na stronie zwroconej po ciszy zatrzymuje skan bez kolejnej kotwicy', async () => {
  const first = scanEntry('Znaleziona', 24, '10:00:00');
  const anchor = 'listy odebrane przed 25 VIII 1999';
  const commands: Array<string | undefined> = [];
  const result = await scanMailboxPages({
    box: 'odebrane',
    initialCommand: anchor,
    cancelled: () => false,
    fetchPage: async (command) => {
      commands.push(command);
      return scanPage([first], true);
    },
    wait: async () => {},
    onPage: () => ({ stop: true }),
  });

  assert.equal(result.end, 'clamped');
  assert.equal(result.pages, 1);
  assert.deepEqual(result.all, [first]);
  assert.deepEqual(commands, [anchor]);
});

test('skan: listing bazowy zwrocony po ciszy zostaje scalony i otwiera kolejna kotwice', async () => {
  const first = scanEntry('Pierwsza', 24, '10:00:00');
  const base = scanEntry('Bazowa', 25, '10:00:00');
  const older = scanEntry('Starsza', 23, '10:00:00');
  const anchor = 'listy odebrane przed 25 VIII 1999';
  const commands: Array<string | undefined> = [];
  const refreshed: string[] = [];
  const result = await scanMailboxPages({
    box: 'odebrane',
    initialCommand: anchor,
    cancelled: () => false,
    fetchPage: async (command) => {
      commands.push(command);
      if (commands.length <= 2) return scanPage([first], true);
      if (commands.length === 3) return scanPage([base], true);
      return scanPage([older], false);
    },
    wait: async () => {},
    onBaseRefresh: (value) => {
      if (value.kind === 'lista') refreshed.push(...value.entries.map((entry) => entry.subject));
    },
    onPage: () => ({}),
  });

  assert.equal(result.end, 'complete');
  assert.equal(result.pages, 3);
  assert.deepEqual(refreshed, ['Bazowa']);
  assert.deepEqual(commands, [anchor, anchor, undefined, anchor]);
});

test('skan: anulowanie podczas odswiezania bazy poprzedza zapis wyniku', async () => {
  const first = scanEntry('Pierwsza', 24, '10:00:00');
  const base = scanEntry('Bazowa', 25, '10:00:00');
  const anchor = 'listy odebrane przed 25 VIII 1999';
  let cancelled = false;
  let commands = 0;
  const refreshed: string[] = [];
  const result = await scanMailboxPages({
    box: 'odebrane',
    initialCommand: anchor,
    cancelled: () => cancelled,
    fetchPage: async () => {
      commands += 1;
      if (commands <= 2) return scanPage([first], true);
      cancelled = true;
      return scanPage([base], true);
    },
    wait: async () => {},
    onBaseRefresh: (value) => {
      if (value.kind === 'lista') refreshed.push(...value.entries.map((entry) => entry.subject));
    },
    onPage: () => ({}),
  });

  assert.equal(result.end, 'cancelled');
  assert.deepEqual(refreshed, [], 'anulowana baza nie trafia do widoku ani archiwum');
});

test('wczytaj starsze: strona bez promptu zostaje w widoku i archiwum bez dawnego bledu', async () => {
  const h = await startHarness();
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older');
    await waitRt(
      () => h.f.sent.some((command) => command.startsWith('listy odebrane przed')),
      'komenda starszej strony',
    );
    fireOlderPage(h, 'Starszy bez promptu', 'Nd, 15 VIII 1999, 10:00:00', false);
    await waitRt(() => textOf(h, '.arkmail-busy') === '', 'koniec starszej strony bez promptu');

    assert.equal(h.content.querySelectorAll('.arkmail-entry').length, 4);
    assert.ok(notifyText(h.f, 'Wczytano starsze listy'));
    assert.ok(!notifyText(h.f, 'Nie potwierdzono zamkniecia odpowiedzi'));
    assert.ok(!notifyText(h.f, 'nie potwierdzono pelnej odpowiedzi - sprobuj ponownie'));
    const snapshot = await waitStoredLetters(4);
    assert.ok(snapshot.letters.some((letter) => letter.subject === 'Starszy bez promptu'));
  } finally {
    await stopHarness();
  }
});

test('wczytaj wszystkie: strona bez promptu kontynuuje pobieranie i zatwierdza archiwum', async () => {
  const completeMarker = '1999-08-01T12:00:00.000Z';
  const h = await startHarness({
    archive: [oldArchive('Stary wpis', 'Pn, 9 VIII 1999, 02:20:05')],
    indexMeta: { odebrane: completeMarker },
    archiveGaps: { odebrane: ['1999-08-01'] },
  });
  const { f } = h;
  const anchors = () => f.sent.filter((command) => command.startsWith('listy odebrane przed')).length;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitRt(() => anchors() === 1, 'pierwsza komenda petli');
    assert.equal(f.sent.find((command) => command.startsWith('listy odebrane przed')), 'listy odebrane przed 23 VIII 1999');

    fireOlderPage(h, 'Strona pierwsza', 'Nd, 15 VIII 1999, 10:00:00', true);
    await waitRt(() => anchors() === 2, 'kolejna kotwica po stronie bez promptu');
    assert.equal(f.sent.filter((command) => command.startsWith('listy odebrane przed')).at(-1), 'listy odebrane przed 16 VIII 1999');
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Wczytano wszystkie'), 'koniec kompletnej petli');
    assert.ok(!notifyText(f, 'Wczytano dostepne listy'));
    assert.ok(notifyText(f, '4 (dodano: 1)'));

    const subjects = Array.from(h.content.querySelectorAll('.arkmail-entry-subject'))
      .map((element) => String((element as { textContent?: string }).textContent ?? ''));
    assert.equal(subjects.length, 4);
    assert.equal(new Set(subjects).size, 4, 'widok nie zawiera duplikatow');
    assert.ok(subjects.includes('Strona pierwsza'));
    assert.ok(!h.content.querySelector('.arkmail-older'), 'kompletny listing konczy paginacje');

    const snapshot = await waitStoredLetters(4, (current) =>
      Boolean(current.indexMeta.odebrane) && current.indexMeta.odebrane !== completeMarker);
    assert.equal(new Set(snapshot.letters.map((letter) => letter.id)).size, 4, 'archiwum nie zawiera duplikatow');
    assert.ok(!snapshot.letters.some((letter) => letter.subject === 'Stary wpis'), 'pelny skan zastepuje stary rekord');
    assert.ok(snapshot.letters.some((letter) => letter.subject === 'Strona pierwsza'));
    assert.ok(!snapshot.archiveGaps.odebrane?.length, 'kompletny skan czysci luki');
  } finally {
    await stopHarness();
  }
});

test('indeksacja: strona bez promptu kontynuuje skrzynke i zatwierdza pelny wynik', async () => {
  const h = await startHarness({ archive: [oldArchive('Stary wpis')], autoRefreshEnabled: false });
  const { f } = h;
  const anchors = () => f.sent.filter((command) => command.startsWith('listy odebrane przed')).length;
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');
    await waitRt(() => f.sent.includes('listy odebrane'), 'pierwsza strona indeksu');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: Indeks pierwszy', 'mail');
    f.fire('Nadawca: Waldo                          Wt, 24 VIII 1999, 00:11:12', 'mail');

    await waitRt(() => anchors() === 1, 'kolejna strona po ciszy');
    assert.equal(f.sent.find((command) => command.startsWith('listy odebrane przed')), 'listy odebrane przed 25 VIII 1999');
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'nastepna skrzynka');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');

    await waitRt(() => notifyText(f, 'Zindeksowano skrzynki'), 'raport kompletny');
    assert.ok(!notifyText(f, 'Indeksowanie niekompletne'));
    assert.ok(!notifyText(f, 'Pominiete: odebrane'));
    const snapshot = await waitStoredLetters(1, (current) => Boolean(
      current.indexMeta.odebrane && current.indexMeta.nieprzeczytane &&
      current.indexMeta.wyslane && current.indexMeta.niewyslane));
    assert.deepEqual(snapshot.letters.map((letter) => letter.subject), ['Indeks pierwszy']);
  } finally {
    await stopHarness();
  }
});


test('indeksacja przyrostowa: znana strona bez promptu zatwierdza klamre i zakres oznaczania', async () => {
  const knownEntry: MailboxEntry = {
    number: 1,
    isRead: true,
    subject: 'Znany wpis',
    forwarded: false,
    party: 'Waldo',
    partyKind: 'nadawca',
    date: parseMailDate('Wt, 24 VIII 1999, 00:11:12'),
  };
  const known = fromMailboxEntry(
    'odebrane',
    knownEntry,
    scanKeyOfEntries([knownEntry]),
    0,
  );
  const completeMarker = new Date().toISOString();
  const h = await startHarness({
    archive: [known, oldArchive('Nowszy zapis', 'Sr, 25 VIII 1999, 02:20:05')],
    autoRefreshEnabled: false,
    indexMeta: {
      odebrane: completeMarker,
      nieprzeczytane: completeMarker,
      wyslane: completeMarker,
      niewyslane: completeMarker,
    },
  });
  const { f } = h;
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');
    await waitRt(() => f.sent.includes('listy odebrane'), 'znana strona indeksu przyrostowego');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: Znany wpis', 'mail');
    f.fire('Nadawca: Waldo                          Wt, 24 VIII 1999, 00:11:12', 'mail');

    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'nastepna skrzynka po znanej stronie');
    assert.ok(!f.sent.some((command) => command.startsWith('listy odebrane przed')), 'klamra nie otwiera paginacji');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');

    await waitRt(() => notifyText(f, 'Zindeksowano skrzynki'), 'raport kompletny po klamrze');
    assert.ok(!notifyText(f, 'Indeksowanie niekompletne'));
    assert.ok(!notifyText(f, 'Pominiete: odebrane'));
    const snapshot = await waitStoredLetters(1);
    assert.deepEqual(snapshot.letters.map((letter) => letter.subject), ['Znany wpis']);
    assert.equal(snapshot.indexMeta.odebrane, completeMarker, 'klamra nie zmienia stempla kompletu');
  } finally {
    await stopHarness();
  }
});
