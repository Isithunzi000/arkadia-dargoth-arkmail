/**
 * Sekcja 16.14: deterministyczny skan re-kotwicy i dzien z ponad 50 listami.
 * Wszystkie wpisy, osoby i tresci sa syntetyczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMailboxEntry,
  scanKeyOfEntries,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { scanMailboxPages } from '../src/arkmail/core/pagination';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import type { MailboxEntry, MailboxResult } from '../src/arkmail/core/session/mailbox';
import {
  startHarness,
  stopHarness,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const DAY = 'Wt, 24 VIII 1999';
const ANCHOR = 'listy odebrane przed 25 VIII 1999';
const PROBE = 'listy odebrane przed 24 VIII 1999';

const dateAt = (seconds: number) => ({
  raw: `${DAY}, 00:00:${String(seconds).padStart(2, '0')}`,
  weekday: 'Wt',
  day: 24,
  month: 8,
  year: 1999,
  time: `00:00:${String(seconds).padStart(2, '0')}`,
});

const entry = (number: number, subject = `Wpis ${number}`): MailboxEntry => ({
  number,
  isRead: true,
  subject,
  forwarded: false,
  party: 'Testowy Nadawca',
  partyKind: 'nadawca',
  date: dateAt(number - 1),
});

const page = (entries: MailboxEntry[], truncated: boolean): MailboxResult => ({
  kind: 'lista',
  header: { box: 'odebrane', truncated },
  entries,
});

function replayPage(h: Harness, entries: readonly MailboxEntry[], truncated: boolean): void {
  h.f.fire(`Listy odebrane${truncated ? ' (prezentowane jest pierwsze 50)' : ''}:`, 'mail');
  for (const item of entries) {
    h.f.fire(`${String(item.number).padStart(2, ' ')}. *R* Temat: ${item.subject}`, 'mail');
    h.f.fire(`Nadawca: ${item.party}                        ${item.date!.raw}`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

const clickDownloadTwice = (h: Harness): void => {
  const button = h.content.querySelector('.arkmail-arch-download') as {
    dispatchEvent(event: unknown): void;
  } | null;
  assert.ok(button, 'przycisk pobierania istnieje');
  button.dispatchEvent(new h.window.Event('click'));
  button.dispatchEvent(new h.window.Event('click'));
};

test('skan: znalezienie blizniaka na powtorzonej stronie konczy sie bez dodatkowych kotwic', async () => {
  const twins = [entry(2, 'Blizniak'), entry(1, 'Blizniak')].map((item) => ({
    ...item,
    date: dateAt(0),
  }));
  const commands: Array<string | undefined> = [];
  const waits: number[] = [];
  let visits = 0;
  const result = await scanMailboxPages({
    box: 'odebrane',
    initialCommand: ANCHOR,
    cancelled: () => false,
    fetchPage: async (command?: string) => {
      commands.push(command);
      assert.ok(commands.length <= 2, 'po znalezieniu celu nie wolno pobierac kolejnej strony');
      return page(twins, true);
    },
    wait: async (ms) => {
      waits.push(ms);
    },
    onPage: () => {
      visits += 1;
      return { stop: visits === 2 };
    },
  });

  assert.equal(result.end, 'clamped');
  assert.equal(result.pages, 2);
  assert.deepEqual(commands, [ANCHOR, ANCHOR]);
  assert.deepEqual(waits, [400], 'jedyna pauza miedzy pierwsza a druga strona');
});

test('dzien 51: cel poza pierwsza strona zostaje, skan jest deterministyczny i zdejmuje komplet', async () => {
  const allEntries = Array.from({ length: 51 }, (_, index) => entry(51 - index));
  const firstPage = allEntries.slice(0, 50);
  const target = fromMailboxEntry('odebrane', allEntries[50]!, scanKeyOfEntries(allEntries), 50);
  const completeMarker = '1999-08-24T12:00:00.000Z';
  const h = await startHarness({
    archive: [target],
    indexMeta: { odebrane: completeMarker },
  });
  try {
    click(h, '[data-tab="archiwum"]');
    clickDownloadTwice(h);

    await waitRt(() => h.f.sent.filter((command) => command === ANCHOR).length === 1, 'pierwsza kotwica');
    replayPage(h, firstPage, true);
    await waitRt(() => h.f.sent.filter((command) => command === ANCHOR).length === 2, 'ponowna kotwica dnia');
    replayPage(h, firstPage, true);

    for (let retry = 1; retry <= 3; retry += 1) {
      await waitRt(
        () => h.f.sent.filter((command) => command === 'listy odebrane').length === retry,
        `listing bazowy przed proba ${retry}`,
      );
      replayPage(h, firstPage, true);
      await waitRt(
        () => h.f.sent.filter((command) => command === ANCHOR).length === retry + 2,
        `kotwica po probie ${retry}`,
      );
      replayPage(h, firstPage, true);
    }

    await waitRt(() => h.f.sent.includes(PROBE), 'sonda wykluczajaca caly dzien');
    h.f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => notifyText(h.f, 'Pobrano: 0 z 1. Nieudane: 1.'), 'koncowy blad kotwiczenia');

    assert.deepEqual(
      h.f.sent.filter((command) => command === 'listy odebrane' || command.startsWith('listy odebrane przed')),
      [ANCHOR, ANCHOR, 'listy odebrane', ANCHOR, 'listy odebrane', ANCHOR, 'listy odebrane', ANCHOR, PROBE],
      'dokladna sekwencja stron, ponowien i sondy',
    );
    assert.equal(h.f.sent.some((command) => command.startsWith('przeczytaj list')), false, 'brak odczytu innego listu');
    assert.equal(notifyText(h.f, 'Nie ma juz w skrzynce'), false, 'luka serwera nie jest falszywym missing');

    const { readArchiveDownloadDiagnostics } = await import('../src/arkmail/core/archiveDownload.js');
    const diagnostic = readArchiveDownloadDiagnostics().at(-1);
    assert.equal(diagnostic?.result, 'blad_kotwiczenia');
    assert.equal(diagnostic?.stage, 'kotwiczenie');

    const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
    const storedLetters = await driver.loadAllLetters();
    const storedTarget = storedLetters.foo?.[target.id];
    assert.ok(storedTarget, 'cel poza pierwsza strona pozostaje w bazie');
    assert.deepEqual((JSON.parse(storedTarget) as ArchiveLetter).body, []);
    const values = await driver.loadAll();
    assert.deepEqual(JSON.parse(values['arkmail.foo.indeks'] ?? '{}'), {}, 'zapis pojedynczego skanu nie przywraca kompletu');
    await driver.close();
  } finally {
    await stopHarness();
  }
});
