/**
 * Widok archiwum (Fala 41): JEDEN REKORD = JEDEN WIERSZ. Zadnego
 * zwijania blizniakow - dwa listy o identycznych metadanych pokazuja
 * sie jako dwa osobne wiersze. Filtry (skrzynka, tresc, osoba, temat,
 * daty) dzialaja per rekord. Rekordy znikniete z serwera sa fizycznie
 * usuwane z bazy (purge), wiec w widoku ich nie ma.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterVisibleArchive,
  fromMailboxEntry,
  purgeGoneLetters,
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
    date: date('Wt, 24 VIII 1999, 00:11:12'),
    ...over,
  };
  return fromMailboxEntry(box, e);
}

test('blizniak nieprzeczytane+odebrane to DWA wiersze (per rekord)', () => {
  const twinA = entry('nieprzeczytane', { isRead: false });
  const twinB = entry('odebrane');
  assert.notEqual(twinA.id, twinB.id, 'zalozenie: osobne rekordy w archiwum');
  const rows = filterVisibleArchive([twinA, twinB], {});
  assert.equal(rows.length, 2, 'kazdy rekord = osobny wiersz');
  assert.deepEqual(
    rows.map((l) => l.id).sort(),
    [twinA.id, twinB.id].sort(),
    'obydwa rekordy widoczne',
  );
});

test('kazdy rekord zachowuje swoja tresc i wlasny wiersz', () => {
  const bezTresci = entry('odebrane');
  const zTrescia = { ...entry('nieprzeczytane', { isRead: false }), body: ['tresc'] };
  const rows = filterVisibleArchive([bezTresci, zTrescia], {});
  assert.equal(rows.length, 2, 'oba rekordy widoczne, zadnego zwijania');
  const withBody = rows.find((l) => l.id === zTrescia.id);
  assert.deepEqual(withBody?.body, ['tresc'], 'rekord zachowuje wlasna tresc');
});

test('filtr skrzynki dziala per rekord', () => {
  const twinA = entry('nieprzeczytane', { isRead: false });
  const twinB = entry('odebrane');
  const wyslany = entry('wyslane', { party: 'Qux', subject: 'Raport' });
  const rows = filterVisibleArchive([twinA, twinB, wyslany], { skrzynka: 'nieprzeczytane' });
  assert.equal(rows.length, 1, 'tylko rekord z nieprzeczytanych');
  assert.equal(rows[0].id, twinA.id);
  assert.equal(
    filterVisibleArchive([twinA, twinB, wyslany], { skrzynka: 'wyslane' }).length,
    1,
    'wyslane nietkniete',
  );
});

test('purge usuwa rekord znikniety z serwera; zywy blizniak zostaje jako wlasny wiersz', () => {
  const flagged = { ...entry('nieprzeczytane', { isRead: false }), missingOnServer: true };
  const zywy = entry('odebrane');
  const purged = purgeGoneLetters([flagged, zywy], 'nieprzeczytane', new Set());
  const rows = filterVisibleArchive(purged.letters, {});
  assert.equal(rows.length, 1, 'tylko zywy rekord zostaje w widoku');
  assert.equal(rows[0].box, 'odebrane');
  const samZnikniety = purgeGoneLetters([flagged], 'nieprzeczytane', new Set());
  assert.equal(samZnikniety.letters.length, 0, 'sam zombie fizycznie usuniety');
});

test('filtr tresci dziala per rekord (tylko rekord z trescia przechodzi)', () => {
  const bezTresci = entry('odebrane');
  const zTrescia = { ...entry('nieprzeczytane', { isRead: false }), body: ['sekretne wiesci'] };
  const rows = filterVisibleArchive([bezTresci, zTrescia], { tresc: 'wiesci' });
  assert.equal(rows.length, 1, 'tylko rekord z pasujaca trescia');
  assert.equal(rows[0].id, zTrescia.id);
  assert.equal(filterVisibleArchive([bezTresci, zTrescia], { tresc: 'nie-ma' }).length, 0);
});

test('kontakty i eksport pomijaja rekordy znikniete z serwera (po purge Fala 28)', () => {
  const flagged = {
    ...entry('odebrane', { party: 'Corge', subject: 'Stary' }),
    body: ['tresc'],
    missingOnServer: true,
  };
  const zywy = { ...entry('odebrane', { party: 'Foo' }), body: ['tresc'] };
  // freshIds = zywe rekordy z kompletnego listingu; purge kasuje reszte.
  const letters = purgeGoneLetters([flagged, zywy], 'odebrane', new Set([zywy.id])).letters;
  const contacts = contactsFromArchive(letters);
  assert.ok(
    !contacts.some((c) => c.name === 'Corge'),
    'znikniety list nie liczy sie do kontaktow',
  );
  const { entries } = archiveExportEntries(letters);
  assert.equal(entries.length, 1, 'eksport pomija znikniete');
  assert.ok(entries[0].name.startsWith('odebrane/'));
});

test('kolejnosc wyniku: od najnowszych (deterministycznie po grupach)', () => {
  const starszy = entry('odebrane', { subject: 'Stary', date: date('Nd, 22 VIII 1999, 01:15:04') });
  const nowszyTwin = entry('nieprzeczytane', { subject: 'Nowy', isRead: false });
  const nowszy = entry('odebrane', { subject: 'Nowy' });
  const r1 = filterVisibleArchive([starszy, nowszyTwin, nowszy], {});
  const r2 = filterVisibleArchive([nowszy, starszy, nowszyTwin], {});
  assert.deepEqual(
    r1.map((l) => l.subject),
    ['Nowy', 'Nowy', 'Stary'],
    'oba rekordy Nowy widoczne osobno',
  );
  assert.deepEqual(
    r1.map((l) => l.id),
    r2.map((l) => l.id),
    'kolejnosc nie zalezy od kolejnosci wejscia',
  );
});

test('upsertLetters odtwarza rekord po jego powrocie na listing (po purge Fala 28)', () => {
  const record = entry('odebrane');
  const purged = purgeGoneLetters([record], 'odebrane', new Set());
  assert.equal(purged.letters.length, 0, 'purge usunal rekord fizycznie');
  const merged = upsertLetters(purged.letters, [record]);
  assert.equal(merged.added, 1, 'rekord odtworzony z listingu');
  assert.equal(merged.letters[0]!.subject, record.subject);
});
