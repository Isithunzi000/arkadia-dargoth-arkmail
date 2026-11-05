/**
 * Kontrakt flex na kolumny wysokosciowe (wydanie 1.30.1, Etap 1) -
 * piny regresji na zgloszenia 2/3 (zgloszenie 2026-11-05): klient
 * Dargoth daje natywnym kontrolkom .popup-btn--control i
 * .popup-input--control min-height: 0, wiec jako bezposrednie dzieci
 * kolumny flex o ograniczonej wysokosci (panel Ksiazki po imporcie,
 * compose w trybie wide) kurcza sie do zera i nakladaja sie etykiety.
 * Kontrakt: dzieci-naglowki kolumny maja twarde flex: none; caly
 * skurcz idzie w kontener scrollujacy (ma min-height: 0).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STYLES } from '../src/arkmail/ui/styles';

/** Zwraca cialo pierwszej reguly pasujacej do selektora (regex). */
function ruleBody(selectorRe: RegExp): string | null {
  const m = STYLES.match(new RegExp(`${selectorRe.source}[^{]*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

test('flex: kolumna Listy/Ksiazki nie kurczy bezposrednich klawiszy', () => {
  // Zgloszenia 2/3: cztery klawisze zbiorcze Ksiazki (doklejane
  // bezposrednio do panelu) maja twarde flex: none.
  const body = ruleBody(/\.arkmail-listy\s*>\s*button\b/);
  assert.ok(body, 'istnieje regula .arkmail-listy > button');
  assert.match(body!, /flex:\s*none/, 'klawisze dzieci kolumny maja flex: none');
});

test('flex: dywizy-naglowki kolumny maja twarde flex: none', () => {
  // Naglowek (skrzynki, operacje, szukajka) stoi na stale; dzis chroni
  // je domyslne min-height: auto, kontrakt ma byc jawnie twardy.
  // 1.30.2 (Etap 4): filtr ksiazki mieszka wewnatrz .arkmail-list-scroll
  // (bezpieczny div), selektor bezposredniego dziecka byl martwy.
  for (const cls of ['arkmail-boxes', 'arkmail-search-row']) {
    const body = ruleBody(new RegExp(`\\.arkmail-listy\\s*>\\s*\\.${cls}\\b`));
    assert.ok(body, `istnieje regula .arkmail-listy > .${cls}`);
    assert.match(body!, /flex:\s*none/, `.${cls} ma flex: none`);
  }
});

test('flex: compose trybu wide nie kurc pol i klawiszy', () => {
  // Ta sama klasa hazardu w .arkmail-split-compose .arkmail-pane:
  // pola klienta (min-height: 0) jako dzieci kolumny moga zniknac
  // zamiast puscic scroll.
  for (const tag of ['input', 'textarea', 'select', 'button']) {
    const body = ruleBody(
      new RegExp(`\\.arkmail-split-compose\\s+\\.arkmail-pane\\s*>\\s*${tag}\\b`),
    );
    assert.ok(body, `istnieje regula dla > ${tag} w compose`);
    assert.match(body!, /flex:\s*none/, `${tag} w compose ma flex: none`);
  }
});
