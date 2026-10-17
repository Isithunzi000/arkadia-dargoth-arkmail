/**
 * Testy scalania kontaktow ArkMail (czysty core).
 * Zrodla: people (klient, mianownik+opis+guild), przedstawieni (scraping),
 * korespondencja (listingi/listy - mianownik), aliasy pocztowe.
 * Powiadomienie "Masz nowa poczte od X" NIE tworzy kontaktu - imie jest
 * w dopelniaczu (od Wibble != Wibble); sluzy tylko do odswiezania.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeContacts, contactsFromBoxes, type ContactInput } from '../src/arkmail/core/contacts';

function input(partial: Partial<ContactInput>): ContactInput {
  return { people: [], przedstawieni: [], korespondencja: [], aliasy: [], ...partial };
}

test('korespondencja tworzy kontakt z licznikami i data', () => {
  const out = mergeContacts(input({
    korespondencja: [
      { name: 'Foo', direction: 'in', dateRaw: 'N, 21 XII 2025, 01:15:04' },
      { name: 'Foo', direction: 'in', dateRaw: 'Pn, 22 XII 2025, 02:20:05' },
      { name: 'Foo', direction: 'out', dateRaw: 'N, 21 XII 2025, 00:20:12' },
      { name: 'Bar', direction: 'out', dateRaw: 'Sr, 7 I 2026, 02:07:56' },
    ],
  }));
  assert.equal(out.length, 2);
  const af = out.find((c) => c.name === 'Foo')!;
  assert.equal(af.lettersReceived, 2);
  assert.equal(af.lettersSent, 1);
  assert.equal(af.lastContactRaw, 'Pn, 22 XII 2025, 02:20:05', 'najnowsza data wygrywa');
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
    aliasy: [{ name: 'poltorak', targets: ['Bar'] }],
  }));
  const g = out.find((c) => c.name === 'Bar')!;
  assert.equal(g.mailAlias, 'poltorak');
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
  assert.deepEqual(out.map((c) => c.name), ['Foo', 'Flob', 'Snork']);
});

test('pelny obraz z logow: 28 przedstawionych + korespondencja + aliasy', () => {
  const przedstawieni = ['Foo', 'Quux', 'Zot', 'Bamf', 'Garply', 'Bork', 'Baz', 'Snafu',
    'Corge', 'Foobar', 'Fum', 'Bazola', 'Zippy', 'Bar', 'Kibo', 'Wibble', 'Wobble',
    'Wubble', 'Flob', 'Doofer', 'Thingy', 'Oof', 'Rab', 'Zab', 'Blorf', 'Flarp', 'Zonk', 'Waldo'];
  const out = mergeContacts(input({
    przedstawieni,
    korespondencja: [
      { name: 'Corge', direction: 'in', dateRaw: 'Wt, 23 XII 2025, 00:11:12' },
      { name: 'Garply', direction: 'out', dateRaw: 'N, 21 XII 2025, 00:31:18' },
    ],
    aliasy: [{ name: 'poltorak', targets: ['Bar'] }],
  }));
  assert.equal(out.length, 28);
  const gen = out.find((c) => c.name === 'Corge')!;
  assert.deepEqual(gen.sources.sort(), ['korespondencja', 'przedstawieni']);
  const gw = out.find((c) => c.name === 'Bar')!;
  assert.equal(gw.mailAlias, 'poltorak');
});

test('contactsFromBoxes: korespondencja z listingow + baza people', () => {
  const boxes = {
    odebrane: {
      entries: [
        { number: 3, isRead: true, subject: 'Perly', forwarded: false,
          party: 'Foo', partyKind: 'nadawca' as const,
          date: { raw: 'Wt, 23 XII 2025, 00:11:12', weekday: 'Wt', day: 23, month: 12, year: 2025, time: '00:11:12' } },
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
