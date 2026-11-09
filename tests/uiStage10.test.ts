import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { downloadBlob } from '../src/arkmail/ui/download';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const DATE_RAW = 'Wt, 24 VIII 1999, 00:11:12';
const HANDLERS = {} as MailUiHandlers;

function archived(subject: string, over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    ...fromMailboxEntry('odebrane', {
      number: 1,
      isRead: true,
      subject,
      forwarded: false,
      party: 'Foo',
      partyKind: 'nadawca',
      date: {
        raw: DATE_RAW,
        weekday: 'Wt',
        day: 24,
        month: 8,
        year: 1999,
        time: '00:11:12',
      },
    }),
    ...over,
  };
}

interface OperationSummary {
  text: string;
  level: 'success' | 'warning';
}

interface SummaryModule {
  buildDownloadSummary(result: {
    done: number;
    total: number;
    failed: number;
    missing: number;
  }): OperationSummary;
  buildExportSummary(fileCount: number, skipped: number): OperationSummary;
}

async function summaryModule(): Promise<SummaryModule> {
  const path = '../src/arkmail/ui/operationSummary.js';
  return (await import(path)) as SummaryModule;
}

test('etap 10: wspolny budowniczy rozroznia pelny sukces i wynik czesciowy', async () => {
  const { buildDownloadSummary, buildExportSummary } = await summaryModule();
  const forms: Array<[number, string]> = [
    [0, '0 listow'],
    [1, '1 list'],
    [2, '2 listy'],
    [4, '4 listy'],
    [5, '5 listow'],
    [21, '21 listow'],
    [22, '22 listy'],
    [25, '25 listow'],
  ];
  for (const [count, form] of forms) {
    assert.deepEqual(
      buildDownloadSummary({ done: count, total: count, failed: 0, missing: 0 }),
      { text: `Pobrano tresci do archiwum (${form}).`, level: 'success' },
    );
  }
  assert.deepEqual(
    buildDownloadSummary({ done: 1, total: 5, failed: 4, missing: 0 }),
    { text: 'Pobrano: 1 z 5. Nieudane: 4.', level: 'warning' },
  );
  assert.deepEqual(
    buildDownloadSummary({ done: 1, total: 5, failed: 0, missing: 2 }),
    { text: 'Pobrano: 1 z 5. Nie ma juz w skrzynce: 2. Pozostale: 2.', level: 'warning' },
  );
  assert.deepEqual(
    buildDownloadSummary({ done: 1, total: 5, failed: 2, missing: 1 }),
    { text: 'Pobrano: 1 z 5. Nieudane: 2. Nie ma juz w skrzynce: 1. Pozostale: 1.', level: 'warning' },
  );
  for (const count of [0, 1, 2, 4, 5, 21, 22, 25]) {
    assert.deepEqual(
      buildExportSummary(count, 3),
      {
        text: `Zapisano pliki TXT do ZIP. Liczba plikow: ${count}. Pominiete bez tresci: 3.`,
        level: 'success',
      },
    );
  }
  assert.deepEqual(buildExportSummary(2, 0), {
    text: 'Zapisano pliki TXT do ZIP. Liczba plikow: 2. Pominiete bez tresci: 0.',
    level: 'success',
  });
});

test('etap 10 T19: kazdy adres URL jest uniewazniony opozniono i dokladnie raz', () => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const originalSetTimeout = globalThis.setTimeout;
  const timers: Array<() => void> = [];
  const revoked: string[] = [];
  let created = 0;
  let clicked = 0;
  const documentStub = {
    createElement: (_tag: string) => ({
      href: '',
      download: '',
      click: () => {
        clicked += 1;
      },
      remove: () => {},
    }),
    body: {
      appendChild: (_el: unknown) => {},
      removeChild: (_el: unknown) => {},
    },
  };
  try {
    (globalThis as { document?: unknown }).document = documentStub;
    (globalThis as { URL?: unknown }).URL = {
      createObjectURL: (_blob: Blob) => `blob:test-${++created}`,
      revokeObjectURL: (url: string) => revoked.push(url),
    };
    (globalThis as { setTimeout?: unknown }).setTimeout = ((callback: () => void) => {
      timers.push(callback);
      return timers.length;
    }) as unknown as typeof setTimeout;

    assert.equal(downloadBlob('pierwszy.txt', new Blob(['a'])), true);
    assert.equal(clicked, 1);
    assert.deepEqual(revoked, [], 'brak synchronicznego uniewaznienia po click');
    assert.equal(downloadBlob('drugi.txt', new Blob(['b'])), true);
    assert.equal(clicked, 2);
    assert.deepEqual(revoked, [], 'oba adresy zyja do kontrolowanego timera');
    assert.equal(timers.length, 2, 'kazde pobranie ma wlasny jednorazowy timer');
    for (const callback of timers.splice(0)) callback();
    assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
  } finally {
    (globalThis as { document?: unknown }).document = originalDocument;
    (globalThis as { URL?: unknown }).URL = originalUrl;
    (globalThis as { setTimeout?: unknown }).setTimeout = originalSetTimeout;
  }
});

function mountArchive(store: MailUiStore): {
  container: HTMLElement;
  window: Window;
  off: () => void;
} {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  (globalThis as { window?: unknown }).window = window;
  const container = window.document.createElement('div') as unknown as HTMLElement;
  const off = mountMailUi(container, store, HANDLERS);
  return { container, window, off };
}

function cleanupArchive(off: () => void): void {
  off();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
}

function stepStatuses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.arkmail-archive-step-status')).map(
    (el) => el.textContent ?? '',
  );
}

test('etap 10 S28-S31: statusy rozdzielaja kandydatow, pominietych i date indeksu', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive([
    archived('Z trescia', { id: 'a1', body: ['Tresc.'] }),
    archived('Kandydat', { id: 'a2' }),
    archived('Bez daty', { id: 'a3', dateRaw: null, sortKey: '0000-00-00 00:00:00' }),
    archived('Zla data', {
      id: 'a4',
      dateRaw: 'niepoprawna-data',
      sortKey: '0000-00-00 00:00:00',
    }),
  ]);
  store.setIndexMeta({
    odebrane: '2000-01-02T10:00:00.000Z',
    nieprzeczytane: '2000-01-01T10:00:00.000Z',
    wyslane: '2000-01-03T10:00:00.000Z',
    niewyslane: '2000-01-04T10:00:00.000Z',
  });
  const { container, off } = mountArchive(store);
  try {
    assert.deepEqual(stepStatuses(container), [
      'Wszystkie skrzynki zapisane. Najstarszy zapis: 2000-01-01.',
      'Czesciowo: liczba listow z trescia 1. Do pobrania: 1. Bez tresci i bez prawidlowej daty: 2.',
      'Do zapisu: 1. Pominiete bez tresci: 3.',
    ]);
  } finally {
    cleanupArchive(off);
  }
});

test('etap 10 S28-S31: brak kandydatow, biezaca indeksacja i pojedynczy list', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive([
    archived('Z trescia', { id: 'b1', body: ['Tresc.'] }),
    archived('Bez daty', { id: 'b2', dateRaw: null, sortKey: '0000-00-00 00:00:00' }),
  ]);
  store.setIndexRun({ boxIndex: 0, box: 'odebrane', pages: 1 });
  const { container, off } = mountArchive(store);
  try {
    assert.deepEqual(stepStatuses(container), [
      'W toku: skrzynka odebrane. Liczba stron: 1.',
      'Liczba listow z trescia: 1. Do pobrania nie nadaja sie: 1 (brak prawidlowej daty).',
      'Do zapisu: 1. Pominiete bez tresci: 1.',
    ]);
    assert.equal(
      container.querySelector('.arkmail-arch-counts')?.textContent,
      'Liczba listow w bazie: 2.',
    );
  } finally {
    cleanupArchive(off);
  }
});

test('etap 10 S32: oba filtry dat sa jednoznacznie opisane jako pominiete', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setArchive([archived('Z trescia', { id: 'c1', body: ['Tresc.'] })]);
  const { container, window, off } = mountArchive(store);
  try {
    const setDate = (key: 'odDaty' | 'doDaty', value: string): void => {
      const input = container.querySelector(`[data-filter="${key}"]`) as HTMLInputElement;
      Object.defineProperty(input, 'value', { value, writable: true, configurable: true });
      input.dispatchEvent(new window.Event('input') as unknown as Event);
    };
    setDate('odDaty', '2000-01-03');
    setDate('doDaty', '2000-01-01');
    assert.equal(
      container.querySelector('.arkmail-dates-error')?.textContent,
      "Data 'Od dnia' jest pozniejsza niz 'Do dnia' - oba filtry dat zostaly pominiete.",
    );
    setDate('doDaty', '');
    setDate('odDaty', '2000-02-31');
    assert.equal(
      container.querySelector('.arkmail-dates-error')?.textContent,
      'Nieprawidlowa data - oba filtry dat zostaly pominiete.',
    );
  } finally {
    cleanupArchive(off);
  }
});
