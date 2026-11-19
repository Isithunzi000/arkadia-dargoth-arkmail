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

test('mailbox: listing bez promptu jest uzyteczny, niepotwierdzony i zwalnia kolejna operacje', async (context) => {
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
  assert.equal(result.kind === 'lista' && Reflect.get(result, 'confirmed'), false);
  assert.equal(result.kind === 'lista' ? result.entries.length : 0, 1);

  const next = mailbox.fetch('odebrane');
  await transport.replay([
    { cls: 'mail', text: 'Nie masz zadnych odebranych listow.' },
    { cls: 'prompt', text: '> ' },
  ]);
  assert.equal((await next).kind, 'pusta');
});

test('odswiezenie: listing bez promptu trafia do widoku, nie kasuje archiwum i nie blokuje ponowienia', async () => {
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
      if (subjects.join('|') === 'Nowy wpis|Stary wpis') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.deepEqual(subjects, ['Nowy wpis', 'Stary wpis']);

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

test('indeksacja: niepotwierdzony listing nie konczy skrzynki jako kompletnej i nie zatrzymuje kolejnej', async () => {
  const h = await startHarness({ autoRefreshEnabled: false });
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'indeksacja odebranych');
    fireListing(h, 'Niepotwierdzony wpis');

    await waitRt(() => h.f.sent.includes('listy nieprzeczytane'), 'nastepna skrzynka');
    h.f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => h.f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
    h.f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => h.f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
    h.f.fire('Nie masz zadnych niewyslanych listow.', 'mail');

    await waitRt(() => notifyText(h.f, 'Indeksowanie niekompletne'), 'raport niekompletny');
    assert.ok(notifyText(h.f, 'Pominiete: odebrane'));
    assert.ok(!notifyText(h.f, 'Zindeksowano skrzynki'));
    let subjects: string[] = [];
    for (let i = 0; i < 240; i++) {
      subjects = await storedSubjects();
      if (subjects.join('|') === 'Niepotwierdzony wpis') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.deepEqual(subjects, ['Niepotwierdzony wpis']);
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

test('skan: liczy niepotwierdzone strony i listing bazowy bez zmiany strukturalnego konca', async () => {
  const entry = (subject: string, day: number, time: string): MailboxEntry => ({
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
  const first = entry('Pierwsza', 24, '10:00:00');
  const base = entry('Bazowa', 25, '10:00:00');
  const last = entry('Ostatnia', 23, '10:00:00');
  const page = (
    entries: MailboxEntry[],
    truncated: boolean,
    confirmed: boolean,
  ): MailboxResult => ({
    kind: 'lista',
    header: { box: 'odebrane', truncated },
    entries,
    confirmed,
  });
  const anchor = 'listy odebrane przed 25 VIII 1999';
  const commands: Array<string | undefined> = [];
  let baseRefreshes = 0;
  const result = await scanMailboxPages({
    box: 'odebrane',
    initialCommand: anchor,
    cancelled: () => false,
    fetchPage: async (command) => {
      commands.push(command);
      if (commands.length === 1) return page([first], true, false);
      if (commands.length === 2) return page([first], true, true);
      if (commands.length === 3) return page([base], true, false);
      return page([last], false, true);
    },
    wait: async () => {},
    onBaseRefresh: () => { baseRefreshes += 1; },
    onPage: () => ({}),
  });

  assert.equal(result.end, 'complete');
  assert.equal(result.pages, 3);
  assert.equal(Reflect.get(result, 'unconfirmedPages'), 2);
  assert.equal(baseRefreshes, 1);
  assert.deepEqual(commands, [anchor, anchor, undefined, anchor]);
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
    assert.ok(notifyText(h.f, 'Nie potwierdzono zamkniecia odpowiedzi: 1'));
    assert.ok(!notifyText(h.f, 'nie potwierdzono pelnej odpowiedzi - sprobuj ponownie'));
    const snapshot = await waitStoredLetters(4);
    assert.ok(snapshot.letters.some((letter) => letter.subject === 'Starszy bez promptu'));
  } finally {
    await stopHarness();
  }
});

test('wczytaj wszystkie: wiele stron bez promptu dociera do konca i zachowuje archiwum', async () => {
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
    await waitRt(
      () => anchors() === 2 || notifyText(f, 'nie potwierdzono pelnej odpowiedzi - sprobuj ponownie'),
      'druga komenda po stronie bez promptu',
    );
    assert.equal(anchors(), 2, 'pierwsza strona bez promptu nie moze zatrzymac petli');
    assert.equal(
      f.sent.filter((command) => command.startsWith('listy odebrane przed'))[1],
      'listy odebrane przed 16 VIII 1999',
    );

    fireOlderPage(h, 'Strona druga', 'Pn, 9 VIII 1999, 09:00:00', false);
    await waitRt(() => notifyText(f, 'Wczytano wszystkie strony'), 'koniec calej petli bez promptow');
    assert.equal(anchors(), 2, 'naturalny koniec nie wysyla dodatkowej komendy');
    assert.ok(!notifyText(f, 'nie potwierdzono pelnej odpowiedzi - sprobuj ponownie'));
    assert.ok(notifyText(f, 'Nie potwierdzono zamkniecia odpowiedzi: 2'));
    assert.ok(notifyText(f, '5 (dodano: 2)'));

    const subjects = Array.from(h.content.querySelectorAll('.arkmail-entry-subject'))
      .map((element) => String((element as { textContent?: string }).textContent ?? ''));
    assert.equal(subjects.length, 5);
    assert.equal(new Set(subjects).size, 5, 'widok nie zawiera duplikatow');
    assert.ok(subjects.includes('Strona pierwsza'));
    assert.ok(subjects.includes('Strona druga'));
    await waitRt(() => !h.content.querySelector('.arkmail-older'), 'koniec paginacji w widoku');

    const snapshot = await waitStoredLetters(6);
    assert.equal(new Set(snapshot.letters.map((letter) => letter.id)).size, 6, 'archiwum nie zawiera duplikatow');
    assert.ok(snapshot.letters.some((letter) => letter.subject === 'Stary wpis'), 'stary rekord nie zostal usuniety');
    assert.ok(snapshot.letters.some((letter) => letter.subject === 'Strona pierwsza'));
    assert.ok(snapshot.letters.some((letter) => letter.subject === 'Strona druga'));
    assert.equal(snapshot.indexMeta.odebrane, completeMarker, 'niepotwierdzony skan nie zmienia stempla');
    assert.deepEqual(snapshot.archiveGaps.odebrane, ['1999-08-01'], 'niepotwierdzony skan nie czysci luk');
  } finally {
    await stopHarness();
  }
});

test('indeksacja: kolejne strony bez promptu sa zapisywane, ale skrzynka pozostaje niekompletna', async () => {
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

    await waitRt(
      () => anchors() === 1 || f.sent.includes('listy nieprzeczytane'),
      'druga strona indeksu bez promptu',
    );
    assert.equal(anchors(), 1, 'niepotwierdzona pierwsza strona nie moze przerwac indeksu');
    assert.equal(f.sent.find((command) => command.startsWith('listy odebrane przed')), 'listy odebrane przed 25 VIII 1999');
    fireOlderPage(h, 'Indeks drugi', 'Pn, 23 VIII 1999, 02:20:05', false);

    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'nastepna skrzynka po dwoch stronach');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja niewyslanych');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');

    await waitRt(() => notifyText(f, 'Indeksowanie niekompletne'), 'raport niekompletny');
    assert.ok(notifyText(f, 'Pominiete: odebrane (nie potwierdzono zamkniecia odpowiedzi: 2)'));
    assert.ok(!notifyText(f, 'Zindeksowano skrzynki'));
    const snapshot = await waitStoredLetters(3, (current) => Boolean(current.indexMeta.nieprzeczytane));
    assert.deepEqual(snapshot.letters.map((letter) => letter.subject).sort(), ['Indeks drugi', 'Indeks pierwszy', 'Stary wpis']);
    assert.equal(snapshot.indexMeta.odebrane, undefined, 'brak stempla kompletu dla odebranych');
    assert.ok(snapshot.indexMeta.nieprzeczytane, 'kolejna skrzynka zostala zatwierdzona');
  } finally {
    await stopHarness();
  }
});


test('indeksacja przyrostowa: znana strona bez promptu nie pozwala oznaczac zniknietych listow', async () => {
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

    await waitRt(() => notifyText(f, 'Indeksowanie niekompletne'), 'raport niekompletny po klamrze');
    assert.ok(notifyText(f, 'Pominiete: odebrane (nie potwierdzono zamkniecia odpowiedzi: 1)'));
    const snapshot = await waitStoredLetters(2);
    assert.deepEqual(snapshot.letters.map((letter) => letter.subject).sort(), ['Nowszy zapis', 'Znany wpis']);
    assert.equal(snapshot.indexMeta.odebrane, completeMarker, 'stempel nie zostal odswiezony ani usuniety');
  } finally {
    await stopHarness();
  }
});
