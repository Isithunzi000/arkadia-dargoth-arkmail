/**
 * Port renderera listow (MIT, klient Arkadii) - goldeny wygenerowane
 * referencyjna implementacja (letterRenderer.ts) i zaszyte jako literaly.
 * Port musi byc bajtowo zgodny, bo ramka/justowanie staja sie trescia
 * listu wysylanego do gry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_LETTER_LAYOUTS,
  clampLineWidth,
  expandFillLine,
  getLayoutBodyWidth,
  renderLetter,
  splitBodyPattern,
} from '../src/arkmail/core/letterRender';

test('renderer: clamp szerokosci 20..120 z zaokragleniem', () => {
  assert.deepEqual(
    [clampLineWidth(10), clampLineWidth(60), clampLineWidth(999), clampLineWidth(45.6)],
    [20, 60, 120, 46],
  );
});

test('renderer: wypelnienie {...} do szerokosci body', () => {
  assert.equal(expandFillLine(' +--{-}--+ ', 10), ' +--------------+ ');
  assert.equal(expandFillLine(' |  { }  | ', 12), ' |                | ');
});

test('renderer: szerokosc body = total - prefix - suffix', () => {
  assert.equal(getLayoutBodyWidth(BUILTIN_LETTER_LAYOUTS.plain, 60), 52);
});

test('renderer: splitBodyPattern odcina puste ogony', () => {
  assert.deepEqual(splitBodyPattern(' a\n b\n\n'), [' a', ' b']);
});

test('renderer: ramka plain, szerokosc 30, justowanie', () => {
  const r = renderLetter('Witaj w Arkadii. Drugie zdanie tez.', 'plain', 30);
  assert.deepEqual(r.lines, [
    ' +--------------------------+ ',
    ' |                          | ',
    ' |                          | ',
    ' |  Witaj    w    Arkadii.  | ',
    ' |  Drugie zdanie tez.      | ',
    ' |                          | ',
    ' |                          | ',
    ' +--------------------------+ ',
  ]);
  assert.equal(r.hasContent, true);
});

test('renderer: "> " wyrownuje w prawo, pusta linia zachowana', () => {
  const r = renderLetter(
    '> Podpis autora listu\n\nNormalny akapit z dluzszym tekstem, ktory musi sie zawinac.',
    'none',
    24,
  );
  assert.deepEqual(r.lines, [
    '     Podpis autora listu',
    '',
    'Normalny     akapit    z',
    'dluzszym  tekstem, ktory',
    'musi sie zawinac.',
  ]);
});

test('renderer: justowanie - ostatnia linia bez rozciagania', () => {
  const r = renderLetter('aaaa bbbb cccc dddd eeee', 'none', 14);
  assert.deepEqual(r.lines, ['aaaa bbbb cccc', 'dddd eeee']);
});

test('renderer: slowo dluzsze niz szerokosc jest ciete na kawalki', () => {
  const r = renderLetter('bardzodlugieslowobezspacjiijescze wiecej', 'none', 10);
  assert.deepEqual(r.lines, ['bardzodlug', 'ieslowobez', 'spacjiijes', 'cze wiecej']);
});

test('renderer: raw zachowuje biale znaki bez zawijania', () => {
  const r = renderLetter('  zachowaj   moje \n   biale  znaki ', 'raw', 10);
  assert.deepEqual(r.lines, ['  zachowaj   moje ', '   biale  znaki ']);
});

test('renderer: pergamin, szerokosc 40', () => {
  const r = renderLetter('Pergaminowa tresc listu.', 'parchment', 40);
  assert.deepEqual(r.lines, [
    '  ____________________________________  ',
    '/ \\                                   \\.',
    '|  |                                  |.',
    '\\_ |                                  |.',
    '   |                                  |.',
    '   |   Pergaminowa tresc listu.       |.',
    '   |                                  |.   ',
    '   |   _______________________________|___ ',
    '   |  /                                  /.',
    '   \\_/__________________________________/. ',
  ]);
});

test('renderer: pusta tresc nie ma contentu', () => {
  const r = renderLetter('   \n  ', 'plain', 30);
  assert.equal(r.hasContent, false);
});

test('renderer: surowe biale znaki i sama ramka nie sa trescia', () => {
  const raw = renderLetter('  \t\n   ', 'raw', 30);
  assert.equal(raw.hasContent, false, 'raw liczy tylko znaki niebedace bialymi');
  assert.deepEqual(raw.lines, ['  \t', '   '], 'raw nadal zachowuje wpisane biale znaki');

  const framed = renderLetter('  \n ', 'plain', 30);
  assert.equal(framed.hasContent, false, 'wygenerowana ramka nie jest trescia');
  assert.ok(framed.lines.length > 0, 'podglad ramki nadal moze istniec');
});
