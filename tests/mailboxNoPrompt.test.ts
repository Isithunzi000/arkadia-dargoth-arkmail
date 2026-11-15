/** Regresja 1.30.5 -> 1.30.6: uzyteczny listing bez promptu. Dane syntetyczne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { MockTransport } from '../src/arkmail/core/session/transport';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import {
  startHarness,
  stopHarness,
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

const oldArchive = (subject: string): ArchiveLetter => ({
  ...fromMailboxEntry('odebrane', {
    number: 9,
    isRead: true,
    subject,
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: parseMailDate('Pn, 23 VIII 1999, 02:20:05'),
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
    assert.deepEqual(await storedSubjects(), ['Niepotwierdzony wpis']);
  } finally {
    await stopHarness();
  }
});
