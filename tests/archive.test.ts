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
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { olderListingCommand } from '../src/arkmail/core/protocol/commands';
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
    date: date('Wt, 23 XII 2025, 00:11:12'),
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

test('archiwum: rozne numery/skrzynki to rozne listy', () => {
  const a = fromMailboxEntry('odebrane', entry());
  const b = fromMailboxEntry('odebrane', entry({ number: 8 }));
  const c = fromMailboxEntry('wyslane', entry());
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

test('archiwum: sortowanie malejaco po dacie (najnowsze pierwsze)', () => {
  const starszy = fromMailboxEntry('odebrane', entry({
    number: 1,
    subject: 'Stary',
    date: date('Pn, 1 I 2024, 10:00:00'),
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
  const zTrescia: ArchiveLetter = { ...a, body: ['Grazie za wiesci.'] };
  const { letters } = upsertLetters([], [zTrescia]);
  assert.equal(filterLetters(letters, { tresc: 'wiesci' }).length, 1);
  assert.equal(filterLetters(letters, { tresc: 'nie-ma-tego' }).length, 0);
  assert.equal(filterLetters(letters, { od: 'afan' }).length, 1);
  assert.equal(filterLetters(letters, { od: 'inny' }).length, 0);
  // skrzynka wyslanych: ta sama strona listu pasuje do filtra "do"
  const wyslany = fromMailboxEntry('wyslane', entry());
  assert.equal(filterLetters([wyslany], { do: 'afan' }).length, 1);
  assert.equal(filterLetters([wyslany], { od: 'afan' }).length, 0);
});

test('archiwum: zakres dat wlacznie (odDaty/doDaty)', () => {
  const a = fromMailboxEntry('odebrane', entry());
  const { letters } = upsertLetters([], [a]);
  assert.equal(filterLetters(letters, { odDaty: '2025-12-01', doDaty: '2025-12-31' }).length, 1);
  assert.equal(filterLetters(letters, { odDaty: '2026-01-01' }).length, 0);
  assert.equal(filterLetters(letters, { doDaty: '2025-12-22' }).length, 0);
});

test('paginacja: komenda listy <skrzynka> przed <d> <M RZYMSKI> <y>', () => {
  // Serwer wymaga WIELKIEJ litery miesiaca (log 2026-10-17: "Data zostala
  // podana w zlym formacie. Przykladowy format to: 13 X 2007.").
  assert.equal(
    olderListingCommand('wyslane', date('Cz, 9 III 2026, 12:00:00')),
    'listy wyslane przed 9 III 2026',
  );
  assert.equal(
    olderListingCommand('odebrane', date('Wt, 23 XII 2025, 00:11:12')),
    'listy odebrane przed 23 XII 2025',
  );
});
