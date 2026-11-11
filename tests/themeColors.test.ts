/** Algorytm kolorow motywu: parsowanie computed CSS i wybor on-accent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compositeOver,
  contrastRatio,
  onAccentColor,
  parseCssColor,
  type Rgba,
} from '../src/arkmail/ui/themeColors';

function color(value: string): Rgba {
  const parsed = parseCssColor(value);
  assert.ok(parsed, `parsowanie: ${value}`);
  return parsed;
}

function close(actual: number, expected: number, epsilon = 0.0001): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function hsl(h: number, s: number, l: number): Rgba {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const part = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: part[0]! + m, g: part[1]! + m, b: part[2]! + m, a: 1 };
}

test('kolory: rgb i rgba w skladni przecinkowej oraz spacjowej', () => {
  const a = color('rgb(12, 34, 56)');
  assert.deepEqual(a, { r: 12 / 255, g: 34 / 255, b: 56 / 255, a: 1 });
  const b = color('rgba(12, 34, 56, 0.25)');
  close(b.a, 0.25);
  const c = color('rgb(10% 20% 30% / 40%)');
  close(c.r, 0.1);
  close(c.g, 0.2);
  close(c.b, 0.3);
  close(c.a, 0.4);
});

test('kolory: color(srgb) i oklab z computed styles', () => {
  const srgb = color('color(srgb 0.1 0.2 0.3 / 0.4)');
  close(srgb.r, 0.1);
  close(srgb.g, 0.2);
  close(srgb.b, 0.3);
  close(srgb.a, 0.4);
  assert.deepEqual(color('oklab(0 0 0)'), { r: 0, g: 0, b: 0, a: 1 });
  const white = color('oklab(100% 0 0 / 50%)');
  close(white.r, 1);
  close(white.g, 1);
  close(white.b, 1);
  close(white.a, 0.5);
  const red = color('oklab(0.627955 0.224863 0.125846)');
  close(red.r, 1, 0.001);
  close(red.g, 0, 0.001);
  close(red.b, 0, 0.001);
});

test('kolory: nieprawidlowe wartosci sa odrzucane bez zgadywania', () => {
  for (const value of ['', 'transparent', 'var(--popup-accent)', 'rgb(a b c)', 'oklab(a b c)']) {
    assert.equal(parseCssColor(value), null, value || 'pusty');
  }
});

test('kolory: alfa jest skladana na rzeczywistym tle przed pomiarem', () => {
  const background = color('rgb(0 0 0)');
  const accent = compositeOver(color('rgba(255, 255, 255, 0.5)'), background);
  close(accent.r, 0.5);
  close(accent.a, 1);
  close(contrastRatio(accent, background), 5.280823, 0.0001);
  close(contrastRatio(color('rgb(255 255 255)'), color('rgb(0 0 0)')), 21);
});

test('kolory: on-accent jest nieprzezroczysta czernia albo biela', () => {
  assert.equal(onAccentColor('rgb(255 215 0)', 'rgb(20 20 20)'), 'rgb(0, 0, 0)');
  assert.equal(onAccentColor('rgb(30 30 120)', 'rgb(240 240 240)'), 'rgb(255, 255, 255)');
  assert.equal(onAccentColor('nieznany', 'rgb(20 20 20)'), null);
});

test('kolory: wszystkie 14400 kombinacji motywu wlasnego maja co najmniej 4.5:1', () => {
  const ground = color('rgb(24 24 24)');
  let minimum = Number.POSITIVE_INFINITY;
  let checked = 0;
  for (let h = 0; h < 360; h++) {
    for (let s = 0; s < 40; s++) {
      const accent = hsl(h, s, 60);
      const selected = onAccentColor(
        `rgb(${Math.round(accent.r * 255)} ${Math.round(accent.g * 255)} ${Math.round(accent.b * 255)})`,
        'rgb(24 24 24)',
      );
      assert.ok(selected, `H=${h} S=${s}`);
      const foreground = color(selected);
      const ratio = contrastRatio(accent, compositeOver(foreground, ground));
      minimum = Math.min(minimum, ratio);
      assert.ok(ratio >= 4.5, `H=${h} S=${s}: ${ratio}`);
      checked++;
    }
  }
  assert.equal(checked, 14400);
  assert.ok(minimum >= 4.5);
});
