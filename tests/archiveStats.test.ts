// Fala 41: liczniki archiwum po modelu per rekord.
//
// Kazdy wylistowany wpis to osobny rekord (blizniaki o identycznych
// metadanych = osobne rekordy i osobne listy w licznikach). Wyjatkiem
// jest krotka replika miedzy skrzynkami (ten sam nieprzeczytany list
// siedzi w "nieprzeczytane" i "odebrane"): liczona RAZ (MAX w grupie
// klucza tresci). Kontakty sumuja rekordy korespondencji.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { perBoxCounts, totalLive } from '../src/arkmail/core/archiveStats';
import { contactsFromArchive } from '../src/arkmail/core/contacts';

const ENTRY = {
  number: 1,
  isRead: true,
  subject: 'Raport',
  forwarded: false,
  party: 'Goniec',
  partyKind: 'nadawca' as const,
  date: {
    raw: 'Wt, 24 VIII 1999, 00:11:12',
    weekday: 'Wt',
    day: 23,
    month: 12,
    year: 2025,
    time: '00:11:12',
  },
};

function archived(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return { ...fromMailboxEntry('odebrane', ENTRY), ...over };
}

test('liczniki: kazdy rekord (listingowany list) liczy sie osobno', () => {
  // Dwa blizniaki w tej samej skrzynce = dwa rekordy = dwa listy.
  const letters = [archived(), archived(), archived({ subject: 'Inny' })];
  assert.equal(totalLive(letters), 3, '2 blizniaki + 1 inny, zadnego sklejania');
});

test('liczniki: krotka replika miedzy skrzynkami liczy RAZ (MAX)', () => {
  const letters = [archived(), archived({ box: 'nieprzeczytane' })];
  assert.equal(totalLive(letters), 1, 'nie 2 - to ten sam list w dwoch skrzynkach');
});

test('liczniki: perBoxCounts liczy rekordy per skrzynka', () => {
  const letters = [
    archived(),
    archived(),
    archived({ box: 'nieprzeczytane' }),
    archived({ subject: 'Inny' }),
  ];
  const counts = perBoxCounts(letters);
  assert.equal(counts.get('odebrane'), 3);
  assert.equal(counts.get('nieprzeczytane'), 1);
});

test('liczniki: kontakty sumuja rekordy korespondencji', () => {
  const letters = [archived(), archived(), archived({ subject: 'Inny' })];
  const contacts = contactsFromArchive(letters);
  const goniec = contacts.find((c) => c.name === 'Goniec');
  assert.equal(goniec?.lettersReceived, 3, '3 listy od Goncia');
});
