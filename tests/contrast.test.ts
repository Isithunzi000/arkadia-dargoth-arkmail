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

test('style: przycisk Wyslij na wypelnieniu akcentu', () => {
  const b = ruleBody('send');
  assert.match(b, /background:\s*var\(--popup-accent\)/, 'tlo akcentu');
  assert.match(b, /border-color:\s*var\(--popup-accent\)/, 'obwodka akcentu');
});

test('style: hover Wyslij rozjasnia wypelnienie (filter)', () => {
  const b = hoverBody('send');
  assert.match(b, /background:\s*var\(--popup-accent\)/, 'hover: akcent');
  assert.match(b, /border-color:\s*var\(--popup-accent\)/, 'obwodka hover: akcent');
  assert.match(b, /filter:\s*brightness\(1\.1\)/, 'rozjasnienie hover jak w kliencie');
});

test('style: hover usuwania na danger-hover klienta', () => {
  const b = hoverBody('btn-danger');
  assert.match(b, /background:\s*var\(--popup-danger-hover-bg\)/, 'hover danger-hover-bg');
  assert.match(b, /border-color:\s*var\(--popup-danger-hover-bg\)/, 'obwodka hover danger-hover-bg');
});

test('style: hover klawisza kasowania listu symetryczny z btn-danger', () => {
  const b = hoverBody('del');
  assert.match(b, /background:\s*var\(--popup-danger-hover-bg\)/, 'hover danger-hover-bg');
  assert.match(b, /border-color:\s*var\(--popup-danger-hover-bg\)/, 'obwodka hover danger-hover-bg');
});

test('style: hover akcji - tekst w kolorze tla okna na hover kontrolki', () => {
  const b = hoverBody('btn-action');
  assert.match(b, /color:\s*var\(--popup-bg\)/, 'tekst w kolorze tla okna (konwencja klienta)');
  assert.match(b, /border-color:\s*var\(--popup-accent\)/, 'obwodka akcentu');
  assert.match(b, /background:\s*var\(--popup-control-hover-bg\)/, 'tlo hover kontrolki');
});

test('style: nieprzeczytany wiersz ma pasek akcentowy z lewej', () => {
  const b = ruleBody('unread');
  assert.match(b, /box-shadow:\s*inset[^;]*var\(--popup-accent\)/, 'pasek akcentowy z lewej');
});

test('style: kropka nieprzeczytania w kolorze akcentu', () => {
  const m = STYLES.match(/\.arkmail-unread::before\s*\{([^}]*)\}/);
  assert.ok(m, 'regula .arkmail-unread::before istnieje');
  assert.match(m![1]!, /background:\s*var\(--popup-accent\)/, 'kropka akcentowa');
});

test('style: aktywna zakladka na wypelnieniu akcentu', () => {
  const b = ruleBody('tab-active');
  assert.match(b, /background:\s*var\(--popup-accent\)/, 'tlo akcentu');
  assert.match(b, /border-color:\s*var\(--popup-accent\)/, 'obwodka akcentu');
  const h = hoverBody('tab-active');
  assert.match(h, /background:\s*var\(--popup-accent\)/, 'hover akcentu');
});

test('style: aktywna skrzynka na wypelnieniu akcentu', () => {
  const b = ruleBody('box-active');
  assert.match(b, /background:\s*var\(--popup-accent\)/, 'tlo akcentu');
  assert.match(b, /border-color:\s*var\(--popup-accent\)/, 'obwodka akcentu');
  const h = hoverBody('box-active');
  assert.match(h, /background:\s*var\(--popup-accent\)/, 'hover akcentu');
});

test('style: pulsowanie flash w kolorze akcentu', () => {
  const m = STYLES.match(/@keyframes arkmailFlash[\s\S]*?50%\s*\{([^}]*)\}/);
  assert.ok(m, 'klatka 50% keyframes arkmailFlash istnieje');
  assert.match(m![1]!, /background:\s*var\(--popup-accent\)/, 'klatka 50% akcent');
});

test('style: tekst na wypelnieniu akcentu nigdy w kolorze akcentu', () => {
  // Na wypelnieniu akcentu tekst ma byc w kolorze tla okna
  // (konwencja klienta: .popup-btn--solid), nigdy akcent-na-akcent.
  const blocks = STYLES.match(/\{[^{}]*\}/g) ?? [];
  assert.ok(blocks.length > 50, 'arkusz ma zestaw regul');
  for (const block of blocks) {
    if (/background:\s*var\(--popup-accent\)/.test(block)) {
      assert.doesNotMatch(
        block,
        /(^|[\s;{])color:\s*var\(--popup-accent\)/,
        `tekst akcentowy na tle akcentu: ${block.trim().slice(0, 120)}`,
      );
    }
  }
});
