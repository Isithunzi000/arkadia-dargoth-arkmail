/**
 * Fala 18a (zgloszenie 2026-10-20 pkt 1/3/4): widok archiwum zwija
 * blizniaki (nieprzeczytane+odebrane) do jednego wiersza, ukrywa
 * rekordy oznaczone jako znikniete z serwera, filtr skrzynki i tresci
 * dziala po CA LEJ grupie blizniakow. Kompletny listing (bez uciecia)
 * oznacza nieobecne rekordy jako znikniete; kontakty i eksport je
 * pomijaja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterVisibleArchive,
  fromMailboxEntry,
  upsertLetters,
  type ArchiveLetter,
} from '../src/arkmail/core/archive';
import { archiveExportEntries } from '../src/arkmail/core/exportTxt';
import { contactsFromArchive } from '../src/arkmail/core/contacts';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import type { MailBox } from '../src/arkmail/core/protocol/types';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const date = (raw: string) => {
  const d = parseMailDate(raw);
  assert.ok(d, `parsowanie daty: ${raw}`);
  return d;
};

function entry(box: MailBox, over: Partial<MailboxEntry> = {}): ArchiveLetter {
  const e: MailboxEntry = {
    number: 1,
    isRead: true,
    subject: 'Perly',
    forwarded: false,
    party: 'Foo',
    partyKind: box === 'odebrane' || box === 'nieprzeczytane' ? 'nadawca' : 'odbiorcy',
    date: date('Wt, 23 XII 2025, 00:11:12'),
    ...over,
  };
  return fromMailboxEntry(box, e);
}

test('blizniak nieprzeczytane+odebrane zwija sie do jednego wiersza (kanoniczna: odebrane)', () => {
  const twinA = entry('nieprzeczytane', { isRead: false });
  const twinB = entry('odebrane');
  assert.notEqual(twinA.id, twinB.id, 'zalozenie: osobne rekordy w archiwum');
  const rows = filterVisibleArchive([twinA, twinB], {});
  assert.equal(rows.length, 1, 'jeden wiersz zamiast dwoch');
  assert.equal(rows[0].box, 'odebrane', 'reprezentant ze skrzynki kanonicznej');
});

test('reprezentant grupy: rekord z trescia wygrywa z kanonicznym bez tresci', () => {
  const bezTresci = entry('odebrane');
  const zTrescia = { ...entry('nieprzeczytane', { isRead: false }), body: ['tresc'] };
  const rows = filterVisibleArchive([bezTresci, zTrescia], {});
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].body, ['tresc'], 'wiersz ma tresc blizniaka');
});

test('filtr skrzynki dopasowuje grupe po dowolnej skrzynce blizniaka', () => {
  const twinA = entry('nieprzeczytane', { isRead: false });
  const twinB = entry('odebrane');
  const wyslany = entry('wyslane', { party: 'Qux', subject: 'Raport' });
  const rows = filterVisibleArchive([twinA, twinB, wyslany], { skrzynka: 'nieprzeczytane' });
  assert.equal(rows.length, 1, 'grupa przechodzi przez blizniaka');
  assert.equal(rows[0].subject, 'Perly');
  // ...ale reprezentant pokazuje skrzynke kanoniczna, nie zombie:
  assert.equal(rows[0].box, 'odebrane');
  assert.equal(
    filterVisibleArchive([twinA, twinB, wyslany], { skrzynka: 'wyslane' }).length,
    1,
    'wyslane nietkniete',
  );
});

test('rekordy znikniete z serwera sa ukryte; grupa z zywym blizniakiem zostaje', () => {
  const znikniety = { ...entry('nieprzeczytane', { isRead: false }), missingOnServer: true };
  const zywy = entry('odebrane');
  const rows = filterVisibleArchive([znikniety, zywy], {});
  assert.equal(rows.length, 1, 'grupa zyje przez odebrane');
  assert.equal(rows[0].box, 'odebrane');
  const samZnikniety = filterVisibleArchive([znikniety], {});
  assert.equal(samZnikniety.length, 0, 'sam zombie ukryty');
});

test('filtr tresci dopasowuje grupe po tresci dowolnego blizniaka', () => {
  const bezTresci = entry('odebrane');
  const zTrescia = { ...entry('nieprzeczytane', { isRead: false }), body: ['sekretne wiesci'] };
  const rows = filterVisibleArchive([bezTresci, zTrescia], { tresc: 'wiesci' });
  assert.equal(rows.length, 1, 'tresc blizniaka przepuszcza grupe');
  assert.equal(filterVisibleArchive([bezTresci, zTrescia], { tresc: 'nie-ma' }).length, 0);
});

test('kontakty i eksport pomijaja rekordy znikniete z serwera', () => {
  const znikniety = {
    ...entry('odebrane', { party: 'Corge', subject: 'Stary' }),
    body: ['tresc'],
    missingOnServer: true,
  };
  const zywy = { ...entry('odebrane', { party: 'Foo' }), body: ['tresc'] };
  const contacts = contactsFromArchive([znikniety, zywy]);
  assert.ok(
    !contacts.some((c) => c.name === 'Corge'),
    'znikniety list nie liczy sie do kontaktow',
  );
  const { entries } = archiveExportEntries([znikniety, zywy]);
  assert.equal(entries.length, 1, 'eksport pomija znikniete');
  assert.ok(entries[0].name.startsWith('odebrane/'));
});

test('kolejnosc wyniku: od najnowszych (deterministycznie po grupach)', () => {
  const starszy = entry('odebrane', { subject: 'Stary', date: date('N, 21 XII 2025, 01:15:04') });
  const nowszyTwin = entry('nieprzeczytane', { subject: 'Nowy', isRead: false });
  const nowszy = entry('odebrane', { subject: 'Nowy' });
  const r1 = filterVisibleArchive([starszy, nowszyTwin, nowszy], {});
  const r2 = filterVisibleArchive([nowszy, starszy, nowszyTwin], {});
  assert.deepEqual(
    r1.map((l) => l.subject),
    ['Nowy', 'Stary'],
  );
  assert.deepEqual(
    r1.map((l) => l.id),
    r2.map((l) => l.id),
    'kolejnosc nie zalezy od kolejnosci wejscia',
  );
});

test('upsertLetters nadal czysci znacznik znikniecia po powrocie do listingu', () => {
  const znikniety = { ...entry('odebrane'), missingOnServer: true };
  const swiezy = entry('odebrane');
  const merged = upsertLetters([znikniety], [swiezy]);
  assert.equal(merged.letters[0].missingOnServer, undefined, 'powrot do listingu czysci znacznik');
});
