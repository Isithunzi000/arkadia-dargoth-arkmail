/**
 * Testy scalania kontaktow ArkMail (czysty core).
 * Zrodla: people (klient, mianownik+opis+guild), przedstawieni (scraping),
 * korespondencja (listingi/listy - mianownik), aliasy pocztowe.
 * Powiadomienie "Masz nowa poczte od X" NIE tworzy kontaktu - imie jest
 * w dopelniaczu (np. 'od Xa' dla imienia na X); sluzy tylko do odswiezania.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeContacts,
  contactsFromBoxes,
  splitParty,
  viewContacts,
  type ContactInput,
} from '../src/arkmail/core/contacts';

function input(partial: Partial<ContactInput>): ContactInput {
  return { people: [], przedstawieni: [], korespondencja: [], aliasy: [], ...partial };
}

test('korespondencja tworzy kontakt z licznikami i data', () => {
  const out = mergeContacts(input({
    korespondencja: [
      { name: 'Foo', direction: 'in', dateRaw: 'Nd, 22 VIII 1999, 01:15:04' },
      { name: 'Foo', direction: 'in', dateRaw: 'Pn, 23 VIII 1999, 02:20:05' },
      { name: 'Foo', direction: 'out', dateRaw: 'Nd, 22 VIII 1999, 00:20:12' },
      { name: 'Bar', direction: 'out', dateRaw: 'Sr, 8 IX 1999, 02:07:56' },
    ],
  }));
  assert.equal(out.length, 2);
  const af = out.find((c) => c.name === 'Foo')!;
  assert.equal(af.lettersReceived, 2);
  assert.equal(af.lettersSent, 1);
  assert.equal(af.lastContactRaw, 'Pn, 23 VIII 1999, 02:20:05', 'najnowsza data wygrywa');
  assert.deepEqual(af.sources, ['korespondencja']);
});

test('people dokleja opis i guild; match bez wzgledu na wielkosc liter', () => {
  const out = mergeContacts(input({
    people: [{ name: 'Foo', description: 'wysoki elf o zlocistych oczach', guild: 'GP' }],
    korespondencja: [{ name: 'foo', direction: 'in' }],
  }));
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.name, 'Foo', 'kanoniczna forma z people');
  assert.equal(c.description, 'wysoki elf o zlocistych oczach');
  assert.equal(c.guild, 'GP');
  assert.ok(c.sources.includes('people') && c.sources.includes('korespondencja'));
});

test('przedstawieni dolaczaja jako znani bez korespondencji', () => {
  const out = mergeContacts(input({
    przedstawieni: ['Foo', 'Waldo'],
    korespondencja: [{ name: 'Foo', direction: 'in' }],
  }));
  assert.equal(out.length, 2);
  const waldo = out.find((c) => c.name === 'Waldo')!;
  assert.deepEqual(waldo.sources, ['przedstawieni']);
  assert.equal(waldo.lettersReceived, 0);
});

test('alias pocztowy wskazujacy na kontakt: mailAlias + zrodlo alias', () => {
  const out = mergeContacts(input({
    korespondencja: [{ name: 'Bar', direction: 'out' }],
    aliasy: [{ name: 'foo', targets: ['Bar'] }],
  }));
  const g = out.find((c) => c.name === 'Bar')!;
  assert.equal(g.mailAlias, 'foo');
  assert.ok(g.sources.includes('alias'));
});

test('alias na nieznana osobe tworzy kontakt z sama nazwa aliasu', () => {
  const out = mergeContacts(input({
    aliasy: [{ name: 'szef', targets: ['Nib'] }],
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Nib');
  assert.equal(out[0].mailAlias, 'szef');
});

test('sortowanie: alfabetycznie po kanonicznej nazwie', () => {
  const out = mergeContacts(input({
    korespondencja: [
      { name: 'Snork', direction: 'in' },
      { name: 'Foo', direction: 'in' },
      { name: 'Flob', direction: 'out' },
    ],
  }));
  assert.deepEqual(out.map((c) => c.name), ['Flob', 'Foo', 'Snork']);
});

test('pelny obraz z logow: 28 przedstawionych + korespondencja + aliasy', () => {
  const przedstawieni = ['Foo', 'Quux', 'Zot', 'Bamf', 'Garply', 'Bork', 'Baz', 'Snafu',
    'Corge', 'Foobar', 'Fum', 'Bazola', 'Zippy', 'Bar', 'Kibo', 'Wibble', 'Wobble',
    'Wubble', 'Flob', 'Doofer', 'Thingy', 'Oof', 'Rab', 'Zab', 'Blorf', 'Flarp', 'Zonk', 'Waldo'];
  const out = mergeContacts(input({
    przedstawieni,
    korespondencja: [
      { name: 'Corge', direction: 'in', dateRaw: 'Wt, 24 VIII 1999, 00:11:12' },
      { name: 'Garply', direction: 'out', dateRaw: 'Nd, 22 VIII 1999, 00:31:18' },
    ],
    aliasy: [{ name: 'foo', targets: ['Bar'] }],
  }));
  assert.equal(out.length, 28);
  const gen = out.find((c) => c.name === 'Corge')!;
  assert.deepEqual(gen.sources.sort(), ['korespondencja', 'przedstawieni']);
  const gw = out.find((c) => c.name === 'Bar')!;
  assert.equal(gw.mailAlias, 'foo');
});

test('contactsFromBoxes: korespondencja z listingow + baza people', () => {
  const boxes = {
    odebrane: {
      entries: [
        { number: 3, isRead: true, subject: 'Perly', forwarded: false,
          party: 'Foo', partyKind: 'nadawca' as const,
          date: { raw: 'Wt, 24 VIII 1999, 00:11:12', weekday: 'Wt', day: 24, month: 8, year: 1999, time: '00:11:12' } },
      ],
    },
    wyslane: {
      entries: [
        { number: 5, isRead: true, subject: 'Re: Perly', forwarded: false,
          party: 'Garply', partyKind: 'odbiorcy' as const, date: null },
      ],
    },
  };
  const out = contactsFromBoxes(boxes, [
    { name: 'Foo', description: 'mag z gildii', guild: 'CK' },
  ]);
  const af = out.find((c) => c.name === 'Foo')!;
  assert.deepEqual(af.sources.sort(), ['korespondencja', 'people']);
  assert.equal(af.description, 'mag z gildii');
  assert.equal(af.guild, 'CK');
  assert.equal(af.lettersReceived, 1);
  const bl = out.find((c) => c.name === 'Garply')!;
  assert.equal(bl.lettersSent, 1);
  assert.deepEqual(bl.sources, ['korespondencja']);
});

test('contactsFromBoxes: wpis bez party jest pomijany', () => {
  const out = contactsFromBoxes({
    odebrane: {
      entries: [
        { number: 1, isRead: false, subject: 'X', forwarded: false,
          party: '', partyKind: null, date: null },
      ],
    },
  }, []);
  assert.deepEqual(out, []);
});

// --- Fala 8d: wielu odbiorcow (split), dedup, filtr i sort kontaktow ---------

test('splitParty: przecinek (listingi), " i " (naglowki), mieszane', () => {
  assert.deepEqual(splitParty('Bar'), ['Bar']);
  // Realne linie z logow: 'Odbiorcy: Fred, Grault', 'Odbiorcy: Plugh, Baz, Bar'.
  assert.deepEqual(splitParty('Fred, Grault'), ['Fred', 'Grault']);
  assert.deepEqual(splitParty('Plugh, Baz, Bar'), ['Plugh', 'Baz', 'Bar']);
  assert.deepEqual(splitParty('Gracz i Bar'), ['Gracz', 'Bar']);
  assert.deepEqual(splitParty('Fred, Grault i Bar'), ['Fred', 'Grault', 'Bar']);
  assert.deepEqual(splitParty('   '), []);
  assert.deepEqual(splitParty('Bar, Bar'), ['Bar'], 'dedup w obrebie jednej strony');
});

test('splitParty: odrzuca daty, godziny, dni tygodnia i wielokropki', () => {
  assert.deepEqual(splitParty('Foo, ..., Pn, 20 IX 1999, 03:04:05'), ['Foo']);
  assert.deepEqual(splitParty('Poniedzialek, Corge i Waldo'), ['Corge', 'Waldo']);
  assert.deepEqual(splitParty('Baz'), ['Baz']);
});

test('contactsFromBoxes: wielu odbiorcow z listingu - split i dedup (dane z logow)', () => {
  // Realny listing wyslanych: 'Odbiorcy: Fred, Grault   Nd, 31 X 1999, 02:49:49'
  // oraz 'Odbiorcy: Grault, Fred   Nd, 31 X 1999, 03:03:00'.
  const boxes = {
    wyslane: {
      entries: [
        { number: 40, isRead: true, subject: 'liscik 3', forwarded: false,
          party: 'Fred, Grault', partyKind: 'odbiorcy' as const,
          date: { raw: 'Nd, 31 X 1999, 02:49:49', weekday: 'N', day: 31, month: 10, year: 1999, time: '02:49:49' } },
        { number: 39, isRead: true, subject: 'liscik 3', forwarded: false,
          party: 'Grault, Fred', partyKind: 'odbiorcy' as const,
          date: { raw: 'Nd, 31 X 1999, 03:03:00', weekday: 'N', day: 31, month: 10, year: 1999, time: '03:03:00' } },
        { number: 38, isRead: true, subject: 'liscik 3', forwarded: false,
          party: 'Bar', partyKind: 'odbiorcy' as const,
          date: { raw: 'Cz, 28 X 1999, 00:31:37', weekday: 'Cz', day: 28, month: 10, year: 1999, time: '00:31:37' } },
      ],
    },
  };
  const out = contactsFromBoxes(boxes, []);
  assert.equal(out.length, 3, 'split: wpisy 2+2+1 odbiorcow daja 3 unikalne kontakty');
  const grault = out.find((c) => c.name === 'Grault')!;
  assert.equal(grault.lettersSent, 2, 'Grault byl adresatem dwoch listow');
  const fred = out.find((c) => c.name === 'Fred')!;
  assert.equal(fred.lettersSent, 2, 'Fred byl adresatem dwoch listow');
  assert.equal(out.find((c) => c.name === 'Bar')!.lettersSent, 1);
  assert.equal(grault.lastContactRaw, 'Nd, 31 X 1999, 03:03:00', 'nowszy list wygrywa (czas rozbija remis dnia)');
  assert.equal(grault.lastContactKey, 19991031030300, 'klucz yyyymmddHHMMSS z MailDate');
});

test('contactsFromBoxes: ostatni kontakt wg sparsowanej daty, nie leksykalnie', () => {
  // Porownanie surowych stringow ('So,...' > 'N,...') wybraloby STARSZA date
  // 25 IV; klucz z MailDate (yyyymmdd) wskazuje poprawnie 26 IV.
  const boxes = {
    wyslane: {
      entries: [
        { number: 2, isRead: true, subject: 'a', forwarded: false,
          party: 'Bar', partyKind: 'odbiorcy' as const,
          date: { raw: 'So, 25 IV 2026, 23:37:32', weekday: 'So', day: 25, month: 4, year: 2026, time: '23:37:32' } },
        { number: 1, isRead: true, subject: 'b', forwarded: false,
          party: 'Bar', partyKind: 'odbiorcy' as const,
          date: { raw: 'N, 26 IV 2026, 23:35:49', weekday: 'N', day: 26, month: 4, year: 2026, time: '23:35:49' } },
      ],
    },
  };
  const gw = contactsFromBoxes(boxes, []).find((c) => c.name === 'Bar')!;
  assert.equal(gw.lastContactRaw, 'N, 26 IV 2026, 23:35:49', '26 IV jest nowsze niz 25 IV');
  assert.equal(gw.lastContactKey, 20260426233549);
});

test('viewContacts: filtr po nazwie i aliasie (case-insensitive)', () => {
  const contacts = mergeContacts(input({
    korespondencja: [
      { name: 'Bar', direction: 'in' },
      { name: 'Grault', direction: 'out' },
    ],
    aliasy: [{ name: 'foo', targets: ['Grault'] }],
  }));
  assert.deepEqual(viewContacts(contacts, { filter: 'bar' }).map((c) => c.name), ['Bar']);
  assert.deepEqual(viewContacts(contacts, { filter: 'FOO' }).map((c) => c.name), ['Grault'],
    'filtr trafia tez w alias pocztowy');
  assert.deepEqual(viewContacts(contacts, { filter: 'zzz' }), []);
  assert.equal(viewContacts(contacts, {}).length, 2, 'bez filtra: wszystkie kontakty');
  assert.equal(viewContacts(contacts, { filter: '  ' }).length, 2, 'pusty filtr: wszystkie');
});

test('viewContacts: sort nazwa / liczba / ostatni kontakt', () => {
  const contacts = mergeContacts(input({
    korespondencja: [
      { name: 'Bar', direction: 'in', dateRaw: 'Cz, 28 X 1999, 00:31:37', dateKey: 19991028 },
      { name: 'Bar', direction: 'in' },
      { name: 'Bar', direction: 'out' },
      { name: 'Grault', direction: 'out', dateRaw: 'Nd, 31 X 1999, 03:03:00', dateKey: 19991031 },
      { name: 'Garply', direction: 'in' },
      { name: 'Garply', direction: 'out' },
    ],
  }));
  assert.deepEqual(viewContacts(contacts, { sort: 'nazwa' }).map((c) => c.name),
    ['Bar', 'Garply', 'Grault']);
  assert.deepEqual(viewContacts(contacts, { sort: 'liczba' }).map((c) => c.name),
    ['Bar', 'Garply', 'Grault'], 'liczba malejaco (3, 2, 1)');
  assert.deepEqual(viewContacts(contacts, { sort: 'ostatni' }).map((c) => c.name),
    ['Grault', 'Bar', 'Garply'], 'ostatni kontakt malejaco; brak daty na koncu');
  assert.deepEqual(contacts.map((c) => c.name), ['Bar', 'Garply', 'Grault'],
    'viewContacts nie mutuje wejscia');
});

// --- Fala 9c: ten sam list w kilku skrzynkach liczony RAZ -------------------

test('contactsFromBoxes: nieprzeczytany list w odebranych i nieprzeczytanych liczy sie raz', () => {
  const date = { raw: 'Sr, 25 VIII 1999, 08:00:00', weekday: 'Sr', day: 25, month: 8, year: 1999, time: '08:00:00' };
  const entry = { number: 1, isRead: false, subject: 'Swiezy', forwarded: false,
    party: 'Grault', partyKind: 'nadawca' as const, date };
  const out = contactsFromBoxes({
    odebrane: { entries: [entry] },
    nieprzeczytane: { entries: [{ ...entry }] },
  }, []);
  const at = out.find((c) => c.name === 'Grault')!;
  assert.equal(at.lettersReceived, 1);
});

test('contactsFromBoxes: rozne listy tego samego dnia licza sie osobno', () => {
  const d1 = { raw: 'Sr, 25 VIII 1999, 08:00:00', weekday: 'Sr', day: 25, month: 8, year: 1999, time: '08:00:00' };
  const d2 = { raw: 'Sr, 25 VIII 1999, 09:30:00', weekday: 'Sr', day: 25, month: 8, year: 1999, time: '09:30:00' };
  const out = contactsFromBoxes({
    odebrane: { entries: [
      { number: 2, isRead: true, subject: 'A', forwarded: false, party: 'Grault', partyKind: 'nadawca' as const, date: d1 },
      { number: 1, isRead: true, subject: 'B', forwarded: false, party: 'Grault', partyKind: 'nadawca' as const, date: d2 },
    ] },
  }, []);
  const at = out.find((c) => c.name === 'Grault')!;
  assert.equal(at.lettersReceived, 2);
});

test('contactsFromBoxes: dedup nie scala roznych kierunkow ani roznych osob', () => {
  const date = { raw: 'Sr, 25 VIII 1999, 08:00:00', weekday: 'Sr', day: 25, month: 8, year: 1999, time: '08:00:00' };
  const out = contactsFromBoxes({
    odebrane: { entries: [
      { number: 1, isRead: true, subject: 'Perly', forwarded: false, party: 'Grault', partyKind: 'nadawca' as const, date },
    ] },
    wyslane: { entries: [
      { number: 1, isRead: true, subject: 'Perly', forwarded: false, party: 'Grault', partyKind: 'odbiorcy' as const, date },
      { number: 2, isRead: true, subject: 'Perly', forwarded: false, party: 'Bar', partyKind: 'odbiorcy' as const, date },
    ] },
  }, []);
  const at = out.find((c) => c.name === 'Grault')!;
  assert.equal(at.lettersReceived, 1);
  assert.equal(at.lettersSent, 1);
  const gw = out.find((c) => c.name === 'Bar')!;
  assert.equal(gw.lettersSent, 1);
});
