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
