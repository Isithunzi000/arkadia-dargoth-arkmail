/**
 * Fala UI-2 krok 2a: import osob i aliasow z gry.
 * Formaty zweryfikowane na zywo 2026-11-03 (pomoc gry + output):
 *  - "zapamietani"      -> "[NN] Zapamietane przez ciebie imiona to A, B i C."
 *  - "przedstawieni"    -> "[NN] Osoby, ktore zostaly ci ostatnio przedstawione, to A, B i C."
 *  - "aliasy pocztowe"  -> naglowek + linie "\tNAZWA: adresaci" (parseAliasesBlock).
 * Imiona w testach syntetyczne (Fred, Grault, Corge).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRememberedLine,
  parseIntroducedLine,
} from '../src/arkmail/core/protocol/parser';
import { ImportSession } from '../src/arkmail/core/session/importer';
import { MockTransport } from '../src/arkmail/core/session/transport';

const OPTS = { timeoutMs: 500, idleMs: 40 };

test('parser: zapamietani - lista imion po "[NN] ... to "', () => {
  assert.deepEqual(
    parseRememberedLine('[88] Zapamietane przez ciebie imiona to Fred, Grault i Corge.'),
    ['Fred', 'Grault', 'Corge'],
  );
  assert.deepEqual(
    parseRememberedLine('[2] Zapamietane przez ciebie imiona to Fred.'),
    ['Fred'],
  );
});

test('parser: zapamietani - linia niepasujaca daje null', () => {
  assert.equal(parseRememberedLine('> '), null);
  assert.equal(parseRememberedLine('[88] Osoby, ktore zostaly ci ostatnio przedstawione, to Fred.'), null);
  assert.equal(parseRememberedLine('Nie ma takiego adresata (gracza, aliasu): Fred.'), null);
});

test('parser: przedstawieni - lista imion po "[NN] ... to "', () => {
  assert.deepEqual(
    parseIntroducedLine('[103] Osoby, ktore zostaly ci ostatnio przedstawione, to Fred, Grault i Corge.'),
    ['Fred', 'Grault', 'Corge'],
  );
  assert.equal(
    parseIntroducedLine('[88] Zapamietane przez ciebie imiona to Fred.'),
    null,
  );
});

test('sesja: fetchPeople(zapamietani) wysyla komende i zbiera linie', async () => {
  const t = new MockTransport();
  const s = new ImportSession(t, OPTS);
  const op = s.fetchPeople('zapamietani');
  await t.replay([
    { cls: 'mail', text: '→ zapamietani', own: true },
    { cls: 'mail', text: '[12] Zapamietane przez ciebie imiona to Fred i Grault.' },
    { cls: 'mail', text: '> ' },
  ]);
  assert.deepEqual(await op, ['Fred', 'Grault']);
  assert.deepEqual(t.sent, ['zapamietani']);
  assert.deepEqual(t.sentEcho, [false], 'komenda importu bez echa');
});

test('sesja: fetchPeople(przedstawieni)', async () => {
  const t = new MockTransport();
  const s = new ImportSession(t, OPTS);
  const op = s.fetchPeople('przedstawieni');
  await t.replay([
    { cls: 'mail', text: '→ przedstawieni', own: true },
    { cls: 'mail', text: '[7] Osoby, ktore zostaly ci ostatnio przedstawione, to Corge.' },
    { cls: 'mail', text: '> ' },
  ]);
  assert.deepEqual(await op, ['Corge']);
  assert.deepEqual(t.sent, ['przedstawieni']);
});

test('sesja: fetchAliases zbiera blok naglowek + wpisy', async () => {
  const t = new MockTransport();
  const s = new ImportSession(t, OPTS);
  const op = s.fetchAliases();
  await t.replay([
    { cls: 'mail', text: '→ aliasy pocztowe', own: true },
    { cls: 'mail', text: 'Posiadasz nastepujace zdefiniowane aliasy pocztowe:' },
    { cls: 'mail', text: '\tzgromadzenie: Fred, Grault' },
    { cls: 'mail', text: '\trada: Corge' },
    { cls: 'mail', text: '> ' },
  ]);
  assert.deepEqual(await op, [
    { name: 'zgromadzenie', targets: ['Fred', 'Grault'] },
    { name: 'rada', targets: ['Corge'] },
  ]);
  assert.deepEqual(t.sent, ['aliasy pocztowe']);
});

test('sesja: brak odpowiedzi - timeout', async () => {
  const t = new MockTransport();
  const s = new ImportSession(t, { timeoutMs: 30 });
  await assert.rejects(s.fetchPeople('zapamietani'), /timeout/i);
});

test('sesja: prompt bez danych - pusta lista, nie blad', async () => {
  const t = new MockTransport();
  const s = new ImportSession(t, OPTS);
  const op = s.fetchPeople('zapamietani');
  await t.replay([
    { cls: 'mail', text: '→ zapamietani', own: true },
    { cls: 'mail', text: '> ' },
  ]);
  assert.deepEqual(await op, [], 'brak osob = pula pusta');
});
