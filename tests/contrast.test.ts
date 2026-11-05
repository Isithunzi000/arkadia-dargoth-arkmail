/**
 * Kontrasty wydania 1.29.0 (K1): bialy tekst schodzi z ACCENT na
 * glebsze tony, wyroznienia nieprzeczytanych na ACCENT_BRIGHT.
 *
 * Zrodlo: docs/PLAN-1.29.0.md, fala F1. Wartosci kontrastu liczone
 * luminancja wzgledna WCAG; minimum tekst 4.5, elementy graficzne 3.0.
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

test('style: przycisk Wyslij ma glebokie tlo (bialy 5.74)', () => {
  const b = ruleBody('send');
  assert.match(b, /background:\s*#3a63b8\b/, 'tlo ACCENT_DEEP');
  assert.match(b, /border-color:\s*#3a63b8\b/, 'obwodka ACCENT_DEEP');
});

test('style: hover Wyslij robi sie jeszcze glebszy (bialy 7.87)', () => {
  const b = hoverBody('send');
  assert.match(b, /background:\s*#2f4f94\b/, 'hover ACCENT_DEEPER');
  assert.match(b, /border-color:\s*#2f4f94\b/, 'obwodka hover ACCENT_DEEPER');
});

test('style: hover usuwania ma bezpieczny czerwony (bialy 4.89)', () => {
  const b = hoverBody('btn-danger');
  assert.match(b, /background:\s*#c04a40\b/, 'hover danger #c04a40');
  assert.match(b, /border-color:\s*#c04a40\b/, 'obwodka hover danger #c04a40');
});

test('style: hover klawisza kasowania listu symetryczny z btn-danger', () => {
  const b = hoverBody('del');
  assert.match(b, /background:\s*#c04a40\b/, 'hover #c04a40');
  assert.match(b, /border-color:\s*#c04a40\b/, 'obwodka hover #c04a40');
});

test('style: hover akcji bialy tekst na ciemnym tle (8.85)', () => {
  const b = hoverBody('btn-action');
  assert.match(b, /color:\s*#ffffff\b/, 'bialy tekst');
  assert.match(b, /border-color:\s*#7ea2ee\b/, 'obwodka ACCENT_SOFT (3.49)');
  assert.match(b, /background:\s*#454a58\b/, 'tlo HOVER_BASE');
});

test('style: nieprzeczytany wiersz ma jasny pasek ACCENT_BRIGHT (3.79)', () => {
  const b = ruleBody('unread');
  assert.match(b, /box-shadow:\s*inset[^;]*#6b93ea\b/, 'pasek ACCENT_BRIGHT z lewej');
});

test('style: kropka nieprzeczytania to ACCENT_BRIGHT (3.79)', () => {
  const m = STYLES.match(/\.arkmail-unread::before\s*\{([^}]*)\}/);
  assert.ok(m, 'regula .arkmail-unread::before istnieje');
  assert.match(m![1]!, /background:\s*#6b93ea\b/, 'kropka ACCENT_BRIGHT');
});

test('style: aktywna zakladka glebokie tlo (bialy 5.74)', () => {
  const b = ruleBody('tab-active');
  assert.match(b, /background:\s*#3a63b8\b/, 'tlo ACCENT_DEEP');
  assert.match(b, /border-color:\s*#3a63b8\b/, 'obwodka ACCENT_DEEP');
  const h = hoverBody('tab-active');
  assert.match(h, /background:\s*#3a63b8\b/, 'hover ACCENT_DEEP');
});

test('style: aktywna skrzynka glebokie tlo (bialy 5.74)', () => {
  const b = ruleBody('box-active');
  assert.match(b, /background:\s*#3a63b8\b/, 'tlo ACCENT_DEEP');
  assert.match(b, /border-color:\s*#3a63b8\b/, 'obwodka ACCENT_DEEP');
  const h = hoverBody('box-active');
  assert.match(h, /background:\s*#3a63b8\b/, 'hover ACCENT_DEEP');
});

test('style: pulsowanie flash ma glebokie tlo (bialy 5.74)', () => {
  const m = STYLES.match(/@keyframes arkmailFlash[\s\S]*?50%\s*\{([^}]*)\}/);
  assert.ok(m, 'klatka 50% keyframes arkmailFlash istnieje');
  assert.match(m![1]!, /background:\s*#3a63b8\b/, 'klatka 50% ACCENT_DEEP');
});

test('style: zaden jasny tekst nie siedzi na ACCENT #4a7de0', () => {
  // kazdy blok z bialym tekstem ma tlo glebsze niz ACCENT (min. AA)
  const blocks = STYLES.match(/\{[^{}]*\}/g) ?? [];
  assert.ok(blocks.length > 50, 'arkusz ma zestaw regul');
  for (const block of blocks) {
    if (/color:\s*#ffffff\b/.test(block)) {
      assert.doesNotMatch(
        block,
        /background:\s*#4a7de0\b/,
        `bialy tekst na ACCENT: ${block.trim().slice(0, 120)}`,
      );
    }
  }
});
