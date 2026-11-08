import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import type { MailBox } from '../src/arkmail/core/protocol/types';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  click,
  driveIndexAll,
  notifyText,
  startHarness,
  stopHarness,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const HEAD = [
  'Listy odebrane (prezentowane jest pierwsze 50):',
  ' 3. *R* Temat: najstarszy',
  'Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04',
  ' 2. *R* Temat: srodkowy',
  'Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05',
  ' 1. *R* Temat: najnowszy',
  'Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12',
];

const TAIL = [
  'Listy odebrane:',
  ' 2. *R* Temat: blizniak',
  'Nadawca: Fred                        So, 7 VIII 1999, 10:00:00',
  ' 1. *R* Temat: blizniak',
  'Nadawca: Fred                        So, 7 VIII 1999, 10:00:00',
];

const EMPTY: Record<MailBox, string> = {
  odebrane: 'Nie masz zadnych odebranych listow.',
  nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
  wyslane: 'Nie masz zadnych wyslanych listow.',
  niewyslane: 'Nie masz zadnych niewyslanych listow.',
};

async function startIndexing(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
  click(h, '.arkmail-index-all');
}

async function finishSession(h: Harness): Promise<void> {
  await waitRt(
    () => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '',
    'koniec sesji',
  );
}

interface EntryRow {
  textContent?: string | null;
  dispatchEvent(event: unknown): void;
}

function entryRows(h: Harness): EntryRow[] {
  return Array.from(h.content.querySelectorAll('.arkmail-entry') as unknown as Iterable<EntryRow>);
}

function fireLines(h: Harness, lines: readonly string[]): void {
  for (const line of lines) h.f.fire(line, 'mail');
  h.f.fire('> ', 'prompt');
}

async function storageSnapshot(): Promise<{
  archive: ArchiveLetter[];
  indexMeta: Partial<Record<MailBox, string>>;
}> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const letters = await driver.loadAllLetters();
  const values = await driver.loadAll();
  await driver.close();
  return {
    archive: Object.values(letters.foo ?? {}).map((raw) => JSON.parse(raw) as ArchiveLetter),
    indexMeta: JSON.parse(values['arkmail.foo.indeks'] ?? '{}') as Partial<Record<MailBox, string>>,
  };
}

function comparableArchive(letters: readonly ArchiveLetter[]): string[] {
  return letters.map((letter) => JSON.stringify(letter)).sort();
}

function seedArchive(): ArchiveLetter[] {
  return [2, 1].map((number, position) => {
    const entry: MailboxEntry = {
      number,
      isRead: true,
      subject: 'blizniak',
      forwarded: false,
      party: 'Fred',
      partyKind: 'nadawca',
      date: parseMailDate('So, 7 VIII 1999, 10:00:00'),
    };
    return fromMailboxEntry('odebrane', entry, 'seed-tail', position);
  });
}

function replayLetter(h: Harness, number: number): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Fred', 'mail');
  h.f.fire('Temat: blizniak', 'mail');
  h.f.fire('Data : So, 7 VIII 1999, 10:00:00', 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Tresc starszego listu.', 'mail');
  h.f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
  h.f.fire('> ', 'prompt');
}

test('po relogu przeczes inkrementalny odtwarza starsze wiersze z archiwum bez dodatkowych stron', async () => {
  let h = await startHarness();
  let snapshot: Awaited<ReturnType<typeof storageSnapshot>>;
  try {
    await startIndexing(h);
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'pierwsza strona pelnej indeksacji');
    fireLines(h, HEAD);
    await waitRt(() => h.f.sent.includes('listy odebrane przed 23 VIII 1999'), 'starsza strona pelnej indeksacji');
    fireLines(h, TAIL);
    for (const box of ['nieprzeczytane', 'wyslane', 'niewyslane'] as const) {
      await waitRt(() => h.f.sent.includes(`listy ${box}`), `pusta skrzynka ${box}`);
      fireLines(h, [EMPTY[box]]);
    }
    await waitRt(() => notifyText(h.f, 'Zindeksowano skrzynki'), 'koniec pelnej indeksacji');
    await finishSession(h);
    click(h, '[data-tab="listy"]');
    assert.equal(entryRows(h).length, 5, 'pelna indeksacja pokazuje glowe i starsza strone');

    snapshot = await storageSnapshot();
    assert.equal(snapshot.archive.filter((letter) => letter.box === 'odebrane').length, 5);
    assert.ok(snapshot.indexMeta.odebrane, 'kompletna skrzynka ma znacznik indeksacji');
  } finally {
    await stopHarness();
  }

  h = await startHarness({ archive: snapshot!.archive, indexMeta: snapshot!.indexMeta });
  try {
    assert.equal(entryRows(h).length, 0, 'widok w RAM jest pusty po ponownym uruchomieniu');
    const archiveBefore = comparableArchive(snapshot!.archive);

    await startIndexing(h);
    await driveIndexAll(h, { odebrane: HEAD });
    await waitRt(() => notifyText(h.f, 'Zindeksowano skrzynki'), 'koniec pierwszego przeczesu inkrementalnego');
    await finishSession(h);
    click(h, '[data-tab="listy"]');

    assert.equal(entryRows(h).length, 5, 'widok odzyskuje wszystkie listy z lokalnego archiwum');
    assert.equal(
      entryRows(h).filter((row) => String(row.textContent ?? '').includes('blizniak')).length,
      2,
      'blizniaki pozostaja dwoma niezaleznymi wierszami',
    );
    assert.equal(
      h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length,
      0,
      'odtworzenie nie wysyla zadnej komendy paginacji',
    );
    assert.deepEqual(comparableArchive((await storageSnapshot()).archive), archiveBefore, 'archiwum bez zmian');

    await startIndexing(h);
    await driveIndexAll(h, { odebrane: HEAD });
    await waitRt(() => notifyText(h.f, 'Zindeksowano skrzynki'), 'koniec drugiego przeczesu inkrementalnego');
    await finishSession(h);
    click(h, '[data-tab="listy"]');
    assert.equal(entryRows(h).length, 5, 'kolejny przeczes jest idempotentny');
    assert.deepEqual(comparableArchive((await storageSnapshot()).archive), archiveBefore, 'archiwum nadal bez zmian');

    const olderRow = entryRows(h).find((row) => String(row.textContent ?? '').includes('blizniak'));
    assert.ok(olderRow, 'wiersz starszego listu jest widoczny');
    olderRow.dispatchEvent(new h.window.Event('click'));
    await waitRt(() => h.f.sent.includes('listy odebrane przed 8 VIII 1999'), 're-kotwica starszego wpisu');
    fireLines(h, TAIL);
    await waitRt(() => h.f.sent.some((command) => /^przeczytaj list [12]$/.test(command)), 'odczyt po re-kotwicy');
    const read = h.f.sent.find((command) => /^przeczytaj list [12]$/.test(command))!;
    replayLetter(h, Number(read.split(' ').pop()));
    await waitRt(() => textOf(h, '.arkmail-letter-body').includes('Tresc starszego listu.'), 'tresc starszego listu');
  } finally {
    await stopHarness();
  }
});

test('anulowanie indeksacji nie odtwarza widoku z archiwum', async () => {
  const archive = seedArchive();
  const indexMeta = { odebrane: new Date().toISOString() };
  const h = await startHarness({ archive, indexMeta });
  try {
    await startIndexing(h);
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'pierwsza strona przed anulowaniem');
    fireLines(h, HEAD);
    await waitRt(() => h.f.sent.includes('listy odebrane przed 23 VIII 1999'), 'skan czeka na starsza strone');
    click(h, '.arkmail-index-all');
    fireLines(h, ['Nie znaleziono zadnych takich odebranych listow.']);
    await waitRt(() => notifyText(h.f, 'Przerwano indeksowanie'), 'potwierdzenie anulowania');
    await finishSession(h);
    click(h, '[data-tab="listy"]');
    assert.equal(entryRows(h).length, 3, 'po anulowaniu zostaje tylko swieza glowa');
    assert.equal(h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length, 1);
  } finally {
    await stopHarness();
  }
});

test('niekompletna indeksacja nie odtwarza widoku z archiwum', async () => {
  const archive = seedArchive();
  const indexMeta = { odebrane: new Date().toISOString() };
  const h = await startHarness({ archive, indexMeta });
  try {
    await startIndexing(h);
    await driveIndexAll(h, {
      odebrane: [
        'Listy odebrane (prezentowane jest pierwsze 50):',
        ' 1. *R* Temat: wpis bez daty',
      ],
    });
    await waitRt(() => notifyText(h.f, 'Indeksowanie niekompletne'), 'potwierdzenie niekompletnej indeksacji');
    await finishSession(h);
    click(h, '[data-tab="listy"]');
    assert.equal(entryRows(h).length, 1, 'niekompletny przeczes zostawia tylko swiezy wynik');
    assert.equal(h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length, 0);
  } finally {
    await stopHarness();
  }
});

test('zwykle odswiezenie nadal pokazuje tylko pobrana strone', async () => {
  const archive = seedArchive();
  const indexMeta = { odebrane: new Date().toISOString() };
  const h = await startHarness({ archive, indexMeta });
  try {
    click(h, '[data-box="odebrane"]');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'zwykle odswiezenie');
    fireLines(h, HEAD);
    await finishSession(h);
    assert.equal(entryRows(h).length, 3, 'odswiezenie nie uruchamia odtwarzania archiwum');
    assert.equal(h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length, 0);
  } finally {
    await stopHarness();
  }
});
