import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { archiveExportEntries } from '../src/arkmail/core/exportTxt';
import { downloadBlob, setDownloadImpl } from '../src/arkmail/ui/download';
import {
  click,
  notifyText,
  startHarness,
  stopHarness,
  waitRt,
  type Harness,
} from './harness';

const DATE_RAW = 'Wt, 24 VIII 1999, 00:11:12';

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

function bodyTwin(): ArchiveLetter[] {
  const read = archived('Wspolny', { body: ['Tresc listu.'] });
  const unread = {
    ...archived('Wspolny'),
    id: 'inny-rekord',
    box: 'nieprzeczytane' as const,
    read: false,
  };
  return [read, unread];
}

async function openArchive(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await waitRt(() => !!h.content.querySelector('.arkmail-arch-export'), 'widok archiwum');
}

function startDownload(h: Harness): void {
  click(h, '.arkmail-arch-download');
  click(h, '.arkmail-arch-download');
}

function stepTexts(h: Harness): string[] {
  return Array.from(
    h.content.querySelectorAll('.arkmail-archive-step') as unknown as Iterable<{
      textContent?: string;
    }>,
  ).map((step) => String(step.textContent ?? ''));
}

test('pobieranie: rekord blizniaka bez tresci jest kandydatem (per rekord)', async () => {
  const h = await startHarness({ archive: bodyTwin() });
  try {
    await openArchive(h);
    startDownload(h);
    await waitRt(
      () => h.f.sent.length > 0 || notifyText(h.f, 'Wszystkie listy w bazie maja tresci.'),
      'start pobierania',
    );
    // Fala 41: kazdy rekord osobno - pusty blizniak DOSTAJE wlasny
    // odczyt (tresc brata go nie zaspokaja). Konczymy natychmiast po
    // pierwszej komendzie - pelny przebieg per rekord w
    // downloadPerRecord.test.ts.
    assert.ok(h.f.sent.length > 0, 'pusty rekord blizniaka jest pobierany');
    assert.ok(!notifyText(h.f, 'Wszystkie listy w bazie maja tresci.'));
  } finally {
    await stopHarness();
  }
});

test('pobieranie: pusta i bledna data nie sa zniknieciem listu z serwera', async () => {
  const noDate = archived('Bez daty', { dateRaw: null, sortKey: '0000-00-00 00:00:00' });
  const badDate = archived('Bledna data', {
    dateRaw: 'niepoprawna-data',
    sortKey: '0000-00-00 00:00:00',
  });
  const h = await startHarness({ archive: [noDate, badDate] });
  try {
    await openArchive(h);
    startDownload(h);
    await waitRt(
      () =>
        notifyText(h.f, 'Nie mozna pobrac tresci - listy bez prawidlowej daty: 2.') ||
        notifyText(h.f, 'Pobrano tresci'),
      'koniec sprawdzania dat',
    );
    assert.ok(notifyText(h.f, 'Nie mozna pobrac tresci - listy bez prawidlowej daty: 2.'));
    assert.ok(!notifyText(h.f, 'nie ma juz w skrzynce'));
    assert.deepEqual(h.f.sent, [], 'bez daty nie ma komendy odnalezienia listu');
  } finally {
    await stopHarness();
  }
});

test('pobieranie: legacy-zombie (missingOnServer) purgowany przy ladowaniu', async () => {
  const gone = archived('Znikniety', { missingOnServer: true });
  const h = await startHarness({ archive: [gone] });
  try {
    // Fala 28: rekord z flaga ze STAREJ wersji fizycznie wypada przy
    // init - puste archiwum daje neutralny komunikat, nie "wszystkie
    // maja tresci".
    await openArchive(h);
    startDownload(h);
    await waitRt(
      () =>
        notifyText(h.f, 'Skrzynki sa puste - nie ma czego pobierac.') ||
        notifyText(h.f, 'Wszystkie listy w bazie maja tresci.'),
      'komunikat o pustym archiwum',
    );
    assert.ok(notifyText(h.f, 'Skrzynki sa puste - nie ma czego pobierac.'));
    assert.ok(!notifyText(h.f, 'Wszystkie listy w bazie maja tresci.'));
    assert.deepEqual(h.f.sent, []);
  } finally {
    await stopHarness();
  }
});

test('eksport: pusty blizniak nie zwieksza liczby pominietych, wynik jest deterministyczny', () => {
  const twins = bodyTwin();
  const first = archiveExportEntries(twins);
  const second = archiveExportEntries([...twins].reverse());
  assert.equal(first.entries.length, 1);
  assert.equal(first.skipped, 0, 'ten sam list jest zapisany z drugiego rekordu');
  assert.deepEqual(second, first, 'kolejnosc rekordow nie zmienia eksportu');
});

test('statusy: liczniki pobierania i ZIP uwzgledniaja grupy oraz niedostepne daty', async () => {
  const badDate = archived('Bledna data', {
    dateRaw: 'niepoprawna-data',
    sortKey: '0000-00-00 00:00:00',
  });
  const gone = archived('Znikniety', { missingOnServer: true });
  const h = await startHarness({ archive: [...bodyTwin(), badDate, gone] });
  try {
    await openArchive(h);
    const steps = stepTexts(h);
    // Fala 28: legacy-zombie jest purgowany przy ladowaniu - nie jest
    // liczony ani w kolumnie pobierania, ani w ZIP.
    assert.match(steps[1], /Gotowe: 1 list z trescia \(1 bez daty\)\./);
    assert.match(steps[2], /Gotowe: 1 list do zapisu \(1 bez tresci\)\./);
  } finally {
    await stopHarness();
  }
});

test('eksport: legacy-zombie z trescia purgowany przy ladowaniu, nie eksportowany', async () => {
  const gone = archived('Znikniety', { body: ['Tresc listu.'], missingOnServer: true });
  const h = await startHarness({ archive: [gone] });
  const captured: Blob[] = [];
  setDownloadImpl((_name, data) => captured.push(data));
  try {
    // Fala 28: purge przy init - eksport widzi puste archiwum.
    await openArchive(h);
    click(h, '.arkmail-arch-export');
    await waitRt(
      () => notifyText(h.f, 'Skrzynki sa puste - nie ma czego zapisywac.'),
      'komunikat o braku plikow',
    );
    assert.ok(notifyText(h.f, 'Skrzynki sa puste - nie ma czego zapisywac.'));
    assert.equal(captured.length, 0);
    assert.deepEqual(h.f.sent, []);
  } finally {
    setDownloadImpl(null);
    await stopHarness();
  }
});

test('eksport: brak tresci ma poprawny komunikat', async () => {
  const h = await startHarness({ archive: [archived('Bez tresci')] });
  try {
    await openArchive(h);
    click(h, '.arkmail-arch-export');
    await waitRt(() => notifyText(h.f, 'Brak listow'), 'komunikat o braku tresci');
    assert.ok(notifyText(h.f, 'Brak listow z trescia w archiwum - najpierw pobierz tresci.'));
    assert.ok(!notifyText(h.f, 'Brak listow z tresci w archiwum'));
    assert.deepEqual(h.f.sent, []);
  } finally {
    await stopHarness();
  }
});

test('zapis pliku: wyjatek implementacji jest zwyklym niepowodzeniem', () => {
  setDownloadImpl(() => {
    throw new Error('Zapis odrzucony.');
  });
  try {
    assert.equal(downloadBlob('list.txt', new Blob(['Tresc.'])), false);
  } finally {
    setDownloadImpl(null);
  }
});

test('eksport: powtorne klikniecia po bledzie zapisu nie daja falszywego sukcesu', async () => {
  const h = await startHarness({ archive: [archived('Do zapisu', { body: ['Tresc.'] })] });
  let attempts = 0;
  setDownloadImpl(() => {
    attempts += 1;
    throw new Error('Zapis odrzucony.');
  });
  try {
    await openArchive(h);
    click(h, '.arkmail-arch-export');
    click(h, '.arkmail-arch-export');
    await waitRt(() => attempts === 2, 'dwie proby zapisu');
    assert.equal(attempts, 2);
    assert.ok(notifyText(h.f, 'Nie udalo sie zapisac pliku'));
    assert.ok(!notifyText(h.f, 'Zapisano listy do ZIP'));
    assert.deepEqual(h.f.sent, []);
  } finally {
    setDownloadImpl(null);
    await stopHarness();
  }
});
