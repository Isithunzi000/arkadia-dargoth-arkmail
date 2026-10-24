/**
 * Style ArkMail (Fala 7c) - piny regresji na bug "bialy przycisk,
 * niewidoczna czcionka" z sesji testowej 2026-10-17. Klient Dargoth
 * ma ciemny motyw (tlo rgb(36,36,36), tekst rgb(238,238,236)); stare
 * style z 'background: transparent' + 'color: inherit' renderowaly
 * kontrolki bialo-na-bialym. Kontrakt: kazdy element interaktywny
 * ma JAWNE kolory (hex), slowa 'transparent'/'inherit' przy kolorach
 * sa zakazane.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STYLES } from '../src/arkmail/ui/styles';

const HEX = '#[0-9a-fA-F]{3,8}\\b';

/** Zwraca cialo pierwszej reguly pasujacej do selektora (regex). */
function ruleBody(selectorRe: RegExp): string | null {
  const m = STYLES.match(new RegExp(`${selectorRe.source}[^{]*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

test('style: root ma jawne tlo i kolor tekstu (naprawia bialy-na-bialym)', () => {
  const body = ruleBody(/\.arkmail-root\s*/);
  assert.ok(body, 'regula .arkmail-root istnieje');
  assert.match(body!, new RegExp(`background:\\s*${HEX}`), 'jawne tlo roota');
  assert.match(body!, new RegExp(`color:\\s*${HEX}`), 'jawny kolor tekstu roota');
});

test('style: wszystkie przyciski maja jawne tlo i kolor (catch-all)', () => {
  const body = ruleBody(/\.arkmail-root\s+button\b/);
  assert.ok(body, 'istnieje catch-all .arkmail-root button');
  assert.match(body!, new RegExp(`background:\\s*${HEX}`), 'jawne tlo przyciskow');
  assert.match(body!, new RegExp(`color:\\s*${HEX}`), 'jawny kolor przyciskow');
});

test('style: pola formularzy maja jawne tlo i kolor', () => {
  for (const el of ['input', 'textarea', 'select']) {
    const body = ruleBody(new RegExp(`\\.arkmail-root\\s+${el}\\b`));
    assert.ok(body, `istnieje regula .arkmail-root ${el}`);
    assert.match(body!, new RegExp(`background:\\s*${HEX}`), `jawne tlo ${el}`);
    assert.match(body!, new RegExp(`color:\\s*${HEX}`), `jawny kolor ${el}`);
  }
});

test('style: ostylowane klasy dotychczas gole (preview/ops/del/fwd/notify)', () => {
  for (const cls of [
    'arkmail-preview',
    'arkmail-letter-ops',
    'arkmail-del',
    'arkmail-fwd',
    'arkmail-notify-toggle',
  ]) {
    assert.ok(
      new RegExp(`\\.${cls}\\b[^{]*\\{`).test(STYLES),
      `brak reguly dla .${cls}`,
    );
  }
});

test('style: zakaz przezroczystego tla i dziedziczenia koloru', () => {
  assert.ok(!/background:\s*transparent/.test(STYLES), 'bez background: transparent');
  assert.ok(!/color:\s*inherit/.test(STYLES), 'bez color: inherit');
});

// Fala 11a: szukajka w wersji stosowej - 2 kolumny zamiast 5 w linii;
// w waskiej kolumnie splitu pola tekstowe maja sensowna szerokosc.
test('style: szukajka uklada sie stosowo, Szukaj na calej szerokosci', () => {
  const row = ruleBody(/\.arkmail-search-row\s/);
  assert.ok(row, 'regula .arkmail-search-row istnieje');
  assert.match(row!, /grid-template-columns:\s*1fr\s+1fr/, 'dwie kolumny (osoba|temat, od|do)');
  const go = ruleBody(/\.arkmail-search-row\s+\.arkmail-search-go\b/);
  assert.ok(go, 'regula przycisku Szukaj w szukajce');
  assert.match(go!, /grid-column:\s*1\s*\/\s*-1/, 'Szukaj rozpiety na caly wiersz');
});

test('style: przyciski nie lamia etykiet (nowrap w catch-all)', () => {
  const body = ruleBody(/\.arkmail-root\s+button\b/);
  assert.ok(body, 'regula catch-all button istnieje');
  assert.match(body!, /white-space:\s*nowrap/, 'przyciski maja white-space: nowrap');
});

test('style: pasek operacji zawija caly tekst bez ucinania', () => {
  const body = ruleBody(/\.arkmail-busy\b/);
  assert.ok(body, 'regula .arkmail-busy istnieje');
  assert.match(body!, /font-size:\s*12px/, 'czcionka 12px');
  assert.match(body!, /white-space:\s*normal/, 'tekst moze przejsc do kolejnej linii');
  assert.match(body!, /overflow-wrap:\s*anywhere/, 'dlugi fragment nie wyjdzie poza pasek');
  assert.doesNotMatch(body!, /text-overflow:\s*ellipsis/, 'status nie jest ucinany');
});

test('style: operacje skrzynki i listu zawijaja sie, pole przekazania jest elastyczne', () => {
  for (const selector of [/\.arkmail-box-ops\s*/, /\.arkmail-letter-ops\s*/]) {
    const body = ruleBody(selector);
    assert.ok(body, 'regula operacji istnieje');
    assert.match(body!, /flex-wrap:\s*wrap/, 'operacje przechodza do kolejnego rzedu');
  }
  const forward = ruleBody(/\.arkmail-root\s+\.arkmail-letter-ops\s+\.arkmail-ghost-wrap\s*/);
  assert.ok(forward, 'regula pola przekazania istnieje');
  assert.match(forward!, /flex:\s*1\s+1\s+\d+px/, 'pole ma elastyczna podstawe szerokosci');
  assert.match(forward!, /min-width:\s*0/, 'pole moze zmniejszyc sie bez przepelnienia');
});

test('style: placeholdery sa czytelne i mniejsze od wpisywanego tekstu', () => {
  const body = ruleBody(/\.arkmail-root\s+input::placeholder\s*,\s*\.arkmail-root\s+textarea::placeholder\s*/);
  assert.ok(body, 'wspolna regula placeholderow istnieje');
  assert.match(body!, /font-size:\s*12px/);
  assert.match(body!, /opacity:\s*1/);
  assert.match(body!, new RegExp(`color:\\s*${HEX}`));
});

// Fala 17e (zgloszenie 2026-10-19/20 pkt 1): przycisk "Wczytaj
// wszystkie" w box-ops byl nizszy niz sasiedzi - regula paginacji
// `.arkmail-root button.arkmail-older-all { margin-top: 8px; width: 100% }`
// (specyficznosc 0,2,1) lapala tez box-ops, a wyzerowanie istnialo tylko
// dla older-row. Catch-all dostaje jednolita wysokosc i centrowanie,
// zeby obwodka nie zalezela od etykiety.
test('style: przyciski spojne wysokoscia; box-ops wolny od margin-top paginacji', () => {
  const all = ruleBody(/\.arkmail-root\s+button\b/);
  assert.ok(all, 'regula catch-all button istnieje');
  assert.match(all!, /display:\s*inline-flex/, 'catch-all: inline-flex');
  assert.match(all!, /align-items:\s*center/, 'pionowe centrowanie etykiety');
  assert.match(all!, /justify-content:\s*center/, 'poziome centrowanie etykiety');
  assert.match(all!, /min-height:\s*26px/, 'jednolita minimalna wysokosc');

  const boxOps = ruleBody(/\.arkmail-box-ops\s+button\.arkmail-older-all\b/);
  assert.ok(boxOps, 'regula box-ops dla Wczytaj-wszystkie istnieje');
  assert.match(boxOps!, /margin-top:\s*0/, 'box-ops bez margin-top paginacji');
  assert.match(boxOps!, /width:\s*auto/, 'box-ops bez width 100%');
});

// Audyt etykiet (Fala 16k): kazda statyczna etykieta w render.ts musi
// byc krotka (<=45 znakow), a stary dlugi format "Przerwij (strona N)"
// jest zakazany - teraz "Przerwij · N" (dynamiczny, poza regexem).
test('style: audyt etykiet - krotkie, bez starego formatu Przerwij', () => {
  // Test leci skompilowany z out-test/tests/ - repo root dwa poziomy wyzej.
  const src = readFileSync(join(__dirname, '..', '..', 'src/arkmail/ui/render.ts'), 'utf8');
  const labels = [...src.matchAll(/textContent = '([^']+)'/g)].map((m) => m[1]);
  assert.ok(labels.length >= 20, `audyt obejmuje etykiety (znaleziono: ${labels.length})`);
  for (const label of labels) {
    assert.ok(label.length <= 45, `etykieta <= 45 znakow (${label.length}): "${label}"`);
  }
  // Format dynamiczny (template literal) - sprawdzany w zrodle.
  assert.ok(!src.includes('Przerwij (strona'), 'stary dlugi format "Przerwij (strona N)" usuniety');
  assert.ok(src.includes('Przerwij · '), 'krotki format "Przerwij · N" w uzyciu');
});
