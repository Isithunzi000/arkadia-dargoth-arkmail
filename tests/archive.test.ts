/**
 * Archiwum listow (czysta logika): deduplikacja po stabilnym id,
 * upsert z aktualizacja, filtry od/do/temat/tresc/zakres dat,
 * komenda paginacji wstecz "listy <skrzynka> przed <d> <m-rzymski> <y>"
 * (format zweryfikowany w prawdziwych logach gry).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterLetters,
  fromMailboxEntry,
  fromOpenedLetter,
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { olderListingCommand, nextDay } from '../src/arkmail/core/protocol/commands';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const date = (raw: string) => {
  const d = parseMailDate(raw);
  assert.ok(d, `parsowanie daty: ${raw}`);
  return d;
};

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 7,
    isRead: false,
    subject: 'Perly',
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: date('Wt, 24 VIII 1999, 00:11:12'),
    ...over,
  };
}

test('archiwum: id stabilne - ten sam list nie duplikuje sie', () => {
  const a = fromMailboxEntry('odebrane', entry());
  const b = fromMailboxEntry('odebrane', entry());
  assert.equal(a.id, b.id);
  const first = upsertLetters([], [a]);
  assert.equal(first.added, 1);
  const second = upsertLetters(first.letters, [b]);
  assert.equal(second.added, 0);
  assert.equal(second.letters.length, 1);
});

test('archiwum: upsert aktualizuje flage przeczytania i tresc', () => {
  const nowy = fromMailboxEntry('odebrane', entry());
  const { letters } = upsertLetters([], [nowy]);
  const przeczytany: ArchiveLetter = { ...nowy, read: true, body: ['tresc listu'] };
  const res = upsertLetters(letters, [przeczytany]);
  assert.equal(res.added, 0);
  assert.equal(res.updated, 1);
  assert.equal(res.letters[0].read, true);
  assert.deepEqual(res.letters[0].body, ['tresc listu']);
});

test('archiwum: rozne numery to TEN SAM list (renumeracja stron), rozne skrzynki to rozne', () => {
  // Serwer renumeruje wpisy na stronach "Wybrane listy" (1..N selekcji),
  // wiec numer nie moze wchodzic w sklad ID - inaczej paginacja mnozylaby
  // duplikaty w archiwum. ID = skrzynka|strona|temat|forwarded|data.
  const a = fromMailboxEntry('odebrane', entry());
  const b = fromMailboxEntry('odebrane', entry({ number: 8 }));
  const c = fromMailboxEntry('wyslane', entry());
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

test('archiwum: upsert po ID bez numeru - strona i listing nie duplikuja', () => {
  const pelny = fromMailboxEntry('wyslane', entry({ number: 50 }));
  const strona = fromMailboxEntry('wyslane', entry({ number: 3 }));
  const { letters, added } = upsertLetters([pelny], [strona]);
  assert.equal(added, 0);
  assert.equal(letters.length, 1);
});

test('archiwum: sortowanie malejaco po dacie (najnowsze pierwsze)', () => {
  const starszy = fromMailboxEntry('odebrane', entry({
    number: 1,
    subject: 'Stary',
    date: date('Pn, 1 I 1998, 10:00:00'),
  }));
  const nowszy = fromMailboxEntry('odebrane', entry());
  const { letters } = upsertLetters([], [starszy, nowszy]);
  assert.equal(letters[0].subject, 'Perly');
  assert.equal(letters[1].subject, 'Stary');
});

test('archiwum: filtr tematu - podciag, bez rozrozniania wielkosci', () => {
  const a = fromMailboxEntry('odebrane', entry());
  const b = fromMailboxEntry('odebrane', entry({ number: 9, subject: 'Rachunek' }));
  const { letters } = upsertLetters([], [a, b]);
  const res = filterLetters(letters, { temat: 'per' });
  assert.equal(res.length, 1);
  assert.equal(res[0].subject, 'Perly');
});

test('archiwum: filtr tresc przeszukuje body, filtr od po stronie listu', () => {
  const a = fromMailboxEntry('odebrane', entry());
  const zTrescia: ArchiveLetter = { ...a, body: ['Pisze krotko, bo sprawa pilna.'] };
  const { letters } = upsertLetters([], [zTrescia]);
  assert.equal(filterLetters(letters, { tresc: 'pilna' }).length, 1);
  assert.equal(filterLetters(letters, { tresc: 'nie-ma-tego' }).length, 0);
  assert.equal(filterLetters(letters, { od: 'fo' }).length, 1);
  assert.equal(filterLetters(letters, { od: 'inny' }).length, 0);
  // skrzynka wyslanych: ta sama strona listu pasuje do filtra "do"
  const wyslany = fromMailboxEntry('wyslane', entry());
  assert.equal(filterLetters([wyslany], { do: 'fo' }).length, 1);
  assert.equal(filterLetters([wyslany], { od: 'fo' }).length, 0);
});

test('archiwum: zakres dat wlacznie (odDaty/doDaty)', () => {
  const a = fromMailboxEntry('odebrane', entry());
  const { letters } = upsertLetters([], [a]);
  assert.equal(filterLetters(letters, { odDaty: '1999-08-09', doDaty: '1999-09-01' }).length, 1);
  assert.equal(filterLetters(letters, { odDaty: '1999-09-02' }).length, 0);
  assert.equal(filterLetters(letters, { doDaty: '1999-08-23' }).length, 0);
});

test('paginacja: komenda listy <skrzynka> przed <d> <M RZYMSKI> <y>', () => {
  // Serwer wymaga WIELKIEJ litery miesiaca (log 2026-10-17: "Data zostala
  // podana w zlym formacie. Przykladowy format to: 13 X 2007.").
  assert.equal(
    olderListingCommand('wyslane', date('Pn, 27 IX 1999, 12:00:00')),
    'listy wyslane przed 27 IX 1999',
  );
  assert.equal(
    olderListingCommand('odebrane', date('Wt, 24 VIII 1999, 00:11:12')),
    'listy odebrane przed 24 VIII 1999',
  );
});

test('paginacja: nextDay - kalendarz gregorianski (serwer waliduje daty)', () => {
  // Dowod z loga 2026-10-18: "przed 30 II 2026" odrzucone (30 lutego nie
  // istnieje) - kotwica +1 dzien musi byc prawdziwa data kalendarzowa.
  assert.deepEqual(nextDay({ day: 28, month: 2, year: 2026 }), { day: 1, month: 3, year: 2026 });
  assert.deepEqual(nextDay({ day: 28, month: 2, year: 2024 }), { day: 29, month: 2, year: 2024 });
  assert.deepEqual(nextDay({ day: 29, month: 2, year: 2024 }), { day: 1, month: 3, year: 2024 });
  assert.deepEqual(nextDay({ day: 31, month: 12, year: 2026 }), { day: 1, month: 1, year: 2027 });
  assert.deepEqual(nextDay({ day: 30, month: 4, year: 2026 }), { day: 1, month: 5, year: 2026 });
  assert.deepEqual(nextDay({ day: 15, month: 6, year: 2026 }), { day: 16, month: 6, year: 2026 });
});

// --- Fala 8f: cache - upsert z kazdego listingu, tresc z pagera, filtry UI ---

test('archiwum: filtr osoba (dowolny kierunek) i skrzynka', () => {
  const odebrany = fromMailboxEntry('odebrane', entry({ party: 'Bar' }));
  const wyslanyWspolny = fromMailboxEntry('wyslane', entry({ party: 'Bar, Grault', subject: 'wspolny' }));
  const wyslanyGarply = fromMailboxEntry('wyslane', entry({ party: 'Garply', subject: 'inny' }));
  const { letters } = upsertLetters([], [odebrany, wyslanyWspolny, wyslanyGarply]);
  assert.deepEqual(
    filterLetters(letters, { osoba: 'grault' }).map((l) => l.party),
    ['Bar, Grault'],
    'osoba trafia tez wsrod wielu odbiorcow',
  );
  assert.equal(filterLetters(letters, { osoba: 'bar' }).length, 2, 'osoba bez rozrozniania kierunku');
  assert.equal(filterLetters(letters, { skrzynka: 'wyslane' }).length, 2);
  assert.deepEqual(
    filterLetters(letters, { skrzynka: 'wyslane', osoba: 'garply' }).map((l) => l.party),
    ['Garply'],
    'filtry skladaja sie',
  );
});

test('fromOpenedLetter: z wpisu listingu - id zgodne, flaga forwarded, read', () => {
  const e = entry({ number: 1, subject: 'najnowszy', party: 'Corge', isRead: false });
  const letter = {
    number: 1,
    from: 'Corge',
    subject: 'najnowszy',
    to: '',
    cc: null,
    date: 'Wt, 24 VIII 1999, 00:11:12',
    body: ['czesc', 'co slychac'],
  };
  const a = fromOpenedLetter('odebrane', letter, e);
  assert.equal(a.id, fromMailboxEntry('odebrane', e).id, 'id zgodne z rekordem z listingu (dedup)');
  assert.deepEqual(a.body, ['czesc', 'co slychac']);
  assert.equal(a.read, true, 'otwarcie oznacza list jako przeczytany');
  assert.equal(a.number, 1);
});

test('fromOpenedLetter: bez wpisu listingu - fallback z naglowkow pagera', () => {
  const letter = {
    number: 7,
    from: '',
    subject: 'liscik 3',
    to: 'Bar',
    cc: null,
    date: 'Cz, 28 X 1999, 00:31:37',
    body: ['x'],
  };
  const wyslany = fromOpenedLetter('wyslane', letter);
  assert.equal(wyslany.party, 'Bar', 'wyslane: strona listu to adresat (Do)');
  assert.equal(wyslany.sortKey, '1999-10-28 00:31:37');
  const odebrany = fromOpenedLetter('odebrane', { ...letter, from: 'Grault' });
  assert.equal(odebrany.party, 'Grault', 'odebrane: strona listu to nadawca (Od)');
  assert.equal(odebrany.dateRaw, 'Cz, 28 X 1999, 00:31:37');
});
