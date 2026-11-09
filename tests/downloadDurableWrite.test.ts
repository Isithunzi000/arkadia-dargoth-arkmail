/**
 * Sekcja 16, krok 4: trwaly zapis per rekord i reconnect.
 * Wszystkie identyfikatory, osoby i tresci sa syntetyczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordId,
  scanKeyOfEntries,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import {
  IndexedDbStorageDriver,
  MemoryStorageDriver,
} from '../src/arkmail/adapters/storageDriver';
import {
  openWriteThroughStorage,
  WriteThroughStorage,
} from '../src/arkmail/adapters/writeThroughStorage';
import {
  clearArchiveDownloadDiagnostics,
  readArchiveDownloadDiagnostics,
} from '../src/arkmail/core/archiveDownload';
import {
  click,
  notifyText,
  startHarness,
  stopHarness,
  waitRt,
  type Harness,
} from './harness';

const DATE = 'Wt, 24 VIII 1999, 10:00:00';
const BODY = 'Syntetyczna tresc do trwalego zapisu.';
const WRITE_ERROR = 'Nie udalo sie zapisac pobranej tresci w IndexedDB.';

const date = {
  raw: DATE,
  weekday: 'Wt',
  day: 24,
  month: 8,
  year: 1999,
  time: '10:00:00',
} as const;

const page: MailboxEntry[] = [
  {
    number: 1,
    isRead: true,
    subject: 'Syntetyczny temat',
    forwarded: false,
    party: 'Corge',
    partyKind: 'nadawca',
    date: { ...date },
  },
];

const SCAN_KEY = scanKeyOfEntries(page);
const ID = recordId('odebrane', SCAN_KEY, 0);

function record(body: string[] = []): ArchiveLetter {
  return {
    id: ID,
    box: 'odebrane',
    number: 1,
    party: 'Corge',
    subject: 'Syntetyczny temat',
    forwarded: false,
    dateRaw: DATE,
    sortKey: '1999-08-24 10:00:00',
    read: true,
    body,
  };
}

function replayListing(h: Harness): void {
  h.f.fire('Listy odebrane:', 'mail');
  h.f.fire(' 1. *R* Temat: Syntetyczny temat', 'mail');
  h.f.fire(`Nadawca: Corge                       ${DATE}`, 'mail');
  h.f.fire('> ', 'prompt');
}

function replayLetter(h: Harness): void {
  h.f.fire('List : 1', 'mail');
  h.f.fire('Od   : Corge', 'mail');
  h.f.fire('Temat: Syntetyczny temat', 'mail');
  h.f.fire(`Data : ${DATE}`, 'mail');
  h.f.fire('', 'mail');
  h.f.fire(BODY, 'mail');
  h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
  h.f.fire('> ', 'prompt');
}

function clickDownload(h: Harness): void {
  click(h, '[data-tab="archiwum"]');
  click(h, '.arkmail-arch-download');
  click(h, '.arkmail-arch-download');
}

async function beginOneRecordDownload(h: Harness): Promise<void> {
  clearArchiveDownloadDiagnostics();
  clickDownload(h);
  await waitRt(
    () => h.f.sent.some((command) => command.startsWith('listy odebrane przed')),
    're-kotwica przed odczytem',
  );
  replayListing(h);
  await waitRt(() => h.f.sent.includes('przeczytaj list 1'), 'odczyt rekordu');
}

async function readBack(): Promise<ArchiveLetter | undefined> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const saved = await driver.loadAllLetters();
  await driver.close();
  const raw = saved.foo?.[ID];
  return raw === undefined ? undefined : JSON.parse(raw) as ArchiveLetter;
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('pobrano czeka na trwaly zapis rekordu, a odczyt bazy potwierdza jego tresc', async () => {
  const h = await startHarness({ archive: [record()] });
  const original = IndexedDbStorageDriver.prototype.putLetters;
  const gate = deferred();
  let calls = 0;
  IndexedDbStorageDriver.prototype.putLetters = async function (character, values) {
    calls += 1;
    await gate.promise;
    await original.call(this, character, values);
  };
  try {
    await beginOneRecordDownload(h);
    replayLetter(h);
    await waitRt(() => calls === 1, 'rozpoczecie zapisu IndexedDB');
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(readArchiveDownloadDiagnostics(), [], 'RAM nie wystarcza do wyniku pobrano');
    assert.equal(notifyText(h.f, 'Pobrano: 1 z 1.'), false, 'podsumowanie tez czeka na zapis');
    assert.deepEqual((await readBack())?.body, [], 'przed zatwierdzeniem baza ma stary rekord');

    gate.release();
    await waitRt(
      () => readArchiveDownloadDiagnostics().some((event) => event.result === 'pobrano'),
      'pobrano po trwalym zapisie',
    );
    assert.deepEqual((await readBack())?.body, ['', BODY]);
    assert.equal(calls, 1, 'jeden zmieniony rekord wymaga jednego zapisu wsadowego');
  } finally {
    gate.release();
    IndexedDbStorageDriver.prototype.putLetters = original;
    await stopHarness();
  }
});

test('blad IndexedDB daje blad_zapisu, konkretny komunikat i zostawia rekord do ponowienia', async () => {
  const h = await startHarness({ archive: [record()] });
  const original = IndexedDbStorageDriver.prototype.putLetters;
  IndexedDbStorageDriver.prototype.putLetters = async () => {
    throw new Error('Syntetyczny blad transakcji.');
  };
  try {
    await beginOneRecordDownload(h);
    replayLetter(h);
    await waitRt(
      () => readArchiveDownloadDiagnostics().length === 1,
      'koncowy wynik bledu zapisu',
    );

    const events = readArchiveDownloadDiagnostics();
    assert.equal(events[0]?.result, 'blad_zapisu');
    assert.equal(events[0]?.stage, 'zapis');
    assert.ok(notifyText(h.f, WRITE_ERROR), 'uzytkownik dostaje konkretna przyczyne');
    await waitRt(() => notifyText(h.f, 'Pobrano: 0 z 1. Nieudane: 1.'), 'podsumowanie bledu');
    assert.ok(notifyText(h.f, 'Pobrano: 0 z 1. Nieudane: 1.'), 'blad nie jest pobraniem');
    assert.deepEqual((await readBack())?.body, [], 'niepotwierdzona tresc nie trafia do bazy');

    await waitRt(() => notifyText(h.f, 'Pobrano: 0 z 1. Nieudane: 1.'), 'koniec pierwszej proby');
    await waitRt(
      () => ((h.content.querySelector('.arkmail-busy') as { textContent?: string } | null)?.textContent ?? '') === '',
      'zwolnienie pierwszej operacji',
    );
    const anchors = h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length;
    clearArchiveDownloadDiagnostics();
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');
    await waitRt(
      () => h.f.sent.filter((command) => command.startsWith('listy odebrane przed')).length > anchors,
      'ponowne uruchomienie nadal wybiera niezapisany rekord',
    );
  } finally {
    IndexedDbStorageDriver.prototype.putLetters = original;
    await stopHarness();
  }
});

test('reconnect podczas zapisu zachowuje potwierdzony rekord i nie odradza petli', async () => {
  const h = await startHarness({ archive: [record()] });
  const original = IndexedDbStorageDriver.prototype.putLetters;
  const gate = deferred();
  const finished = deferred();
  let calls = 0;
  IndexedDbStorageDriver.prototype.putLetters = async function (character, values) {
    calls += 1;
    await gate.promise;
    await original.call(this, character, values);
    finished.release();
  };
  try {
    await beginOneRecordDownload(h);
    replayLetter(h);
    await waitRt(() => calls === 1, 'zapis przed reconnectem');
    const commandsBefore = h.f.sent.length;

    h.f.fireEvent('client.disconnect', undefined);
    h.f.fireEvent('client.connect', undefined);
    gate.release();
    await finished.promise;
    await waitRt(
      () => readArchiveDownloadDiagnostics().length === 1,
      'zamkniecie przerwanej operacji po zapisie',
    );

    assert.deepEqual((await readBack())?.body, ['', BODY], 'potwierdzony zapis nie znika');
    assert.equal(readArchiveDownloadDiagnostics()[0]?.result, 'anulowano');
    assert.equal(readArchiveDownloadDiagnostics()[0]?.stage, 'zapis');
    assert.deepEqual(h.f.sent.slice(commandsBefore), [], 'stara petla nie wysyla nowych komend');
  } finally {
    gate.release();
    IndexedDbStorageDriver.prototype.putLetters = original;
    await stopHarness();
  }
});

test('potwierdzenie zapisu nie wywoluje flush, propaguje blad i restart czyta tylko zatwierdzona wersje', async () => {
  class GatedDriver extends MemoryStorageDriver {
    readonly writes: Array<Record<string, string>> = [];
    fail = false;
    gate: Promise<void> | null = null;

    override async putLetters(character: string, values: Readonly<Record<string, string>>): Promise<void> {
      this.writes.push({ ...values });
      if (this.fail) throw new Error('Syntetyczny blad trwalego zapisu.');
      if (this.gate) await this.gate;
      await super.putLetters(character, values);
    }
  }

  const driver = new GatedDriver();
  const storage = await WriteThroughStorage.open(driver, () => {});
  const confirmedStorage = storage as unknown as {
    setLettersConfirmed(character: string, letters: readonly ArchiveLetter[]): Promise<void>;
  };
  const otherRecord: ArchiveLetter = {
    ...record(['Druga syntetyczna tresc.']),
    id: `${ID}-drugi`,
    number: 2,
  };
  storage.setLetters('Foo', [record(), otherRecord]);
  await storage.flush();
  driver.writes.length = 0;

  let flushCalls = 0;
  const originalFlush = storage.flush.bind(storage);
  storage.flush = async () => {
    flushCalls += 1;
    await originalFlush();
  };
  const gate = deferred();
  driver.gate = gate.promise;
  let settled = false;
  const writing = confirmedStorage.setLettersConfirmed('Foo', [
    record([BODY]),
    otherRecord,
  ]).then(() => {
    settled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(settled, false, 'obietnica czeka na sterownik');
  assert.equal(driver.writes.length, 1);
  assert.deepEqual(Object.keys(driver.writes[0] ?? {}), [ID], 'zapis obejmuje tylko zmieniony rekord');
  gate.release();
  await writing;
  assert.equal(flushCalls, 0, 'potwierdzenie per rekord nie wykonuje pelnego flush');

  driver.fail = true;
  await assert.rejects(
    confirmedStorage.setLettersConfirmed('Foo', [record(['Niezatwierdzona wersja.'])]),
    /Syntetyczny blad trwalego zapisu/,
  );
  const restarted = await WriteThroughStorage.open(driver, () => {});
  assert.deepEqual(
    JSON.parse(restarted.getLetters('Foo')[ID] ?? '{}').body,
    [BODY],
    'restart nie odtwarza odrzuconej wersji z RAM',
  );
});

test('magazyn awaryjny tylko w RAM nie potwierdza trwalego zapisu', async () => {
  const factory = {
    open(): IDBOpenDBRequest {
      throw new Error('Syntetyczny brak IndexedDB.');
    },
  } as unknown as IDBFactory;
  const storage = await openWriteThroughStorage(() => {}, factory);

  await assert.rejects(
    storage.setLettersConfirmed('Foo', [record([BODY])]),
    /trwalego zapisu|IndexedDB/,
  );
  assert.deepEqual(storage.getLetters('Foo'), {}, 'odrzucony zapis nie zmienia stanu RAM');
  await storage.close();
});

test('ponowne pobieranie po restarcie wybiera wylacznie rekord nadal bez tresci', async () => {
  const h = await startHarness({ archive: [record([BODY])] });
  try {
    clickDownload(h);
    await waitRt(
      () => notifyText(h.f, 'Wszystkie listy w bazie maja tresci.'),
      'brak kandydatow po odczycie potwierdzonego rekordu',
    );
    assert.equal(h.f.sent.includes('listy odebrane przed 24 VIII 1999'), false);
    assert.equal(h.f.sent.includes('przeczytaj list 1'), false);
  } finally {
    await stopHarness();
  }
});
