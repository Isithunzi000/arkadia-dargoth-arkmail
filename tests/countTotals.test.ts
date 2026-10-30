/**
 * Fala 28: ujednolicenie totali licznikow.
 *
 * Zgloszenie live 2026-10-30: po indeksacji liczniki sie zgadzaja,
 * po wysylaniu/kasowaniu totalne liczniki wiadomosci miedzy zakladka
 * Kontakty a Archiwum rozjezdzaja sie. Przyczyny (pelna analiza):
 *
 *  1. Naglowek indeksacji i notify "Zindeksowano..." liczyly surowe
 *     state.archive.length - rekordy oznaczone jako nieobecne na
 *     serwerze (missingOnServer) SIEDZIALLY w bazie wiecznie (nic ich
 *     fizycznie nie kasowalo), wiec "totale" rosly z kazdym
 *     skasowanym listem, podczas gdy pasek archiwum liczyl tylko
 *     zywe rekordy.
 *  2. Oznaczanie polegalo na stawianiu flagi zamiast usuwania.
 *  3. Po wysylce wczesniej zapisanego szkicu refreshowala sie tylko
 *     skrzynka "wyslane" - rekord szkicu w "niewyslane" zostawal
 *     zywy w archiwum obok wyslanej kopii (archiwum +2, kontakty +1).
 *
 * Ten plik to dowod RED: testy padaja na kodzie sprzed Fali 28.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  fromMailboxEntry,
  purgeGoneLetters,
  purgeGoneLettersNewerThan,
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { totalLive, perBoxCounts } from '../src/arkmail/core/archiveStats';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { startHarness, stopHarness, click, waitRt, textOf } from './harness';

const window = new Window();
const document = window.document;

/** Rekord archiwum o zadanym polu/temacie (wzorzec z archiveCounts.test). */
function archived(
  box: ArchiveLetter['box'],
  subject: string,
  over: Partial<ArchiveLetter> = {},
): ArchiveLetter {
  return {
    ...fromMailboxEntry(box, {
      number: 1,
      isRead: true,
      subject,
      forwarded: false,
      party: 'Foo',
      partyKind: 'nadawca',
      date: {
        raw: 'Wt, 23 XII 2025, 00:11:12',
        weekday: 'Wt',
        day: 23,
        month: 12,
        year: 2025,
        time: '00:11:12',
      },
    }),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// T1/T2/T4: czysty core - totalLive / purge / perBoxCounts
// ---------------------------------------------------------------------------

test('total: blizniak (nieprzeczytany + odebrany) liczony RAZ', () => {
  const read = archived('odebrane', 'Wspolny');
  const unreadTwin = { ...archived('nieprzeczytane', 'Wspolny'), id: 'inny-rekord' };
  const letters = [read, unreadTwin];
  assert.equal(totalLive(letters), 1, 'total liczy zywe grupy, nie rekordy');
  assert.equal(letters.length, 2, 'surowa baza trzyma oba rekordy blizniaka');
});

test('total: per-skrzynka liczy blizniaka w KAZDEJ zywej skrzynce (regresja Fala 31d)', () => {
  const counts = perBoxCounts([
    archived('odebrane', 'Wspolny'),
    { ...archived('nieprzeczytane', 'Wspolny'), id: 'inny-rekord' },
    archived('wyslane', 'Raport'),
  ]);
  assert.equal(counts.get('odebrane'), 1);
  assert.equal(counts.get('nieprzeczytane'), 1);
  assert.equal(counts.get('wyslane'), 1);
  // Suma czesci celowo > total (blizniak w dwoch skrzynkach).
  assert.equal(totalLive([
    archived('odebrane', 'Wspolny'),
    { ...archived('nieprzeczytane', 'Wspolny'), id: 'inny-rekord' },
    archived('wyslane', 'Raport'),
  ]), 2);
});

test('purge: rekord nieobecny na KOMPLETNYM listingu znika fizycznie z bazy', () => {
  const stays = archived('odebrane', 'Zostaje');
  const goes = archived('odebrane', 'Znika');
  const sent = archived('wyslane', 'Inna skrzynka');
  const base = [stays, goes, sent];
  const out = purgeGoneLetters(base, 'odebrane', new Set([stays.id]));
  assert.deepEqual(
    out.letters.map((l) => l.subject),
    ['Zostaje', 'Inna skrzynka'],
    'nieobecny rekord usuniety fizycznie, inne skrzynki nietkniete',
  );
  assert.deepEqual([...out.removedIds], [goes.id], 'zwrot usunietych id dla widoku skrzynki');
  assert.equal(out.letters.length, base.length - 1);
});

test('purge: zakresowy usuwa tylko rekordy nowsze niz granica dnia', () => {
  const old = archived('odebrane', 'Stary');
  const fresh = archived('odebrane', 'Swiezy');
  const out = purgeGoneLettersNewerThan(
    [old, fresh],
    'odebrane',
    new Set(),
    '2025-12-23',
  );
  // sortKey obu = '2025-12-23 ...' -> granica dnia nietknieta.
  assert.equal(out.letters.length, 2);
  assert.equal(out.removedIds.size, 0);
});

test('purge: blednie usuniety list odtwarza sie z kolejnego listingu (upsert)', () => {
  const stays = archived('odebrane', 'Zostaje');
  const goes = archived('odebrane', 'Znika');
  const purged = purgeGoneLetters([stays, goes], 'odebrane', new Set([stays.id]));
  assert.equal(purged.letters.length, 1);
  // List wrocil na serwer: pelny listing go znowu raportuje.
  const merged = upsertLetters(purged.letters, [goes]);
  assert.equal(merged.added, 1, 'rekord odtworzony z listingu');
  assert.equal(totalLive(merged.letters), 2);
});

// ---------------------------------------------------------------------------
// T3: stopka indeksacji liczy zywe grupy, nie surowa dlugosc bazy
// ---------------------------------------------------------------------------

function mountFooter(archive: ArchiveLetter[]): {
  container: { querySelector(s: string): unknown };
  off: () => void;
} {
  // Stopka statusu indeksacji zyje w panelu KONTAKTY (render.ts:
  // data-pane-key="kontakty" bezposrednio przed .arkmail-index-foot).
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setArchive(archive);
  const container = document.createElement('div');
  const off = mountMailUi(
    container as unknown as HTMLElement,
    store,
    {} as unknown as MailUiHandlers,
  );
  return { container: container as unknown as { querySelector(s: string): unknown }, off };
}

test('total: stopka indeksacji liczy zywe grupy (blizniak raz), nie surowe rekordy', () => {
  const { container, off } = mountFooter([
    archived('odebrane', 'Wspolny'),
    { ...archived('nieprzeczytane', 'Wspolny'), id: 'inny-rekord' },
  ]);
  try {
    const foot = container.querySelector('.arkmail-index-foot') as {
      textContent?: string;
    } | null;
    assert.ok(foot, 'stopka istnieje');
    assert.ok(
      String(foot!.textContent).includes('listow w bazie: 1'),
      `stopka: ${foot!.textContent}`,
    );
  } finally {
    off();
  }
});

// ---------------------------------------------------------------------------
// T5: wysylka wczesniej zapisanego szkicu refreshuje tez niewyslane
// ---------------------------------------------------------------------------

test('total: wysylka szkicu odswieza wyslane INIEWYSLANE - szkic znika z bazy', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    // Prolog: POCZTA odswieza tylko odebrane/nieprzeczytane.
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(() => f.sent.includes('listy odebrane'), 'listing odebranych');
    f.fire('Nie masz zadnych odebranych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'listing nieprzeczytanych');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec prologu');

    // Szkic w niewyslanych (klik w skrzynke = replace-refresh).
    click(h, '[data-box="niewyslane"]');
    await waitFor(() => f.sent.includes('listy niewyslane'), 'listing niewyslanych');
    h.f.fire('Listy niewyslane:', 'mail');
    h.f.fire(' 1. Temat: szkic', 'mail');
    h.f.fire('Odbiorca: Corge                         Wt, 23 XII 2025, 10:00:00', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec listingu niewyslanych');

    // Compose: wysylka listu do Corge.
    const setField = (name: string, value: string) => {
      const el = content.querySelector(`[data-field="${name}"]`) as unknown as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      el.value = value;
      el.dispatchEvent(new h.window.Event('input'));
    };
    click(h, '[data-tab="napisz"]');
    setField('adresat', 'Corge');
    setField('temat', 'Perly');
    setField('tresc', 'czesc');
    click(h, '.arkmail-send');
    await waitFor(() => f.sent.includes('napisz list'), 'compose wystartowal');
    f.fire('Adresat: Temat: DW: ', 'mail');
    f.fire('Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.', 'mail');
    await waitRt(() => f.sent.includes('**'), 'tresc poszla');
    f.fire('List zostal pomyslnie wyslany.', 'mail');
    f.fire('> ', 'prompt');

    // Po wysylce: refresh WYSLANYCH (nowa kopia listu)...
    await waitFor(() => f.sent.includes('listy wyslane'), 'refresh wyslanych po wysylce');
    f.fire('Listy wyslane:', 'mail');
    f.fire(' 1. *R* Temat: Perly', 'mail');
    f.fire('Odbiorcy: Corge                         Wt, 23 XII 2025, 11:00:00', 'mail');
    f.fire('> ', 'prompt');
    // ...i refresh NIEWYSLANYCH (pelny listing pusty = szkic zniknal).
    await waitRt(
      () => f.sent.filter((c) => c === 'listy niewyslane').length >= 2,
      'refresh niewyslanych po wysylce',
    );
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec odswiezania');

    // Agregat: wyslana kopia JEDNA, szkic fizycznie z bazy zniknal.
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!content.querySelector('.arkmail-arch-counts'), 'pasek agregatu');
    const strip = textOf(h, '.arkmail-arch-counts');
    assert.equal(strip, 'Listow w bazie: 1 list (wyslane: 1 list).', `agregat: ${strip}`);
  } finally {
    await stopHarness();
  }
});
