/**
 * Fala 41 (commit 2): pobieranie tresci PER REKORD.
 *
 * Regula wlasciciela: kazdy list wylistowany przez Arkadie to osobny
 * rekord - nawet przy identycznych metadanych (temat/nadawca/data).
 * Skoro rekordy blizniacze sa osobne, kazdy z nich musi dostac WLASNA
 * tresc: osobny odczyt ze swojego wiersza listingu, a tresc laduje
 * DOKLADNIE w tym rekordzie (zadnego wypelniania calej grupy jednym
 * odczytem).
 *
 * Kontrakt:
 *  - kandydat = rekord z pusta trescia i prawidlowa data (zero grupowania
 *    po kluczu tresci, zero slotow occurrences),
 *  - re-kotwica strony po dacie: wpis wybierany po archiveId rekordu
 *    (padnie do metadanych + numeru wiersza tylko jako fallback),
 *  - 'missing' czysci WYLACZNIE rekord, ktorego wiersza nie ma na
 *    swiezym listingu - blizniak zostaje nietkniety,
 *  - circuit breaker (3 bledy z rzedu) i ETA zostaja jak w Fali 31a.
 *
 * Ten plik zastepuje downloadOccurrences.test.ts (Fala 35c) - maszyneria
 * occurrences/multis wypada z runtime'u razem z ta fala.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordId,
  scanKeyOfEntries,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import { IndexedDbStorageDriver } from '../src/arkmail/adapters/storageDriver';
import {
  startHarness,
  stopHarness,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const TWIN_DATE = 'Wt, 24 VIII 1999, 10:00:00';

const twinDate = {
  raw: TWIN_DATE,
  weekday: 'Wt',
  day: 24,
  month: 8,
  year: 1999,
  time: '10:00:00',
} as const;

/** Strona listingu z para blizniakow (3 i 2) + obcy list (1). */
const twinPage: MailboxEntry[] = [
  {
    number: 3,
    isRead: true,
    subject: 'Raport',
    forwarded: false,
    party: 'Goniec',
    partyKind: 'nadawca',
    date: { ...twinDate },
  },
  {
    number: 2,
    isRead: true,
    subject: 'Raport',
    forwarded: false,
    party: 'Goniec',
    partyKind: 'nadawca',
    date: { ...twinDate },
  },
  {
    number: 1,
    isRead: true,
    subject: 'Inny',
    forwarded: false,
    party: 'Corge',
    partyKind: 'nadawca',
    date: { ...twinDate, raw: 'Wt, 24 VIII 1999, 11:00:00', time: '11:00:00' },
  },
];

const SCAN_KEY = scanKeyOfEntries(twinPage);
const ID_TWIN_1 = recordId('odebrane', SCAN_KEY, 0);
const ID_TWIN_2 = recordId('odebrane', SCAN_KEY, 1);

/** Dwa rekordy-blizniaki o identycznych metadanych, bez tresci. */
const twinRecords = (): ArchiveLetter[] => [
  {
    id: ID_TWIN_1,
    box: 'odebrane',
    number: 3,
    party: 'Goniec',
    subject: 'Raport',
    forwarded: false,
    dateRaw: TWIN_DATE,
    sortKey: '1999-08-24 10:00:00',
    read: true,
    body: [],
  },
  {
    id: ID_TWIN_2,
    box: 'odebrane',
    number: 2,
    party: 'Goniec',
    subject: 'Raport',
    forwarded: false,
    dateRaw: TWIN_DATE,
    sortKey: '1999-08-24 10:00:00',
    read: true,
    body: [],
  },
];

/** Swiezy listing skrzynki (nieuciety) - blizniak 2 nadal na serwerze. */
const TWIN_LISTING = [
  'Listy odebrane:',
  ' 3. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
  ' 2. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
  ' 1. *R* Temat: Inny',
  'Nadawca: Corge                       Wt, 24 VIII 1999, 11:00:00',
];

/** Swiezy listing, na ktorym blizniak 2 ZNIKNAL (zostal skasowany). */
const SINGLE_LISTING = [
  'Listy odebrane:',
  ' 2. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
  ' 1. *R* Temat: Inny',
  'Nadawca: Corge                       Wt, 24 VIII 1999, 11:00:00',
];

/** Odpowiada pustym listingiem na kazda NIEodebrana kotwice w kolejce. */
async function drainOtherBoxes(h: Harness): Promise<void> {
  const empty: Record<string, string> = {
    nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
    wyslane: 'Nie masz zadnych wyslanych listow.',
    niewyslane: 'Nie masz zadnych niewyslanych listow.',
  };
  for (const box of ['nieprzeczytane', 'wyslane', 'niewyslane']) {
    await waitRt(
      () => h.f.sent.some((c) => c.startsWith(`listy ${box} przed`)),
      `kotwica: ${box}`,
    );
    h.f.fire(empty[box]!, 'mail');
    h.f.fire('> ', 'prompt');
  }
}

function replayListing(h: Harness, lines: string[]): void {
  for (const line of lines) h.f.fire(line, 'mail');
  h.f.fire('> ', 'prompt');
}

/** Pager: naglowki + body + prompt pagera i gry. */
function replayLetter(h: Harness, numer: number, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Goniec', 'mail');
  f.fire('Temat: Raport', 'mail');
  f.fire(`Data : ${TWIN_DATE}`, 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

const downloadBtn = (h: Harness): { textContent: string; dispatchEvent(e: unknown): void } => {
  const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
    textContent: string;
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(b, 'przycisk pobierania istnieje');
  return b;
};

/** Dwuklikowe uzbrojenie przycisku pobierania (Fala 16i). */
const clickDownloadTwice = (h: Harness): void => {
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));
};

/** Liczba wyslanych re-kotwic paginacja ("listy odebrane przed ..."). */
const anchorCount = (h: Harness): number =>
  h.f.sent.filter((c) => c.startsWith('listy odebrane przed')).length;

/** Odczyt archiwum z powrotem z (fake'owego) IndexedDB. */
const readBack = async (): Promise<Record<string, ArchiveLetter>> => {
  const driver = new IndexedDbStorageDriver(globalThis.indexedDB);
  const all = await driver.loadAllLetters();
  const raw = all['foo'] ?? {};
  return Object.fromEntries(
    Object.entries(raw).map(([id, value]) => [id, JSON.parse(value) as ArchiveLetter]),
  );
};

test('blizniaki: kazdy rekord pobiera WLASNA tresc ze swojego wiersza', async () => {
  const h = await startHarness({ archive: twinRecords() });
  try {
    click(h, '[data-tab="archiwum"]');
    const anchorsBefore = anchorCount(h);
    clickDownloadTwice(h);

    // Rekord 1 (wiersz 3): re-kotwica po dacie + odczyt wiersza 3.
    await waitRt(() => anchorCount(h) > anchorsBefore, 're-kotwica: rekord 1');
    replayListing(h, TWIN_LISTING);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt wiersza 3 (rekord 1)');
    replayLetter(h, 3, 'Tresc pierwszego.');

    // Rekord 2 (wiersz 2): OSOBNA re-kotwica + odczyt wiersza 2.
    await waitRt(() => anchorCount(h) > anchorsBefore + 1, 're-kotwica: rekord 2');
    replayListing(h, TWIN_LISTING);
    await waitRt(() => h.f.sent.includes('przeczytaj list 2'), 'odczyt wiersza 2 (rekord 2)');
    replayLetter(h, 2, 'Tresc drugiego.');

    await waitRt(() => notifyText(h.f, 'Pobrano tresci'), 'toast podsumowania');

    const stored = await readBack();
    const body1 = stored[ID_TWIN_1]?.body.join('\n') ?? '';
    const body2 = stored[ID_TWIN_2]?.body.join('\n') ?? '';
    assert.ok(body1.includes('Tresc pierwszego.'), 'rekord 1 dostal tresc wiersza 3');
    assert.ok(!body1.includes('Tresc drugiego.'), 'rekord 1 NIE dostal tresci blizniaka');
    assert.ok(body2.includes('Tresc drugiego.'), 'rekord 2 dostal tresc wiersza 2');
    assert.ok(!body2.includes('Tresc pierwszego.'), 'rekord 2 NIE dostal tresci blizniaka');
  } finally {
    await stopHarness();
  }
});

test('blizniaki: missing czysci TYLKO rekord, ktorego wiersza nie ma na listingu', async () => {
  const h = await startHarness({ archive: twinRecords() });
  try {
    click(h, '[data-tab="archiwum"]');
    const anchorsBefore = anchorCount(h);
    clickDownloadTwice(h);

    // Rekord 1: normalny odczyt.
    await waitRt(() => anchorCount(h) > anchorsBefore, 're-kotwica: rekord 1');
    replayListing(h, TWIN_LISTING);
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt wiersza 3 (rekord 1)');
    replayLetter(h, 3, 'Tresc pierwszego.');

    // Rekord 2: swiezy listing pokazuje, ze wiersz 2 zniknal.
    await waitRt(() => anchorCount(h) > anchorsBefore + 1, 're-kotwica: rekord 2');
    replayListing(h, SINGLE_LISTING);
    // 'missing' z odebranych = petla probuje pozostale skrzynki (replica
    // moze istniec gdzie indziej) - odpowiadamy pustymi listingami.
    await drainOtherBoxes(h);
    await waitRt(
      () => notifyText(h.f, 'nie ma juz w skrzynce'),
      'podsumowanie z missing: 1',
    );
    assert.ok(
      !h.f.sent.includes('przeczytaj list 2'),
      'zero odczytow przy zniknietym wierszu',
    );

    const stored = await readBack();
    const body1 = stored[ID_TWIN_1]?.body.join('\n') ?? '';
    assert.ok(body1.includes('Tresc pierwszego.'), 'blizniak zyjacy zostaje nietkniety (z trescia)');
    assert.equal(stored[ID_TWIN_2], undefined, 'rekord zniknietego wiersza purgowany');
  } finally {
    await stopHarness();
  }
});
