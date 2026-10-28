import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  click,
  textOf,
  waitRt,
  type Harness,
} from './harness';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';

interface Row {
  number: number;
  subject: string;
  party: string;
}

const row = (number: number, subject: string, party: string): Row => ({ number, subject, party });
const rows = {
  a: row(1, 'Temat A', 'Bar'),
  b: row(2, 'Temat B', 'Corge'),
  c: row(3, 'Temat C', 'Waldo'),
};

function entry(data: Row): MailboxEntry {
  return {
    number: data.number,
    isRead: true,
    subject: data.subject,
    forwarded: false,
    party: data.party,
    partyKind: 'nadawca',
    date: parseMailDate('Wt, 23 XII 2025, 00:11:12'),
  };
}

function archive(data: Row): ArchiveLetter {
  return { ...fromMailboxEntry('odebrane', entry(data)), body: ['Tresc'] };
}

function replayListing(h: Harness, entries: Row[]): void {
  h.f.fire('Listy odebrane:', 'mail');
  for (const data of entries) {
    h.f.fire(` ${data.number}. *R* Temat: ${data.subject}`, 'mail');
    h.f.fire(`Nadawca: ${data.party.padEnd(35)}Wt, 23 XII 2025, 00:11:12`, 'mail');
  }
  h.f.fire('> ', 'prompt');
}

function replayPager(h: Harness, number: number): void {
  h.f.fire(`List : ${number}`, 'mail');
  h.f.fire('Od   : Bar', 'mail');
  h.f.fire('Temat: Temat A', 'mail');
  h.f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  h.f.fire('', 'mail');
  h.f.fire('Tresc.', 'mail');
  h.f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${number}) -- `, 'mail');
}

async function search(h: Harness, entries: Row[]): Promise<void> {
  if (!h.content.querySelector('.arkmail-deletion-search')) click(h, '[data-tab="usuwanie"]');
  const before = h.f.sent.filter((command) => command === 'listy odebrane').length;
  click(h, '.arkmail-deletion-search');
  await h.waitFor(
    () => h.f.sent.filter((command) => command === 'listy odebrane').length === before + 1,
    'reczne wyszukiwanie',
  );
  replayListing(h, entries);
  await h.waitFor(
    () => h.content.querySelectorAll('.arkmail-deletion-entry').length === entries.length,
    'wyniki wyszukiwania',
  );
}

function check(h: Harness, number: number): void {
  const field = h.content.querySelector(`[data-deletion-number="${number}"]`) as {
    checked: boolean;
    dispatchEvent(event: unknown): void;
  } | null;
  assert.ok(field, `pole listu ${number}`);
  field.checked = true;
  field.dispatchEvent(new h.window.Event('change'));
}

async function storedArchive(): Promise<ArchiveLetter[]> {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const values = (await driver.loadAllLetters()).foo ?? {};
  await driver.close();
  return Object.values(values).map((value) => JSON.parse(value) as ArchiveLetter);
}

const INDEX = {
  odebrane: '2026-10-28T00:00:00.000Z',
  nieprzeczytane: '2026-10-28T00:00:00.000Z',
  wyslane: '2026-10-28T00:00:00.000Z',
  niewyslane: '2026-10-28T00:00:00.000Z',
};

test('usuwanie: swiezy listing zmienia numery, a potwierdzenia aktualizuja dane', async () => {
  const h = await startHarness({
    archive: [archive(rows.a), archive(rows.b), archive(rows.c)],
    indexMeta: INDEX,
  });
  const { f } = h;
  try {
    click(h, '[data-tab="usuwanie"]');
    assert.deepEqual(f.sent, [], 'wejscie do zakladki nie wysyla komend');
    await search(h, [rows.a, rows.b, rows.c]);
    check(h, 1);
    check(h, 3);
    click(h, '.arkmail-deletion-delete');
    click(h, '.arkmail-deletion-delete');
    await h.waitFor(
      () => f.sent.filter((command) => command === 'listy odebrane').length === 2,
      'dokladne powtorzenie ostatniego zapytania',
    );
    replayListing(h, [row(2, 'Temat A', 'Bar'), row(3, 'Temat B', 'Corge'), row(5, 'Temat C', 'Waldo')]);
    await h.waitFor(() => f.sent.includes('przeczytaj list 2'), 'pierwszy swiezy numer');
    replayPager(h, 2);
    await h.waitFor(() => f.sent.includes('d 2,5'), 'zakres po renumeracji');
    f.fire('Zaznaczono do skasowania: 2, 5.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ', 'mail');
    await h.waitFor(() => f.sent.includes('q'), 'zamkniecie pagera');
    f.fire('Kasuje listy...', 'mail');
    f.fire('Kasuje: 2.', 'mail');
    f.fire('Kasuje: 5.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => textOf(h, '.arkmail-deletion-message') === 'Usunieto: 2 listy.', 'komunikat');
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0);
    assert.equal(f.sent.filter((command) => command === 'listy odebrane').length, 2, 'brak auto-refresh');

    const letters = await storedArchive();
    assert.equal(letters.find((letter) => letter.subject === 'Temat A')?.missingOnServer, true);
    assert.equal(letters.find((letter) => letter.subject === 'Temat C')?.missingOnServer, true);
    assert.notEqual(letters.find((letter) => letter.subject === 'Temat B')?.missingOnServer, true);
    click(h, '[data-tab="kontakty"]');
    await h.waitFor(() => h.content.querySelectorAll('.arkmail-contact').length === 1, 'jeden kontakt');
    assert.equal(textOf(h, '.arkmail-contact-name'), 'Corge');
  } finally {
    await stopHarness();
  }
});

test('usuwanie: niezgodny swiezy wynik zatrzymuje operacje przed pagerem', async () => {
  const h = await startHarness({ archive: [archive(rows.a)] });
  const { f } = h;
  try {
    await search(h, [rows.a]);
    click(h, '.arkmail-deletion-select-all');
    click(h, '.arkmail-deletion-delete');
    click(h, '.arkmail-deletion-delete');
    await h.waitFor(() => f.sent.filter((command) => command === 'listy odebrane').length === 2, 'kontrola');
    replayListing(h, [row(1, 'Temat B', 'Corge')]);
    await waitRt(
      () => textOf(h, '.arkmail-deletion-message') === 'Zaznaczone listy zmienily sie. Wyszukaj je ponownie.',
      'informacja o zmianie',
    );
    assert.ok(!f.sent.some((command) => command.startsWith('przeczytaj list')));
    assert.ok(!f.sent.some((command) => command.startsWith('d ')));
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0);
    assert.notEqual((await storedArchive())[0].missingOnServer, true);
  } finally {
    await stopHarness();
  }
});

test('usuwanie: brak fizycznego potwierdzenia nie zmienia Archiwum', async () => {
  const h = await startHarness({ archive: [archive(rows.a)] });
  const { f } = h;
  try {
    await search(h, [rows.a]);
    click(h, '.arkmail-deletion-select-all');
    click(h, '.arkmail-deletion-delete');
    click(h, '.arkmail-deletion-delete');
    await h.waitFor(() => f.sent.filter((command) => command === 'listy odebrane').length === 2, 'kontrola');
    replayListing(h, [rows.a]);
    await h.waitFor(() => f.sent.includes('przeczytaj list 1'), 'otwarcie pagera');
    replayPager(h, 1);
    await h.waitFor(() => f.sent.includes('d 1'), 'zaznaczenie');
    f.fire('Zaznaczono do skasowania: 1.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    await h.waitFor(() => f.sent.includes('q'), 'zamkniecie pagera');
    f.fire('> ', 'prompt');
    await waitRt(
      () => textOf(h, '.arkmail-deletion-message') === 'Brak potwierdzenia usuniecia. Odswiez przed kolejna proba.',
      'nieznany wynik',
    );
    assert.notEqual((await storedArchive())[0].missingOnServer, true);
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0);
  } finally {
    await stopHarness();
  }
});

test('usuwanie: wyjscie, zamkniecie okna i reconnect czyszcza oraz odrzucaja stara odpowiedz', async () => {
  const h = await startHarness({ archive: [archive(rows.a)] });
  const { f } = h;
  try {
    await search(h, [rows.a, rows.b, rows.c]);
    click(h, '[data-tab="archiwum"]');
    assert.equal(h.content.querySelectorAll('.arkmail-arch-entry').length, 1, 'sam listing nie zapisuje Archiwum');
    click(h, '[data-tab="usuwanie"]');
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0, 'wynik znikl po wyjsciu');

    click(h, '.arkmail-deletion-search');
    await h.waitFor(() => f.sent.filter((command) => command === 'listy odebrane').length === 2, 'druga proba');
    f.closePopup();
    replayListing(h, [rows.a, rows.b]);
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec starej odpowiedzi');
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0, 'stara odpowiedz odrzucona');

    await search(h, [rows.a]);
    f.closePopup();
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0, 'zamkniecie czysci wynik');

    click(h, '.arkmail-deletion-search');
    await h.waitFor(() => f.sent.filter((command) => command === 'listy odebrane').length === 4, 'czwarta proba');
    replayListing(h, [rows.a]);
    await h.waitFor(() => h.content.querySelectorAll('.arkmail-deletion-entry').length === 1, 'wynik przed reconnect');
    f.fireEvent('client.disconnect', {});
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 0, 'reconnect czysci wynik');
  } finally {
    await stopHarness();
  }
});
