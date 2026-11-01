import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry } from '../src/arkmail/core/archive';
import { setDownloadImpl } from '../src/arkmail/ui/download';
import { click, notifyText, startHarness, stopHarness, waitRt, type Harness } from './harness';

function archived(body: string[]) {
  return {
    ...fromMailboxEntry('odebrane', {
      number: 1,
      isRead: true,
      subject: 'Test',
      forwarded: false,
      party: 'Bar',
      partyKind: 'nadawca',
      date: { raw: 'Wt, 24 VIII 1999, 00:11:12', weekday: 'Wt', day: 24, month: 8, year: 1999, time: '00:11:12' },
    }),
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
    assert.match(labels[1], /Gotowe: 1 list z trescia/);
    assert.match(labels[2], /Gotowe: 1 list do zapisu/);
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
    assert.ok(notifyText(h.f, 'Zapisano listy do ZIP (1 plik)'));
    assert.ok(notifyText(h.f, 'pominietych bez tresci: 1'));
    const steps = Array.from(h.content.querySelectorAll('.arkmail-archive-step')).map((step) =>
      String((step as { textContent?: string }).textContent ?? ''),
    );
    assert.match(steps[2], /Gotowe: 1 list do zapisu \(1 bez tresci\)/);
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
