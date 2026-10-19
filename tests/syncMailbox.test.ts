/**
 * Sync skrzynek (Fala 12b; zmienia kontrakt "replace" z Fali 11e).
 *
 * Problem: klik w skrzynke / odswiezenie po odczycie listu robily
 * "replace" - gracz, ktory wczytal starsze strony ("Wczytaj starsze" /
 * "Wczytaj wszystkie"), tracil je przy kazdym odswiezeniu i wracal do
 * domyslnych 50 wpisow.
 *
 * Nowy kontrakt syncMailboxPage (domyslny tryb refreshBoxes):
 *  - wpisy znane (tozsamosc: strona|temat|forwarded|data) aktualizowane
 *    sa W MIEJSCU (np. znacznik *R* po odczycie) - kolejnosc i wczytane
 *    starsze strony zostaja;
 *  - nowe listy doklejane sa NA KONCU tablicy wpisow (koniec najnowszy;
 *    UI renderuje odwrotnie, wiec ląduja na gorze ekranu) - naprawia tez
 *    stary blad trybu "merge" z Fali 9b, ktory doklejal je na zly koniec;
 *  - znacznik uciecia zdejmowany dopiero, gdy mamy komplet
 *    (truncated = stary && nowy);
 *  - usuwanie wpisow TYLKO gdy swiezy listing jest kompletny (bez
 *    uciecia) - wtedy serwer raportuje pelna prawde (np. lista
 *    przeczytana znika z 'nieprzeczytane'); przy ucietych listingach
 *    brak wpisu moze byc zwyklym wypchnieciem poza pierwsza strone,
 *    wiec nic nie usuwamy;
 *  - null gdy brak widoku lub widok pusty - caller robi applyMailbox.
 *
 * Tryb "replace" zostaje dla kasowania listu (lista znika natychmiast).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MailBox } from '../src/arkmail/core/protocol/types.js';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox.js';
import { MailUiStore } from '../src/arkmail/ui/store';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  textOf,
  type Harness,
} from './harness';

type SyncResult = { updated: number; added: number; removed: number } | null;

/** Wywolanie przez rzutowanie: test pada w RUNTIME, gdy metody nie ma. */
const sync = (s: MailUiStore, box: MailBox, entries: MailboxEntry[], truncated: boolean): SyncResult =>
  (
    s as unknown as {
      syncMailboxPage?: (b: MailBox, e: MailboxEntry[], t: boolean) => SyncResult;
    }
  ).syncMailboxPage?.(box, entries, truncated) ?? null;

let seq = 0;
const entry = (
  subject: string,
  opts: { isRead?: boolean; party?: string; raw?: string } = {},
): MailboxEntry => {
  seq += 1;
  return {
    number: seq,
    isRead: opts.isRead ?? true,
    subject,
    forwarded: false,
    party: opts.party ?? 'Foo',
    partyKind: 'nadawca',
    date: {
      raw: opts.raw ?? `N, ${10 + seq} XII 2025, 10:00:00`,
      weekday: 'N',
      day: 10 + seq,
      month: 12,
      year: 2025,
      time: '10:00:00',
    },
  };
};

test('sync: aktualizuje wpisy w miejscu i zachowuje wczytane starsze strony', () => {
  const s = new MailUiStore();
  const e1 = entry('najstarszy', { raw: 'N, 21 XII 2025, 01:15:04' });
  const e2 = entry('srodkowy', { isRead: false, raw: 'Pn, 22 XII 2025, 02:20:05' });
  const e3 = entry('najnowszy', { raw: 'Wt, 23 XII 2025, 00:11:12' });
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [e1, e2, e3],
  });
  const o1 = entry('prastary', { party: 'Waldo', raw: 'So, 20 XII 2025, 10:00:00' });
  const o2 = entry('antyczny', { party: 'Baz', raw: 'Pt, 19 XII 2025, 09:00:00' });
  s.appendMailboxPage('odebrane', [o1, o2], true);
  assert.equal(s.state.boxes.odebrane!.entries.length, 5, '5 wpisow przed sync');

  // Swieza strona: te same 3 wpisy, ale 'srodkowy' juz przeczytany.
  const f2 = { ...e2, isRead: true };
  const r = sync(s, 'odebrane', [e1, f2, e3], true);
  assert.deepEqual(r, { updated: 3, added: 0, removed: 0 }, 'wszystkie 3 zaktualizowane');
  const entries = s.state.boxes.odebrane!.entries;
  assert.equal(entries.length, 5, 'wczytane starsze strony ZOSTAJA');
  assert.equal(entries[0], o1, 'starsza strona nietknieta (pozycja 0)');
  assert.equal(entries[1], o2, 'starsza strona nietknieta (pozycja 1)');
  assert.equal(entries[3].isRead, true, 'znacznik przeczytania zaktualizowany w miejscu');
  assert.equal(s.state.boxes.odebrane!.truncated, true, 'uciecie zostaje (niekomplet)');
});

test('sync: nowe listy dokleja NA KONCU tablicy (koniec najnowszy)', () => {
  const s = new MailUiStore();
  const e1 = entry('najstarszy', { raw: 'N, 21 XII 2025, 01:15:04' });
  const e2 = entry('srodkowy', { raw: 'Pn, 22 XII 2025, 02:20:05' });
  const e3 = entry('najnowszy', { raw: 'Wt, 23 XII 2025, 00:11:12' });
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [e1, e2, e3],
  });
  const nowy = entry('swiezy', { party: 'Grault', raw: 'Cz, 24 XII 2025, 08:00:00' });
  const r = sync(s, 'odebrane', [e1, e2, e3, nowy], true);
  assert.deepEqual(r, { updated: 3, added: 1, removed: 0 });
  const entries = s.state.boxes.odebrane!.entries;
  assert.equal(entries.length, 4);
  assert.equal(entries[3].subject, 'swiezy', 'nowy list na KONCU (najnowszy koniec)');
});

test('sync: null gdy brak widoku lub widok pusty (caller robi applyMailbox)', () => {
  const s = new MailUiStore();
  assert.equal(
    typeof (s as unknown as { syncMailboxPage?: unknown }).syncMailboxPage,
    'function',
    'metoda syncMailboxPage istnieje',
  );
  assert.equal(sync(s, 'odebrane', [entry('x')], false), null, 'brak widoku = null');
  s.applyMailbox('wyslane', { kind: 'pusta', box: 'wyslane', reason: 'puste' });
  assert.equal(sync(s, 'wyslane', [entry('y')], false), null, 'widok pusty = null');
});

test('sync: kompletny listing (bez uciecia) usuwa wpisy, ktorych serwer nie raportuje', () => {
  const s = new MailUiStore();
  const e1 = entry('najstarszy', { raw: 'N, 21 XII 2025, 01:15:04' });
  const e2 = entry('srodkowy', { raw: 'Pn, 22 XII 2025, 02:20:05' });
  const e3 = entry('najnowszy', { raw: 'Wt, 23 XII 2025, 00:11:12' });
  s.applyMailbox('nieprzeczytane', {
    kind: 'lista',
    header: { box: 'nieprzeczytane', truncated: false },
    entries: [e1, e2, e3],
  });
  // Serwer: e2 przeczytany - znika z 'nieprzeczytane'. Listing kompletny.
  const r = sync(s, 'nieprzeczytane', [e1, e3], false);
  assert.deepEqual(r, { updated: 2, added: 0, removed: 1 });
  const entries = s.state.boxes.nieprzeczytane!.entries;
  assert.deepEqual(
    entries.map((e) => e.subject),
    ['najstarszy', 'najnowszy'],
    'znikniety wpis usuniety, kolejnosc zachowana',
  );
});

test('sync: znacznik uciecia zdejmowany dopiero, gdy listing kompletny', () => {
  const s = new MailUiStore();
  const e1 = entry('najstarszy', { raw: 'N, 21 XII 2025, 01:15:04' });
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: true },
    entries: [e1],
  });
  sync(s, 'odebrane', [e1], true);
  assert.equal(s.state.boxes.odebrane!.truncated, true, 'true && true = true');
  sync(s, 'odebrane', [e1], false);
  assert.equal(s.state.boxes.odebrane!.truncated, false, 'true && false = false (komplet)');
});

/** Dokleja starsza strone (jak w boxMemory.test) - 5 wierszy razem. */
async function loadOlderPage(h: Harness): Promise<void> {
  const { f, waitFor } = h;
  click(h, '.arkmail-older');
  await waitFor(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'kotwica');
  f.fire('Wybrane listy odebrane:', 'mail');
  f.fire(' 2. *R* Temat: prastary', 'mail');
  f.fire('Nadawca: Waldo                          So, 20 XII 2025, 10:00:00', 'mail');
  f.fire(' 1. *R* Temat: antyczny', 'mail');
  f.fire('Nadawca: Baz                          Pt, 19 XII 2025, 09:00:00', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(() => h.content.querySelectorAll('.arkmail-entry').length === 5, '5 wierszy');
}

test('klik skrzynki po wczytaniu starszych: sync zachowuje 5 wierszy i aktualizuje znacznik', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);

    // Odejscie na wyslane i powrot na odebrane (klik = refetch).
    click(h, '[data-box="wyslane"]');
    await waitFor(() => f.sent.includes('listy wyslane'), 'pobranie wyslanych');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec pobierania wyslanych');
    click(h, '[data-box="odebrane"]');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'powrot = refetch najnowszej strony',
    );

    // Swieza strona: 'najnowszy' bez *R* (kiedys nieprzeczytany wrocil).
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');

    // Najpierw czekamy az swiezy listing ZOSTANIE zastosowany (znacznik
    // nieprzeczytany widoczny) - dopiero potem liczymy wiersze, inaczej
    // waitFor zlapalby stan sprzed async zapisu widoku.
    await waitFor(() => {
      const first = content.querySelector('.arkmail-entry') as { className: string } | null;
      return !!first && first.className.includes('arkmail-unread');
    }, 'swiezy listing zastosowany (znacznik nieprzeczytany)');
    assert.equal(
      content.querySelectorAll('.arkmail-entry').length,
      5,
      'sync: wczytane starsze strony NIE znikaja (5 wierszy)',
    );
  } finally {
    await stopHarness();
  }
});

test('powiadomienie o nowej poczcie: nowy list ląduje na GORZE widoku, strony zostaja', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);

    f.fire(' [ POCZTA ] Masz nowa poczte od Grault.');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'refresh po powiadomieniu',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 4. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 3. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 2. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Cz, 24 XII 2025, 08:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'refresh nieprzeczytanych',
    );
    f.fire(' 1. Temat: swiezy', 'mail');
    f.fire('Nadawca: Grault                         Cz, 24 XII 2025, 08:00:00', 'mail');
    f.fire('> ', 'prompt');

    await waitFor(() => content.querySelectorAll('.arkmail-entry').length === 6, '6 wierszy');
    // UI renderuje od najnowszego: nowy list = PIERWSZY wiersz DOM.
    // (Stary tryb "merge" doklejal go na zly koniec = ostatni wiersz.)
    assert.ok(textOf(h, '.arkmail-entry').includes('swiezy'), 'nowy list na gorze widoku');
  } finally {
    await stopHarness();
  }
});
