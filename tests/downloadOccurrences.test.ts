/**
 * Fala 35c: pobieranie tresci per wystapienie.
 *
 * Decyzja 2026-10-31 (variant 2): blizniaki o identycznych metadanych
 * to osobne listy na serwerze - skoro wylistowal je jako odrebne wiersze,
 * kazdy wiersz ma swoja tresc i kazdy ma wyladowac w pliku. Rekord
 * archiwum trzyma occurrences = wynik listingu oraz jedna tresc per
 * wystapienie: body = wystapienie 1, extraBodies = wystapienia 2..n.
 *
 * Kontrakt pobierania:
 *  - grupa z occurrences = 1: stara sciezka (re-kotwica + jeden odczyt),
 *  - grupa z occurrences > 1: swiezy listing skrzynki (jeden skan na
 *    skrzynke), odczyt KAZDEGO wiersza klucza w kolejnosci listingu
 *    do swojego slotu,
 *  - listing pokazuje mniej wierszy naz slotow w bazie = baza nieswieza:
 *    nic nie otwieramy, komunikat o ponownej indeksacji, bez purge
 *    (tozsamosc fizyczna nieznana),
 *  - circuit breaker (3 bledy z rzedu) obejmuje tez sciezke wielowystapieniowa.
 *
 * Ten plik to dowod RED: testy padaja na kodzie bez sciezki per wystapienie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  letterId,
  fromMailboxEntry,
  withOccurrenceBodies,
  bodiesOf,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import {
  startHarness,
  stopHarness,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const TWIN_DATE = 'Wt, 23 XII 2025, 10:00:00';

const twinSeed = (occurrences: number, extraBodies?: string[][]): ArchiveLetter => ({
  ...fromMailboxEntry('odebrane', {
    number: 3,
    isRead: true,
    subject: 'Raport',
    forwarded: false,
    party: 'Goniec',
    partyKind: 'nadawca',
    date: { raw: TWIN_DATE, weekday: 'Wt', day: 23, month: 12, year: 2025, time: '10:00:00' },
  }),
  id: letterId('odebrane', 'Goniec', 'Raport', false, TWIN_DATE),
  occurrences,
  ...(extraBodies ? { extraBodies } : {}),
});

/** Swiezy listing skrzynki z para blizniakow (nieuciety). */
const TWIN_LISTING = [
  'Listy odebrane:',
  ' 3. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
  ' 2. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
  ' 1. *R* Temat: Inny',
  'Nadawca: Corge                       Wt, 23 XII 2025, 11:00:00',
];

function replayTwinListing(h: Harness): void {
  for (const line of TWIN_LISTING) h.f.fire(line, 'mail');
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

const clickDownloadTwice = (h: Harness): void => {
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));
};

const listOdebraneCount = (h: Harness): number =>
  h.f.sent.filter((c) => c === 'listy odebrane').length;

test('jednostkowo: withOccurrenceBodies wypelnia sloty (body + extraBodies)', () => {
  const seed = twinSeed(3);
  const filled = withOccurrenceBodies(seed, [
    ['Tresc pierwszego.'],
    ['Tresc drugiego.'],
    ['Tresc trzeciego.'],
  ]);
  assert.equal(filled.body.join('\n'), 'Tresc pierwszego.');
  assert.deepEqual(filled.extraBodies, [['Tresc drugiego.'], ['Tresc trzeciego.']]);
  assert.equal(filled.occurrences, 3, 'occurrences nietkniete');
  // Zapelnione sloty: wszystkie niepuste.
  assert.ok(bodiesOf(filled).every((b) => b.length > 0));
  // Niekompletny zestaw: brakujace sloty zostaja puste.
  const partial = withOccurrenceBodies(seed, [['Tresc pierwszego.']]);
  assert.deepEqual(bodiesOf(partial), [['Tresc pierwszego.'], [], []]);
});

test('blizniaki: pobieranie odczytuje KAZDY wiersz do swojego slotu', async () => {
  const h = await startHarness({ archive: [twinSeed(2)] });
  try {
    click(h, '[data-tab="archiwum"]');
    const listingsBefore = listOdebraneCount(h);
    clickDownloadTwice(h);

    // Nowa sciezka: swiezy listing skrzynki (skan), nie re-kotwica po dacie.
    await waitRt(
      () => listOdebraneCount(h) > listingsBefore,
      'pobieranie wielowystapieniowe: swiezy listing skrzynki',
    );
    replayTwinListing(h);

    // Oba wystapienia odczytane po kolei (wiersze 3 i 2 listingu).
    await waitRt(() => h.f.sent.includes('przeczytaj list 3'), 'odczyt wystapienia 1');
    replayLetter(h, 3, 'Tresc pierwszego wystapienia.');
    await waitRt(() => h.f.sent.includes('przeczytaj list 2'), 'odczyt wystapienia 2');
    replayLetter(h, 2, 'Tresc drugiego wystapienia.');

    await waitRt(() => notifyText(h.f, 'Pobrano tresci'), 'toast podsumowania');
    await waitRt(
      () => downloadBtn(h).textContent === 'Pobierz tresci do archiwum',
      'przycisk wrocil do etykiety bazowej',
    );
  } finally {
    await stopHarness();
  }
});

test('blizniaki: baza chce wiecej wystapien niz pokazuje listing = indeksuj od nowa', async () => {
  // Baza twierdzi, ze byly 3 wystapienia; listing pokazuje 2 wiersze.
  const h = await startHarness({ archive: [twinSeed(3)] });
  try {
    click(h, '[data-tab="archiwum"]');
    const listingsBefore = listOdebraneCount(h);
    clickDownloadTwice(h);

    await waitRt(
      () => listOdebraneCount(h) > listingsBefore,
      'pobieranie: swiezy listing skrzynki',
    );
    replayTwinListing(h);
    await waitRt(() => notifyText(h.f, 'Indeksuj skrzynki od nowa'), 'komunikat o ponownej indeksacji');
    assert.ok(
      !h.f.sent.some((c) => c.startsWith('przeczytaj list')),
      'zero odczytow przy niespójnej bazie',
    );
    // Bez purge: rekord zostaje w archiwum.
    await h.waitFor(() => !!h.content.querySelector('.arkmail-arch-entry'), 'rekord w archiwum');
  } finally {
    await stopHarness();
  }
});

test('blizniaki: brakujacy tylko slot 2 = odczyt tylko drugiego wiersza', async () => {
  // Slot 1 (body) zapelniony, slot 2 pusty: odczyt tylko wiersza 2.
  const withBody = { ...twinSeed(2), body: ['Tresc pierwszego wystapienia.'] };
  const h = await startHarness({ archive: [withBody] });
  try {
    click(h, '[data-tab="archiwum"]');
    const listingsBefore = listOdebraneCount(h);
    clickDownloadTwice(h);

    await waitRt(
      () => listOdebraneCount(h) > listingsBefore,
      'pobieranie uzupelniajace: swiezy listing skrzynki',
    );
    replayTwinListing(h);

    await waitRt(() => h.f.sent.includes('przeczytaj list 2'), 'odczyt tylko brakujacego slotu');
    assert.ok(
      !h.f.sent.includes('przeczytaj list 3'),
      'zapelniony slot nie jest pobierany ponownie',
    );
    replayLetter(h, 2, 'Tresc drugiego wystapienia.');
    await waitRt(() => notifyText(h.f, 'Pobrano tresci'), 'toast podsumowania');
  } finally {
    await stopHarness();
  }
});
