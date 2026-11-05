/**
 * Wydanie 1.30.2 (Etap 4): martwy CSS i aliasy kolorow.
 * Regresja B: po audycie usunieto selektory bez uzycia w DOM
 * (.arkmail-arch-expand, .arkmail-arch-occ, .arkmail-listy >
 * .arkmail-book-filter) oraz aliasy kolorow (ACCENT_SOFT, ACCENT_DEEP,
 * ACCENT_BRIGHT, HOVER_RESET - wszystkie prowadzily do tej samej
 * zmiennej, cztery nazwy na jedna wartosc mylily w utrzymaniu).
 * Kontrakt twardy: ani STYLES, ani zrodlo styles.ts nie zawieraja
 * wymienionych ciagow (dowolny powrot = czerwony).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STYLES } from '../src/arkmail/ui/styles';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'src', 'arkmail', 'ui', 'styles.ts'),
  'utf-8',
);

const DEAD_SELECTORS = ['.arkmail-arch-expand', '.arkmail-arch-occ'];
const DEAD_SNIPPETS = ['.arkmail-listy > .arkmail-book-filter'];
const DEAD_ALIASES = ['ACCENT_SOFT', 'ACCENT_DEEP', 'ACCENT_BRIGHT', 'HOVER_RESET'];

test('styles: martwe selektory archiwum usuniete', () => {
  for (const sel of DEAD_SELECTORS) {
    assert.ok(!STYLES.includes(sel), `STYLES zawiera martwy selektor: ${sel}`);
    assert.ok(!SRC.includes(sel), `styles.ts zawiera martwy selektor: ${sel}`);
  }
  for (const snip of DEAD_SNIPPETS) {
    assert.ok(!STYLES.includes(snip), `STYLES zawiera martwy fragment: ${snip}`);
    assert.ok(!SRC.includes(snip), `styles.ts zawiera martwy fragment: ${snip}`);
  }
});

test('styles: aliasy kolorow zwiniete na bezposrednie var()', () => {
  for (const alias of DEAD_ALIASES) {
    assert.ok(!SRC.includes(alias), `styles.ts zawiera alias: ${alias}`);
    assert.ok(!STYLES.includes(alias), `STYLES zawiera alias: ${alias}`);
  }
});

test('styles: kolory nadal wylacznie ze zmiennych popup (zero hex)', () => {
  // Kontrola, ze porzadki nie wprowadzily twardych kolorow.
  assert.ok(!/\b#[0-9a-fA-F]{3,8}\b/.test(STYLES), 'STYLES: znalazl sie twardy hex');
});
