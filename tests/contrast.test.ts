/**
 * Kontrasty po migracji na natywne UI klienta (zgloszenie 2026-11-05,
 * A3). Kolory pluginu mieszkaja w zmiennych var(--popup-...), wiec
 * kontrast tekstu i elementow graficznych pilnuje motyw klienta
 * (dokumentacja: PLUGINS.md, sekcja "Wyglad Interfejsu (UI)").
 * Guard pilnuje regresji: zero hex w STYLES oraz mapowanie rol kolorow
 * na zmienne (wypelnienie akcentu, hover danger, wyroznienia).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STYLES } from '../src/arkmail/ui/styles';

function ruleBody(selector: string): string {
  const m = STYLES.match(new RegExp(`\\.arkmail-${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `regula .arkmail-${selector} istnieje`);
  return m[1]!;
}

function hoverBody(selector: string): string {
  const m = STYLES.match(new RegExp(`\\.arkmail-${selector}:hover\\s*\\{([^}]*)\\}`));
  assert.ok(m, `regula .arkmail-${selector}:hover istnieje`);
  return m[1]!;
}

test('style: zero hex w arkuszu (kolory tylko ze zmiennych klienta)', () => {
  assert.doesNotMatch(STYLES, /#[0-9a-fA-F]{3,8}\b/, 'zero literalow hex');
  assert.doesNotMatch(STYLES, /\brgba?\(/, 'zero rgba()');
  assert.doesNotMatch(
    STYLES,
    /(?:background|color|border-color|outline|box-shadow):\s*(?:white|black)\b/,
    'white/black jako kolory zakazane',
  );
});

test('style: przycisk Wyslij bez wlasnych kolorow (solid z arkusza klienta)', () => {
  // Zgloszenie 2026-11-05 (F4b): wysylka to popup-btn--solid; kolory i
  // kontrast pilnuje motyw klienta, regula .arkmail-send ma tylko uklad.
  const b = ruleBody('send');
  assert.doesNotMatch(b, /background:/, 'wysylka: zero wlasnego tla');
  assert.doesNotMatch(b, /(?:border|color):/, 'wysylka: zero wlasnych kolorow');
  assert.match(b, /font-weight:\s*600/, 'wysylka: pogrubienie etykiety zostaje');
});

// Hovery klawiszy (send, action, danger, del) obsluguje arkusz klienta
// Dargoth dla klas popup-btn--*; plugin nie definiuje wlasnych regul hover
// dla natywnych klawiszy (zgloszenie 2026-11-05, F4b).

test('style: nieprzeczytany wiersz ma bezpieczny pasek z lewej', () => {
  const b = ruleBody('unread');
  assert.match(b, /box-shadow:\s*inset[^;]*var\(--arkmail-unread-marker\)/, 'pasek nieprzeczytania z lewej');
});

test('style: kropka nieprzeczytania ma lokalny znacznik kontrastu', () => {
  const m = STYLES.match(/\.arkmail-unread::before\s*\{([^}]*)\}/);
  assert.ok(m, 'regula .arkmail-unread::before istnieje');
  assert.match(m![1]!, /background:\s*var\(--arkmail-unread-marker\)/, 'kropka nieprzeczytania');
});

// Aktywna zakladka: klasy dialog-tabs/dialog-tab/is-active z arkusza
// klienta (zgloszenie 2026-11-05 F4c); zero wlasnych regul zakladek.
// Kontrakt DOM: tests/nativeUi.test.ts.

test('style: zero wlasnych regul kolorow zakladek', () => {
  assert.doesNotMatch(STYLES, /\.arkmail-tab\s*\{[^}]*background:/, 'zakladki bez wlasnego tla');
  assert.doesNotMatch(STYLES, /\.arkmail-tab-active/, 'zero regul klasy tab-active');
  assert.doesNotMatch(STYLES, /\.arkmail-tabs\s*\{/, 'belka zakladek z arkusza klienta');
});

test('style: aktywna skrzynka na wypelnieniu akcentu', () => {
  const b = ruleBody('box-active');
  assert.match(b, /background:\s*var\(--arkmail-accent\)/, 'tlo akcentu');
  assert.match(b, /border-color:\s*var\(--arkmail-accent\)/, 'obwodka akcentu');
  const h = hoverBody('box-active');
  assert.match(h, /background:\s*var\(--arkmail-accent\)/, 'hover akcentu');
});

test('style: pulsowanie flash w kolorze akcentu', () => {
  const m = STYLES.match(/@keyframes arkmailFlash[\s\S]*?50%\s*\{([^}]*)\}/);
  assert.ok(m, 'klatka 50% keyframes arkmailFlash istnieje');
  assert.match(m![1]!, /background:\s*var\(--arkmail-accent\)/, 'klatka 50% akcent');
});

test('style: tekst na wypelnieniu akcentu nigdy w kolorze akcentu', () => {
  // Na wypelnieniu akcentu tekst ma byc w kolorze tla okna
  // (konwencja klienta: .popup-btn--solid), nigdy akcent-na-akcent.
  const blocks = STYLES.match(/\{[^{}]*\}/g) ?? [];
  assert.ok(blocks.length > 50, 'arkusz ma zestaw regul');
  for (const block of blocks) {
    if (/background:\s*var\(--arkmail-accent\)/.test(block)) {
      assert.doesNotMatch(
        block,
        /(^|[\s;{])color:\s*var\(--arkmail-accent\)/,
        `tekst akcentowy na tle akcentu: ${block.trim().slice(0, 120)}`,
      );
    }
  }
});
