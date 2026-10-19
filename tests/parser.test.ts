/**
 * Testy parsera protokolu poczty Arkadii - golden fixtures z prawdziwych
 * logow gry (tests/fixtures/*.json). Parser jest czystym TS (zero DOM,
 * zero PluginApi) - ten sam kod zasili porty WWW i Mudlet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseListingHeader,
  parseListingEntry,
  parseEmptyListing,
  parseLetterHeaderLine,
  isPagerPrompt,
  parseAliasesBlock,
  parseNotification,
  parseMailError,
  parseComposeEcho,
  parseEditorEcho,
  parseComposeResult,
  parsePrzedstawieni,
  parseMailDate,
  stripClientPrefix,
  type ProtoLine,
} from '../src/arkmail/core/protocol/parser';

const FIXTURES = path.join(process.cwd(), 'tests/fixtures');

function fixture(name: string): ProtoLine[] {
  const d = JSON.parse(fs.readFileSync(path.join(FIXTURES, name + '.json'), 'utf8'));
  return d.lines as ProtoLine[];
}

// --- listingi ------------------------------------------------------------

test('naglowek listing: wszystkie 4 skrzynki, z suffiksem i bez', () => {
  assert.deepEqual(parseListingHeader('Listy odebrane:'), { box: 'odebrane', truncated: false });
  assert.deepEqual(parseListingHeader('Listy nieprzeczytane:'), { box: 'nieprzeczytane', truncated: false });
  assert.deepEqual(parseListingHeader('Listy niewyslane:'), { box: 'niewyslane', truncated: false });
  assert.deepEqual(
    parseListingHeader('Listy wyslane (prezentowane jest pierwsze 50):'),
    { box: 'wyslane', truncated: true }
  );
  assert.equal(parseListingHeader('Listy odebrane '), null, 'bez dwukropka = nie naglowek');
  assert.equal(parseListingHeader('Listy odebranee:'), null);
});

test('wpis listing: numer, *R*, temat, nadawca/odbiorcy z data', () => {
  const e1 = parseListingEntry(' 3. *R* Temat: Elementy rozbitego szkielka');
  assert.deepEqual(e1, { number: 3, isRead: true, subject: 'Elementy rozbitego szkielka', forwarded: false });
  const e2 = parseListingEntry(' 1. Temat: Opowiesci, zabawa i utracone wspomnienia');
  assert.deepEqual(e2, { number: 1, isRead: false, subject: 'Opowiesci, zabawa i utracone wspomnienia', forwarded: false });
  const e3 = parseListingEntry(' 2. Temat: zalakowany pergamin (forwardowany)');
  assert.deepEqual(e3, { number: 2, isRead: false, subject: 'zalakowany pergamin', forwarded: true });
  const e4 = parseListingEntry('50. *R* Temat: karteczka');
  assert.deepEqual(e4, { number: 50, isRead: true, subject: 'karteczka', forwarded: false });
  assert.equal(parseListingEntry('Nadawca: X'), null);
});

test('data listu: pelna z godzina i dniem tygodnia', () => {
  assert.deepEqual(parseMailDate('N, 21 XII 2025, 01:15:04'), {
    raw: 'N, 21 XII 2025, 01:15:04', weekday: 'N', day: 21, month: 12, year: 2025, time: '01:15:04',
  });
  assert.deepEqual(parseMailDate('Sr, 7 I 2026, 02:07:56'), {
    raw: 'Sr, 7 I 2026, 02:07:56', weekday: 'Sr', day: 7, month: 1, year: 2026, time: '02:07:56',
  });
  assert.equal(parseMailDate('Foo'), null);
});

test('listing-odebrane-male: 3 wpisy z *R* i datami', () => {
  const lines = fixture('listing-odebrane-male').map((l) => l.text);
  const headerIdx = lines.findIndex((t) => parseListingHeader(t));
  assert.ok(headerIdx >= 0);
  const entries: ReturnType<typeof parseListingEntry>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const e = parseListingEntry(lines[i]);
    if (e) entries.push(e);
  }
  assert.equal(entries.length, 3);
  assert.ok(entries.every((e) => e && e.isRead), 'odebrane wszystkie z *R*');
  assert.equal(entries[0]?.number, 3, 'listing malejaco (najnowszy najpierw)');
});

test('listing-nieprzeczytane: wpisy bez *R* = nieprzeczytane', () => {
  const lines = fixture('listing-nieprzeczytane').map((l) => l.text);
  const headerIdx = lines.findIndex((t) => parseListingHeader(t));
  const e = parseListingEntry(lines[headerIdx + 1]);
  assert.ok(e);
  assert.equal(e.isRead, false);
  assert.equal(e.subject, 'Elementy rozbitego szkielka');
});

test('listing-wyslane-50: pelna strona 50 wpisow, truncated=true', () => {
  const lines = fixture('listing-wyslane-50').map((l) => l.text);
  const headerIdx = lines.findIndex((t) => parseListingHeader(t));
  const h = parseListingHeader(lines[headerIdx]);
  assert.equal(h?.truncated, true);
  let count = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (parseListingEntry(lines[i])) count++;
  }
  assert.equal(count, 50);
});

test('puste listingi: oba warianty komunikatow', () => {
  assert.deepEqual(parseEmptyListing('Nie masz zadnych nieprzeczytanych listow.'), { box: 'nieprzeczytane', reason: 'puste' });
  assert.deepEqual(parseEmptyListing('Nie masz zadnych niewyslanych listow.'), { box: 'niewyslane', reason: 'puste' });
  assert.deepEqual(parseEmptyListing('Nie znaleziono zadnych takich wyslanych listow.'), { box: 'wyslane', reason: 'filtr' });
  assert.equal(parseEmptyListing('Nie masz listow.'), null);
});

// --- naglowki listu -------------------------------------------------------

test('naglowki listu: List/Od/Temat/Do/Data z fixture', () => {
  const lines = fixture('listing-odebrane-male').map((l) => l.text);
  const start = lines.findIndex((t) => /^List\s*:/.test(t));
  assert.ok(start > 0);
  assert.deepEqual(parseLetterHeaderLine(lines[start]), { field: 'numer', value: '1' });
  assert.deepEqual(parseLetterHeaderLine(lines[start + 1]), { field: 'od', value: 'Corge' });
  assert.deepEqual(parseLetterHeaderLine(lines[start + 2]), { field: 'temat', value: '--' });
  assert.deepEqual(parseLetterHeaderLine(lines[start + 3]), { field: 'do', value: 'Gracz i Baz' });
  assert.deepEqual(parseLetterHeaderLine(lines[start + 4]), { field: 'data', value: 'Wt, 23 XII 2025, 00:11:12' });
});

// --- pager ----------------------------------------------------------------

test('pager prompt: zakresy i aktualny list', () => {
  assert.deepEqual(isPagerPrompt('[1-3 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- '), { lo: 1, hi: 3, current: 1 });
  assert.deepEqual(isPagerPrompt('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 23) -- '), { lo: 1, hi: 50, current: 23 });
  assert.equal(isPagerPrompt('> '), null);
  assert.equal(isPagerPrompt('[1-3] aktualny'), null);
});

// --- aliasy pocztowe ------------------------------------------------------

test('aliasy pocztowe: blok z naglowkiem i wpisami tabowanymi', () => {
  const lines = fixture('aliasy-pocztowe').map((l) => l.text);
  const start = lines.findIndex((t) => t === 'Posiadasz nastepujace zdefiniowane aliasy pocztowe:');
  assert.ok(start >= 0, 'naglowek aliasow w fixture');
  const aliasy = parseAliasesBlock(lines.slice(start));
  assert.ok(aliasy.length >= 1);
  assert.ok(aliasy.some((a) => a.name === 'poltorak' && a.targets.includes('Bar')));
});

// --- powiadomienia --------------------------------------------------------

test('powiadomienia: nowa poczte (z prefiksem klienta), goniec, wysylasz', () => {
  assert.deepEqual(parseNotification('Masz nowa poczte od Foo.'), { kind: 'nowa-poczte', nadawca: 'Foo' });
  assert.deepEqual(parseNotification(' [ POCZTA ] Masz nowa poczte od Wibble.'), { kind: 'nowa-poczte', nadawca: 'Wibble' });
  assert.deepEqual(parseNotification('Goniec przyniosl nowa partie listow.'), { kind: 'goniec' });
  assert.deepEqual(parseNotification('Wysylasz Kruk na poczte.'), { kind: 'wysylasz', zwierze: 'Kruk' });
  assert.deepEqual(parseNotification('Wysylasz Kruka na poczte.'), { kind: 'wysylasz', zwierze: 'Kruka' });
  // Fala 13b: powrot zwierzecia - dwa warianty z logow.
  assert.deepEqual(parseNotification('Wsrod trzepotu skrzydel Kruk laduje na twoim prawym ramieniu.'), { kind: 'powrot-zwierzecia', zwierze: 'Kruk' });
  assert.deepEqual(parseNotification('Wsrod trzepotu skrzydel Kruk laduje na twojej rece.'), { kind: 'powrot-zwierzecia', zwierze: 'Kruk' });
  // Fala 13c: dostawa przez zwierze poza sesja compose.
  assert.deepEqual(parseNotification('List zostal pomyslnie wyslany.'), { kind: 'list-wyslany' });
  assert.equal(parseNotification('Poczta jest zamknieta.'), null);
});

test('stripClientPrefix: zdejmuje [ POCZTA ] doklejane przez klienta', () => {
  assert.equal(stripClientPrefix(' [ POCZTA ] Masz nowa poczte od Foo.'), 'Masz nowa poczte od Foo.');
  assert.equal(stripClientPrefix('Zwykla linia.'), 'Zwykla linia.');
});

// --- bledy ----------------------------------------------------------------

test('bledy: zly numer, brak adresata (czysty i w echu subdialogu)', () => {
  assert.deepEqual(parseMailError('Zly numer listu: 4.'), { kind: 'zly-numer', numer: 4 });
  assert.deepEqual(parseMailError('Nie ma takiego adresata (gracza, aliasu): q.'), { kind: 'brak-adresata', adresat: 'q' });
  assert.deepEqual(parseMailError('Adresat: Nie ma takiego adresata (gracza, aliasu): thud.'), { kind: 'brak-adresata', adresat: 'thud' });
  assert.deepEqual(parseMailError('Zadne listy nie zostaly wybrane.'), { kind: 'brak-wyboru' });
  assert.equal(parseMailError('List jest gotowy do wyslania.'), null);
});

// --- edytor / compose -----------------------------------------------------

test('compose: echo promptow, numeracja linii, wynik', () => {
  assert.deepEqual(parseComposeEcho('Adresat: Temat: DW: '), ['adresat', 'temat', 'dw']);
  assert.deepEqual(parseComposeEcho('Adresat: '), ['adresat']);
  assert.deepEqual(parseComposeEcho('DW: '), ['dw']);
  assert.equal(parseComposeEcho('Temat: x'), null, 'pojedynczy Temat z wartoscia to nie echo');

  assert.deepEqual(parseEditorEcho(' 1]'), { consumed: 1, result: null });
  assert.deepEqual(parseEditorEcho(' 2] 3] 4]'), { consumed: 4, result: null });
  assert.deepEqual(parseEditorEcho(' 14]15]16]17]18]19]20]21]List zostal pomyslnie wyslany.'), { consumed: 21, result: 'wyslany' });
  assert.deepEqual(parseEditorEcho(' 8]List jest gotowy do wyslania.'), { consumed: 8, result: 'gotowy' });
  assert.equal(parseEditorEcho('zwykla linia'), null);

  assert.equal(parseComposeResult('List zostal pomyslnie wyslany.'), 'wyslany');
  assert.equal(parseComposeResult('List jest gotowy do wyslania.'), 'gotowy');
  assert.equal(parseComposeResult('List zostal wyslany.'), null);
});

// --- przedstawieni --------------------------------------------------------

test('przedstawieni: licznik w nawiasie, lista z "i" przed ostatnim', () => {
  const lines = fixture('przedstawieni').map((l) => l.text);
  const line = lines.find((t) => t.includes('przedstawione, to'));
  assert.ok(line, 'linia przedstawieni w fixture');
  const names = parsePrzedstawieni(line);
  assert.ok(names);
  assert.equal(names.length, 28);
  assert.equal(names[0], 'Foo');
  assert.equal(names[27], 'Waldo');
  assert.ok(names.includes('Bar'));
});

test('powiadomienia: linia po modyfikacji triggera klienta (prefix+suffix nowych linii)', () => {
  // Trigger klienta (newMail.ts) dokleja "\n[ POCZTA ] " z przodu i "\n\n"
  // z tylu - kolejne triggery widza zmodyfikowany buffer. Parser musi
  // tolerowac biale znaki na koncach linii.
  assert.deepEqual(parseNotification('\n[ POCZTA ] Masz nowa poczte od Bar.\n\n'), {
    kind: 'nowa-poczte',
    nadawca: 'Bar',
  });
  assert.deepEqual(parseNotification('Masz nowa poczte od Bar.\n\n'), {
    kind: 'nowa-poczte',
    nadawca: 'Bar',
  });
  assert.deepEqual(parseNotification('Goniec przyniosl nowa partie listow.\n'), { kind: 'goniec' });
});

test('listing: naglowek "Wybrane listy" (strona z filtrem/paginacji)', () => {
  // Serwer dla listingow z filtrem (przed/po/od/do/o temacie) mowi
  // "Wybrane listy <skrzynka>" - dowod: log 2026-10-18, 9 stron.
  assert.deepEqual(parseListingHeader('Wybrane listy wyslane (prezentowane jest pierwsze 50):'), {
    box: 'wyslane',
    truncated: true,
  });
  assert.deepEqual(parseListingHeader('Wybrane listy odebrane:'), {
    box: 'odebrane',
    truncated: false,
  });
});
