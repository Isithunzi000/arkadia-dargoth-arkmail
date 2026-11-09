import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMailboxEntry,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import {
  archiveExportEntries,
  archiveLetterTxt,
  letterTxt,
} from '../src/arkmail/core/exportTxt';
import { setDownloadImpl } from '../src/arkmail/ui/download';
import {
  click,
  startHarness,
  stopHarness,
  textOf,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const DATE_RAW = 'Wt, 24 VIII 1999, 00:11:12';
const DATE = {
  raw: DATE_RAW,
  weekday: 'Wt',
  day: 24,
  month: 8,
  year: 1999,
  time: '00:11:12',
};

function archived(
  box: ArchiveLetter['box'] = 'odebrane',
  over: Partial<ArchiveLetter> = {},
): ArchiveLetter {
  const sender = box === 'odebrane' || box === 'nieprzeczytane';
  return {
    ...fromMailboxEntry(box, {
      number: 1,
      isRead: true,
      subject: 'Syntetyczny temat',
      forwarded: false,
      party: sender ? 'Listing nadawcy' : 'Listing odbiorcow',
      partyKind: sender ? 'nadawca' : 'odbiorcy',
      date: DATE,
    }),
    id: 'rekord-1',
    body: ['Syntetyczna tresc'],
    ...over,
  };
}

function clickArchiveRow(h: Harness, fragment: string): void {
  const rows = Array.from(
    h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
      textContent?: string;
      dispatchEvent(e: unknown): void;
    }>,
  );
  const row = rows.find((candidate) => String(candidate.textContent ?? '').includes(fragment));
  assert.ok(row, 'wiersz archiwum istnieje');
  row.dispatchEvent(new h.window.Event('click'));
}

test('podglad: odebrany z cache zachowuje Od, Do i DW bez komend, a TXT jest zgodny', async () => {
  const letter = archived('odebrane', {
    headers: { from: 'Nadawca', to: 'Pierwszy, Drugi', cc: 'Trzeci' },
  });
  const h = await startHarness({ archive: [letter] });
  const captured: { name: string; data: Blob }[] = [];
  setDownloadImpl((name, data) => captured.push({ name, data }));
  try {
    click(h, '[data-tab="archiwum"]');
    clickArchiveRow(h, 'Syntetyczny temat');
    await waitRt(() => !!h.content.querySelector('.arkmail-letter-meta'), 'podglad z cache');
    assert.match(
      textOf(h, '.arkmail-letter-meta'),
      /Od: Nadawca \| Do: Pierwszy, Drugi \| DW: Trzeci/,
    );
    assert.deepEqual(h.f.sent, [], 'podglad z cache nie wysyla komend');

    click(h, '.arkmail-export-letter');
    await waitRt(() => captured.length === 1, 'pojedynczy TXT z cache');
    const expected = letterTxt({
      subject: letter.subject,
      from: 'Nadawca',
      to: 'Pierwszy, Drugi',
      cc: 'Trzeci',
      date: DATE_RAW,
      box: 'odebrane',
      body: letter.body,
    });
    assert.equal(await captured[0].data.text(), expected);
    assert.equal(archiveLetterTxt(letter), expected);
    assert.deepEqual(h.f.sent, [], 'eksport pojedynczy nie wysyla komend');
  } finally {
    setDownloadImpl(null);
    await stopHarness();
  }
});

test('podglad: wyslany z cache zachowuje Od, Do i DW bez komend', async () => {
  const letter = archived('wyslane', {
    headers: { from: 'Nadawca', to: 'Pierwszy, Drugi', cc: 'Trzeci' },
  });
  const h = await startHarness({ archive: [letter] });
  try {
    click(h, '[data-tab="archiwum"]');
    clickArchiveRow(h, 'Syntetyczny temat');
    await waitRt(() => !!h.content.querySelector('.arkmail-letter-meta'), 'podglad wyslanego');
    assert.match(
      textOf(h, '.arkmail-letter-meta'),
      /Od: Nadawca \| Do: Pierwszy, Drugi \| DW: Trzeci/,
    );
    assert.deepEqual(h.f.sent, []);
  } finally {
    await stopHarness();
  }
});

test('eksport: wyslany rekord uzywa kompletu, nie rekonstrukcji party', () => {
  const letter = archived('wyslane', {
    party: 'Listing odbiorcow',
    headers: { from: 'Nadawca', to: 'Pierwszy', cc: 'Trzeci' },
  });
  const txt = archiveLetterTxt(letter);

  assert.ok(txt.includes('Od: Nadawca | Do: Pierwszy | DW: Trzeci'));
  assert.ok(!txt.includes('Od:  | Do: Listing odbiorcow'));
});

test('eksport: historyczny rekord zachowuje wiarygodne dane bez ostrzezen w TXT', () => {
  const letter = archived('odebrane', { party: 'Listing nadawcy', headers: undefined });
  const txt = archiveLetterTxt(letter);

  assert.ok(txt.includes('Od: Listing nadawcy'));
  assert.ok(!txt.includes('Do:'));
  assert.ok(!txt.includes('DW:'));
  assert.ok(txt.endsWith('\n\nSyntetyczna tresc\n'));
  assert.ok(!/niepeln|historyczn|naglow/i.test(txt));
});

test('eksport: pozniejsze uzupelnienie daje pelny kolejny TXT bez zmiany tresci', () => {
  const historical = archived('odebrane', { headers: undefined });
  const supplemented: ArchiveLetter = {
    ...historical,
    headers: { from: 'Nadawca', to: '', cc: null },
  };

  const before = archiveExportEntries([historical]).entries[0].txt;
  const after = archiveExportEntries([supplemented]).entries[0].txt;
  assert.ok(before.includes('Od: Listing nadawcy'));
  assert.ok(after.includes('Od: Nadawca'));
  assert.ok(!after.includes('Do:'));
  assert.ok(!after.includes('DW:'));
  assert.ok(after.endsWith('\n\nSyntetyczna tresc\n'));
});

test('eksport: mieszany ZIP jest lokalny i raportuje niepelne historyczne naglowki', async () => {
  const full = archived('odebrane', {
    id: 'pelny',
    subject: 'Pelny',
    headers: { from: 'Nadawca', to: 'Pierwszy', cc: 'Trzeci' },
  });
  const historical = archived('odebrane', {
    id: 'historyczny',
    subject: 'Historyczny',
    headers: undefined,
  });
  const h = await startHarness({ archive: [full, historical] });
  const captured: Blob[] = [];
  setDownloadImpl((_name, data) => captured.push(data));
  try {
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-arch-export');
    await waitRt(() => captured.length === 1, 'mieszany ZIP');
    assert.deepEqual(h.f.sent, [], 'eksport zbiorczy nie uruchamia pobierania');
    assert.ok(notifyText(h.f, 'Liczba plikow: 2. Pominiete bez tresci: 0.'));
    assert.ok(notifyText(h.f, 'Niepelne historyczne naglowki: 1.'));
  } finally {
    setDownloadImpl(null);
    await stopHarness();
  }
});

test('eksport: podsumowanie rozroznia pelny komplet i historyczne braki', async () => {
  interface SummaryModule {
    buildExportSummary(
      files: number,
      skipped: number,
      incompleteHeaders?: number,
    ): { text: string; level: 'success' | 'warning' };
  }
  const summary = (await import('../src/arkmail/ui/operationSummary.js')) as SummaryModule;

  assert.deepEqual(summary.buildExportSummary(2, 0, 0), {
    text: 'Zapisano pliki TXT do ZIP. Liczba plikow: 2. Pominiete bez tresci: 0.',
    level: 'success',
  });
  assert.deepEqual(summary.buildExportSummary(2, 1, 1), {
    text:
      'Zapisano pliki TXT do ZIP. Liczba plikow: 2. Pominiete bez tresci: 1. ' +
      'Niepelne historyczne naglowki: 1.',
    level: 'warning',
  });
});
