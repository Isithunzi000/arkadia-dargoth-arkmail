import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry } from '../src/arkmail/core/archive';
import { setDownloadImpl } from '../src/arkmail/ui/download';
import { click, notifyText, startHarness, stopHarness, waitRt, type Harness } from './harness';

function archived(body: string[], number = 1) {
  return {
    ...fromMailboxEntry('odebrane', {
      number,
      isRead: true,
      subject: 'Test',
      forwarded: false,
      party: 'Bar',
      partyKind: 'nadawca',
      date: { raw: 'Wt, 24 VIII 1999, 00:11:12', weekday: 'Wt', day: 24, month: 8, year: 1999, time: '00:11:12' },
    }, 'strona-1', number),
    body,
  };
}

async function openArchive(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await waitRt(() => !!h.content.querySelector('.arkmail-arch-export'), 'przycisk zapisu ZIP');
}

test('archiwum: pokazuje trzy kroki i niekompletny indeks', async () => {
  const h = await startHarness({
    archive: [archived(['Tresc.'])],
    indexMeta: { odebrane: '2026-10-29' },
  });
  try {
    await openArchive(h);
    const steps = h.content.querySelectorAll('.arkmail-archive-step');
    assert.equal(steps.length, 3);
    const labels = Array.from(steps).map((step) =>
      String((step as { textContent?: string }).textContent ?? ''),
    );
    assert.match(labels[0], /1\. Indeksacja/);
    assert.match(labels[1], /2\. Pobranie tresci/);
    assert.match(labels[2], /3\. Zapis ZIP/);
    assert.match(labels[0], /Czesciowo: 1 z 4 skrzynek/);
    assert.match(labels[1], /Liczba listow z trescia: 1\. Do pobrania nie nadaja sie: 0 \(brak prawidlowej daty\)\./);
    assert.match(labels[2], /Do zapisu: 1\. Pominiete bez tresci: 0\./);
  } finally {
    await stopHarness();
  }
});

test('archiwum: krok 2 liczy rekordy bez tresci, nie grupy kluczy', async () => {
  const h = await startHarness({
    archive: [archived([], 1), archived([], 2)],
    indexMeta: { odebrane: '2026-10-29' },
  });
  try {
    await openArchive(h);
    const steps = h.content.querySelectorAll('.arkmail-archive-step');
    const labels = Array.from(steps).map((step) =>
      String((step as { textContent?: string }).textContent ?? ''),
    );
    assert.match(labels[1], /2\. Pobranie tresci/);
    assert.match(labels[1], /Do pobrania: 2/);
  } finally {
    await stopHarness();
  }
});

test('archiwum: pobieranie tresci nie uruchamia indeksacji', async () => {
  const h = await startHarness();
  try {
    await openArchive(h);
    click(h, '.arkmail-arch-download');
    click(h, '.arkmail-arch-download');
    await waitRt(() => notifyText(h.f, 'nie ma czego pobierac'), 'koniec pobierania pustego archiwum');
    assert.deepEqual(h.f.sent, [], 'pobieranie nie wysyla komend indeksacji');
  } finally {
    await stopHarness();
  }
});

test('archiwum: czesciowy indeks pozwala zapisac dostepne tresci z ostrzezeniem', async () => {
  const h = await startHarness({
    archive: [archived(['Tresc.']), { ...archived([]), id: 'drugi', subject: 'Bez tresci' }],
    indexMeta: { odebrane: '2026-10-29' },
  });
  const captured: { name: string; data: Blob }[] = [];
  setDownloadImpl((name, data) => captured.push({ name, data }));
  try {
    await openArchive(h);
    click(h, '.arkmail-arch-export');
    await waitRt(() => captured.length === 1, 'zapis czesciowego ZIP');
    assert.deepEqual(h.f.sent, []);
    assert.ok(notifyText(h.f, 'Zapisano pliki TXT do ZIP. Liczba plikow: 1. Pominiete bez tresci: 1.'));
    const steps = Array.from(h.content.querySelectorAll('.arkmail-archive-step')).map((step) =>
      String((step as { textContent?: string }).textContent ?? ''),
    );
    assert.match(steps[2], /Do zapisu: 1\. Pominiete bez tresci: 1\./);
  } finally {
    setDownloadImpl(null);
    await stopHarness();
  }
});

test('archiwum: zapis ZIP jest lokalny i nie uruchamia indeksacji', async () => {
  const h = await startHarness({ archive: [archived(['Tresc.'])] });
  const captured: { name: string; data: Blob }[] = [];
  setDownloadImpl((name, data) => captured.push({ name, data }));
  try {
    await openArchive(h);
    click(h, '.arkmail-arch-export');
    await waitRt(() => captured.length === 1, 'lokalny zapis ZIP');
    assert.deepEqual(h.f.sent, [], 'zapis nie wysyla zadnych komend');
    assert.match(captured[0].name, /^arkmail_listy_.*\.zip$/);
  } finally {
    setDownloadImpl(null);
    await stopHarness();
  }
});


test('archiwum: wieloczesciowe statusy kart 1-3 maja osobne wiersze etykiet i wartosci', async () => {
  const h = await startHarness({
    archive: [archived(['Tresc.'], 1), archived([], 2)],
    indexMeta: { odebrane: '2026-10-29' },
    archiveGaps: { wyslane: ['1999-08-21'] },
  });
  try {
    await openArchive(h);
    const steps = Array.from(h.content.querySelectorAll('.arkmail-archive-step'));
    assert.equal(steps.length, 3);
    const actual = steps.map((step) =>
      Array.from((step as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll('.arkmail-archive-step-status-row')).map((row) => {
        const element = row as { querySelector(s: string): unknown };
        const label = element.querySelector('.arkmail-archive-step-status-label') as { textContent?: string } | null;
        const value = element.querySelector('.arkmail-archive-step-status-value') as { textContent?: string } | null;
        return [(label?.textContent ?? '').trim(), (value?.textContent ?? '').trim()];
      }),
    );
    assert.deepEqual(actual, [
      [
        ['Stan:', 'Czesciowo: 1 z 4 skrzynek.'],
        ['Braki:', 'brakuje danych z 1 dnia.'],
      ],
      [
        ['Stan:', 'Czesciowo.'],
        ['Liczba listow z trescia:', '1.'],
        ['Do pobrania:', '1.'],
        ['Bez tresci i bez prawidlowej daty:', '0.'],
      ],
      [
        ['Do zapisu:', '1.'],
        ['Pominiete bez tresci:', '1.'],
      ],
    ]);
  } finally {
    await stopHarness();
  }
});
