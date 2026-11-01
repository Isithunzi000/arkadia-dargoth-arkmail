/**
 * Fala 41: liczniki po nowym modelu tozsamosci + klamra przeczesu.
 *
 * Kazdy wylistowany wpis to osobny rekord archiwum (blizniaki o
 * identycznych metadanych = dwa rekordy, dwa listy w licznikach).
 * Klamra incrementalnego przeczesu = strona w calosci dopasowana po
 * tresci do istniejacej bazy (brak nowych rekordow) - skan staje.
 * Strona z jakakolwiek nowa trescia = brak klamry, skan leci dalej.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry, contentKeyOf, scanKeyOfEntries, type ArchiveLetter } from '../src/arkmail/core/archive';
import { scanMailboxPages } from '../src/arkmail/core/pagination';
import type { MailboxResult } from '../src/arkmail/core/session/mailbox';
import {
  startHarness,
  stopHarness,
  driveIndexAll,
  click,
  notifyText,
  waitRt,
} from './harness';

const TWIN_DATE = 'Wt, 24 VIII 1999, 10:00:00';

/** Dwa wiersze blizniakow: identyczne metadane, rozne numery. */
const TWIN_LINES = [
  ' 3. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
  ' 2. *R* Temat: Raport',
  `Nadawca: Goniec                       ${TWIN_DATE}`,
];

test('skan: freshCounts liczy wystapienia (blizniaki = 2) i podaje per strone', async () => {
  const page = {
    kind: 'lista' as const,
    header: { box: 'odebrane' as const, truncated: false },
    entries: [
      { number: 3, isRead: true, subject: 'Raport', forwarded: false, party: 'Goniec', partyKind: 'nadawca' as const, date: { raw: TWIN_DATE, weekday: 'Wt', day: 24, month: 8, year: 1999, time: '10:00:00' } },
      { number: 2, isRead: true, subject: 'Raport', forwarded: false, party: 'Goniec', partyKind: 'nadawca' as const, date: { raw: TWIN_DATE, weekday: 'Wt', day: 24, month: 8, year: 1999, time: '10:00:00' } },
    ],
  };
  const scans: Array<ReadonlyMap<string, number>> = [];
  const result = await scanMailboxPages({
    box: 'odebrane',
    cancelled: () => false,
    fetchPage: async () => page,
    wait: async () => {},
    onPage: (res, pages, fresh) => {
      scans.push(fresh);
      return {};
    },
  });
  assert.equal(result.end, 'complete');
  const key = contentKeyOf(
    fromMailboxEntry('odebrane', page.entries[0] as never) as ArchiveLetter,
  );
  assert.equal(result.freshCounts.get(key), 2, 'dwa wystapienia blizniaka');
  assert.equal(scans.length, 1);
  assert.equal(scans[0]!.get(key), 2, 'per strona: wynik listingu');
});

test('skan: sonda sciany nie liczy ponownie wystapien z granicznego dnia', async () => {
  const twin = (n: number) => ({
    number: n, isRead: true, subject: 'Raport', forwarded: false,
    party: 'Goniec', partyKind: 'nadawca' as const,
    date: { raw: TWIN_DATE, weekday: 'Wt', day: 24, month: 8, year: 1999, time: '10:00:00' },
  });
  const older = {
    number: 1, isRead: true, subject: 'Starszy', forwarded: false,
    party: 'Corge', partyKind: 'nadawca' as const,
    date: { raw: 'Pn, 23 VIII 1999, 09:00:00', weekday: 'Pn', day: 23, month: 8, year: 1999, time: '09:00:00' },
  };
  const page = (entries: unknown[], truncated: boolean): MailboxResult =>
    ({ kind: 'lista', header: { box: 'odebrane', truncated }, entries } as unknown as MailboxResult);
  const result = await scanMailboxPages({
    box: 'odebrane',
    cancelled: () => false,
    fetchPage: async (command?: string) => {
      if (!command) return page([twin(3), twin(2)], true);
      if (command === 'listy odebrane przed 25 VIII 1999') return page([twin(3), twin(2)], true);
      if (command === 'listy odebrane przed 24 VIII 1999')
        return page([twin(3), twin(2), older], false);
      return { kind: 'pusta', box: 'odebrane', reason: 'puste' } as MailboxResult;
    },
    wait: async () => {},
    onPage: () => ({}),
    onBaseRefresh: () => {},
    onEmpty: () => {},
  });
  // Sonda odpytuje ponownie dzien graniczny; tu wrocil tez starszy
  // list z poprzedniego dnia - jest luka dnia 23 (ponad 50 listow),
  // wiec listing konczy sie niedomkniety. Liczenie wystapien nie
  // doklada blizniakow z granicznego dnia drugi raz.
  assert.equal(result.end, 'incomplete', 'sonda trafila na starszy dzien = luka, nie domkniecie');
  const twinKey = contentKeyOf(
    fromMailboxEntry('odebrane', twin(3) as never) as ArchiveLetter,
  );
  assert.equal(result.freshCounts.get(twinKey), 2, 'sonda nie doklada - 2, nie 4');
  const olderKey = contentKeyOf(fromMailboxEntry('odebrane', older as never) as ArchiveLetter);
  assert.equal(result.freshCounts.get(olderKey), 1);
});

test('indeksacja Fala 41: blizniaki = dwa osobne rekordy i dwa osobne listy w licznikach', async () => {
  const h = await startHarness();
  try {
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-index-all');
    await driveIndexAll(h, {
      odebrane: ['Listy odebrane:', ...TWIN_LINES, ' 1. *R* Temat: Inny',
        'Nadawca: Corge                       Wt, 24 VIII 1999, 11:00:00'],
    });
    await waitRt(() => notifyText(h.f, 'Zindeksowano wszystkie skrzynki'), 'koniec indeksacji');

    click(h, '[data-tab="archiwum"]');
    await h.waitFor(() => !!h.content.querySelector('.arkmail-arch-counts'), 'pasek licznikow');
    const strip = String(
      (h.content.querySelector('.arkmail-arch-counts') as { textContent?: string }).textContent,
    );
    assert.ok(
      strip.includes('3'),
      `listow w bazie = 3 (2 blizniaki jako osobne rekordy + 1 inny), pasek: "${strip}"`,
    );

    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'wiersze kontaktow');
    const rows = Array.from(
      h.content.querySelectorAll('.arkmail-contact') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    const goniec = rows.find((r) => r.includes('Goniec'));
    assert.ok(goniec?.includes('(odebrane: 2, wyslane: 0)'), `Goniec = 2 odebrane: "${goniec}"`);
  } finally {
    await stopHarness();
  }
});

test('indeksacja przyrostowa Fala 41: strona w calosci znana z archiwum = klamra, stop bez paginacji', async () => {
  // Ziarno = rekordy o ID z TEGO samego przebiegu skanu, ktory serwer
  // pokaze w teście (ta sama strona, te same pozycje) - tresc strony
  // w pelni pokryta, zadnego nowego rekordu = klamra.
  const entry = (n: number) => ({
    number: n, isRead: true, subject: 'Raport', forwarded: false,
    party: 'Goniec', partyKind: 'nadawca' as const,
    date: { raw: TWIN_DATE, weekday: 'Wt', day: 24, month: 8, year: 1999, time: '10:00:00' },
  });
  const entries = [entry(3), entry(2)];
  const scanKey = scanKeyOfEntries(entries as never);
  const seed: ArchiveLetter[] = entries.map((e, i) =>
    fromMailboxEntry('odebrane', e as never, scanKey, i),
  );
  const h = await startHarness({
    archive: seed,
    indexMeta: {
      odebrane: new Date().toISOString(),
      nieprzeczytane: new Date().toISOString(),
      wyslane: new Date().toISOString(),
      niewyslane: new Date().toISOString(),
    },
  });
  try {
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-index-all');
    await waitRt(
      () => h.f.sent.filter((c) => c === 'listy odebrane').length === 1,
      'indeksacja: listing odebranych',
    );
    h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    for (const line of TWIN_LINES) h.f.fire(line, 'mail');
    h.f.fire('> ', 'prompt');
    // Klamra: strona w calosci dopasowana po tresci (added 0) - skan
    // STAJE, kotwica paginacji nie wylatuje.
    await new Promise((r) => setTimeout(r, 700));
    assert.ok(
      !h.f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'brak paginacji na klamrze',
    );
  } finally {
    await stopHarness();
  }
});

test('indeksacja przyrostowa Fala 41: nowa tresc na stronie = brak klamry, skan leci dalej', async () => {
  const h = await startHarness({
    indexMeta: {
      odebrane: new Date().toISOString(),
      nieprzeczytane: new Date().toISOString(),
      wyslane: new Date().toISOString(),
      niewyslane: new Date().toISOString(),
    },
  });
  try {
    click(h, '[data-tab="archiwum"]');
    click(h, '.arkmail-index-all');
    await waitRt(
      () => h.f.sent.filter((c) => c === 'listy odebrane').length === 1,
      'indeksacja: listing odebranych',
    );
    h.f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    for (const line of TWIN_LINES) h.f.fire(line, 'mail');
    h.f.fire('> ', 'prompt');
    // Pusta baza: kazdy wpis to nowa tresc (dopisane 2 rekordy) - skan
    // idzie dalej (klamra dopiero na stronie bez nowych tresci).
    await waitRt(
      () => h.f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'paginacja po nowej tresci',
    );
  } finally {
    await stopHarness();
  }
});
