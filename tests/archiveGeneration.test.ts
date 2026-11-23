import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import {
  click,
  loadTruncatedBox,
  startHarness,
  stopHarness,
  waitRt,
  type Harness,
} from './harness';

const oldLetter = (): ArchiveLetter => ({
  ...fromMailboxEntry('odebrane', {
    number: 1,
    isRead: true,
    subject: 'Trwaly list',
    forwarded: false,
    party: 'Corge',
    partyKind: 'nadawca',
    date: parseMailDate('Wt, 24 VIII 1999, 00:11:12'),
  }),
  body: ['Trwala tresc.'],
});

async function archiveSnapshot(): Promise<string> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const letters = await driver.loadAllLetters();
  await driver.close();
  return JSON.stringify(letters);
}

async function settledArchiveSnapshot(): Promise<string> {
  let previous = await archiveSnapshot();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => { setImmediate(resolve); });
    const current = await archiveSnapshot();
    if (current === previous) return current;
    previous = current;
  }
  assert.fail('zapis archiwum nie osiagnal stanu ustalonego');
}

function reconnectWithReplay(h: Harness): void {
  h.f.fireEvent('proxy.session', {
    resumed: true,
    upstreamClosed: false,
    replayedBytes: 128,
  });
}

function freshListing(h: Harness, prompt: boolean): void {
  h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  h.f.fire(' 1. *R* Temat: najnowszy', 'mail');
  h.f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  if (prompt) h.f.fire('> ', 'prompt');
}

for (const item of [
  {
    label: 'potwierdzony listing zakonczony tuz przed reconnectem nie zastepuje archiwum',
    respond: (h: Harness) => {
      h.f.fire('Listy odebrane:', 'mail');
      h.f.fire(' 1. *R* Temat: Spozniony wpis', 'mail');
      h.f.fire('Nadawca: Waldo                        Wt, 24 VIII 1999, 00:11:12', 'mail');
      h.f.fire('> ', 'prompt');
    },
  },
  {
    label: 'pusty listing zakonczony tuz przed reconnectem nie kasuje archiwum',
    respond: (h: Harness) => {
      h.f.fire('Nie masz zadnych odebranych listow.', 'mail');
    },
  },
] as const) {
  test(item.label, async () => {
    const h = await startHarness({ archive: [oldLetter()], autoRefreshEnabled: false });
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const before = await settledArchiveSnapshot();
      click(h, '.arkmail-search-go');
      await h.waitFor(() => h.f.sent.includes('listy odebrane'), 'listing przed reconnectem');

      item.respond(h);
      reconnectWithReplay(h);
      await new Promise((resolve) => setTimeout(resolve, 80));

      assert.equal(await settledArchiveSnapshot(), before, 'wynik starej generacji pozostaje odrzucony');
      assert.ok(!h.content.querySelector('.arkmail-entry'), 'stary listing nie zmienia widoku');
    } finally {
      await stopHarness();
    }
  });
}

test('listing zwrocony po ciszy otwiera jednoznaczny list bez kolejnej rekotwicy', async () => {
  const h = await startHarness();
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-entry');
    const anchor = 'listy odebrane przed 25 VIII 1999';
    await waitRt(() => h.f.sent.includes(anchor), 'rekotwica przed otwarciem');
    freshListing(h, false);
    await waitRt(() => h.f.sent.includes('przeczytaj list 1'), 'odczyt znalezionego wpisu');
    assert.equal(h.f.sent.filter((command) => command === anchor).length, 1);

    h.f.fire('List : 1', 'mail');
    h.f.fire('Od   : Corge', 'mail');
    h.f.fire('Temat: najnowszy', 'mail');
    h.f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
    h.f.fire('Syntetyczna tresc.', 'mail');
    h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(() => h.content.querySelector('.arkmail-letter-body') !== null, 'otwarty list');
  } finally {
    await stopHarness();
  }
});

test('reconnect tuz po zakonczeniu pagera odrzuca stary list o tym samym numerze', async () => {
  const h = await startHarness();
  try {
    await loadTruncatedBox(h);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const before = await settledArchiveSnapshot();
    click(h, '.arkmail-entry');
    await h.waitFor(
      () => h.f.sent.includes('listy odebrane przed 25 VIII 1999'),
      'rekotwica przed odczytem',
    );
    freshListing(h, true);
    await h.waitFor(() => h.f.sent.includes('przeczytaj list 1'), 'odczyt przed reconnectem');

    h.f.fire('List : 1', 'mail');
    h.f.fire('Od   : Foo', 'mail');
    h.f.fire('Temat: najnowszy', 'mail');
    h.f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
    h.f.fire('Spozniona tresc.', 'mail');
    h.f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    h.f.fire('> ', 'prompt');
    reconnectWithReplay(h);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(!h.content.querySelector('.arkmail-letter-body'), 'stary list nie otwiera sie');
    assert.equal(await settledArchiveSnapshot(), before, 'stara tresc nie zapisuje sie w archiwum');
    assert.ok(!h.f.sent.includes('q'), 'reset nie wysyla q');
  } finally {
    await stopHarness();
  }
});
