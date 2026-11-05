/**
 * Specyficznosc reguł komponentowych (wydanie 1.30.1, Etap 2) - piny
 * regresji A1-A5: catch-all .arkmail-root button:not(.popup-btn):not(.dialog-tab)
 * ma sile (0,2,1), wiec reguły komponentowe w postaci .arkmail-root .arkmail-x
 * (0,2,0) przegrywaja i komponenty traca wyglad. Kontrakt: kazda regula
 * klawisza-komponentu ma postac .arkmail-root button.<klasa>. Happy-dom nie
 * liczy styli - skutecznosc dobieramy po postaci selektora i ciele reguly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STYLES } from '../src/arkmail/ui/styles';

/** Zwraca cialo pierwszej reguly pasujacej do selektora (regex). */
function ruleBody(selectorRe: RegExp): string | null {
  const m = STYLES.match(new RegExp(`${selectorRe.source}[^{]*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

test('specyficznosc: rodzina skrzynek (box) w postaci button.<klasa>', () => {
  // A1/A2/A3: ksztalt pigulki, wypelnienie aktywnej, obwodka uwagi.
  const base = ruleBody(/\.arkmail-root\s+button\.arkmail-box(?![\w-])/);
  assert.ok(base, 'regula button.arkmail-box istnieje');
  assert.match(base!, /border-radius/, 'pigulka ma zaokraglenie');
  const hover = ruleBody(/\.arkmail-root\s+button\.arkmail-box:hover/);
  assert.ok(hover, 'regula hover istnieje');
  const active = ruleBody(/\.arkmail-root\s+button\.arkmail-box-active/);
  assert.ok(active, 'regula aktywnej istnieje');
  assert.match(active!, /font-weight:\s*600/, 'aktywna wyrozniona');
  const attention = ruleBody(/\.arkmail-root\s+button\.arkmail-box-attention/);
  assert.ok(attention, 'regula uwagi istnieje');
  assert.match(attention!, /border-color/, 'uwaga ma obwodke akcentu');
});

test('specyficznosc: mini rodzina w postaci button.<klasa>', () => {
  // A4: kompaktowe klawisze pomocnicze nie rosna do rozmiaru catch-all.
  for (const cls of ['arkmail-contact-dir', 'arkmail-contact-addbook']) {
    const body = ruleBody(new RegExp(`\\.arkmail-root\\s+button\\.${cls}(?![\\w-])`));
    assert.ok(body, `regula button.${cls} istnieje`);
    assert.match(
      body!,
      /font-size:\s*calc\(11px \* var\(--window-font-scale, 1\)\)/,
      `${cls} ma kompaktowa czcionke 11px skalowana`,
    );
    const hover = ruleBody(new RegExp(`\\.arkmail-root\\s+button\\.${cls}:hover`));
    assert.ok(hover, `regula hover ${cls} istnieje`);
  }
});

test('specyficznosc: search-clear w postaci button.<klasa>', () => {
  // A5: padding kompaktowy przegrywal z catch-allem.
  const body = ruleBody(/\.arkmail-root\s+button\.arkmail-search-clear/);
  assert.ok(body, 'regula button.arkmail-search-clear istnieje');
  assert.match(body!, /padding:/, 'search-clear ma wlasny padding');
});

test('specyficznosc: textarea compose chroniona min-wysokoscia', () => {
  // B1: textarea klienta (textarea.popup-input.popup-input--control, 0,2,1,
  // height: auto; min-height: var(--ui-ctrl)) zaglusza regule pluginu
  // .arkmail-form textarea (0,1,1) - pole zapada sie w compose. Regula
  // pluginu musi miec sile (0,2,1) i skalowana min-wysokosc 120px.
  const body = ruleBody(/\.arkmail-root\s+\.arkmail-form\s+textarea(?![\w-])/);
  assert.ok(body, 'regula .arkmail-root .arkmail-form textarea istnieje');
  assert.match(
    body!,
    /min-height:\s*calc\(120px \* var\(--window-font-scale, 1\)\)/,
    'min-wysokosc 120px skalowana',
  );
});

test('specyficznosc: ghost dzieli font-size z polem klienta', () => {
  // B2: ghost bez wlasnego font-size dziedziczyl 13px z panelu, a pole
  // klienta ma var(--ui-input-fs, 14px) - podpowiedz przesuwala sie
  // wzgledem kursora.
  const body = ruleBody(/\.arkmail-root\s+\.arkmail-ghost(?![\w-])/);
  assert.ok(body, 'regula .arkmail-ghost istnieje');
  assert.match(body!, /font-size:\s*var\(--ui-input-fs, 14px\)/, 'font-size ze zmiennej klienta');
});

test('higiena: martwe stale i martwa regula usuniete', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'src', 'arkmail', 'ui', 'styles.ts'),
    'utf-8',
  );
  assert.ok(!src.includes('ACCENT_DEEPER'), 'stala ACCENT_DEEPER usunieta');
  assert.ok(!/const DANGER =/.test(src), 'stala DANGER usunieta (DANGER_TEXT zostaje)');
  assert.doesNotMatch(STYLES, /\.arkmail-older-row/, 'martwa regula .arkmail-older-row usunieta');
});
