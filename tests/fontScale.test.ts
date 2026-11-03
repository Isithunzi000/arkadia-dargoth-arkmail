/**
 * Fala UI-1 krok 3: skalowanie czcionki zgodnie z ustawieniami okna.
 * Kontrakt klienta (docs/PLUGINS.md z Delwing): plugin nie ustawia
 * wlasnej czcionki bazowej na roocie, tylko skaluje wszystkie dlugosci
 * przez var(--window-font-scale, 1), a tresci listow (cialo listu,
 * podglad compose) dodatkowo przechodza na var(--output-font-family)
 * i var(--output-font-size) - gracz ustawia je w opcjach okna.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STYLES } from '../src/arkmail/ui/styles';

/** Zwraca cialo pierwszej reguly pasujacej do selektora (regex). */
function ruleBody(selectorRe: RegExp): string | null {
  const m = STYLES.match(new RegExp(`${selectorRe.source}[^{]*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

test('style: root nie ustawia wlasnej czcionki ani rozmiaru (dziedziczy z okna)', () => {
  const body = ruleBody(/\.arkmail-root\s*/);
  assert.ok(body, 'regula .arkmail-root istnieje');
  assert.doesNotMatch(body!, /font-family:/, 'root bez font-family - czcionka z ustawien okna');
  assert.doesNotMatch(body!, /font-size:/, 'root bez font-size - rozmiar z ustawien okna');
});

test('style: kazda dlugosc px skaluje sie przez --window-font-scale', () => {
  // Bez komentarzy (tam piksele to opis, nie kod). Usuwamy poprawne
  // opakowania calc(Npx * var(--window-font-scale, 1)) i sprawdzamy,
  // czy zostal surowy piksel gdziekolwiek.
  const code = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
  const stripped = code.replace(/calc\(\d+px \* var\(--window-font-scale, 1\)\)/g, '');
  const raw = stripped.match(/\d+px\b/g) ?? [];
  assert.deepEqual(raw, [], `surowe piksele poza calc(): ${raw.join(', ')}`);
});

test('style: cialo listu uzywa czcionki wyjscia okna', () => {
  const body = ruleBody(/\.arkmail-letter-body\s*/);
  assert.ok(body, 'regula .arkmail-letter-body istnieje');
  assert.match(body!, /font-family:\s*var\(--output-font-family/, 'rodzina czcionek z ustawien okna');
  assert.match(body!, /font-size:\s*var\(--output-font-size/, 'rozmiar czcionki z ustawien okna');
});

test('style: podglad compose uzywa czcionki wyjscia okna', () => {
  const body = ruleBody(/\.arkmail-preview\s*/);
  assert.ok(body, 'regula .arkmail-preview istnieje');
  assert.match(body!, /font-family:\s*var\(--output-font-family/, 'rodzina czcionek z ustawien okna');
  assert.match(body!, /font-size:\s*var\(--output-font-size/, 'rozmiar czcionki z ustawien okna');
});

test('style: wysokosci kontrolek formularza skaluja sie ze skala okna', () => {
  // Regula wspolna pol wpisu: wysokosci sa opakowane w calc ze skala
  // okna, wiec kontrolka rosnie z czcionka zamiast ucinac tekst.
  const body = ruleBody(/\.arkmail-root\s+input,\s*\.arkmail-root\s+textarea,\s*\.arkmail-root\s+select\s*/);
  assert.ok(body, 'regula wspolna pol formularza istnieje');
  const heights = body!.match(/(?:min-|max-)?height:\s*([^;]+);/g) ?? [];
  for (const h of heights) {
    assert.match(
      h,
      /calc\(\d+px \* var\(--window-font-scale, 1\)\)/,
      `wysokosc skalowana: ${h.trim()}`,
    );
  }
});
