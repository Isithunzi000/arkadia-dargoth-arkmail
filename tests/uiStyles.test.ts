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

const VAR = 'var\\(\\--popup-[a-z-]+\\)';
const HEX = '#[0-9a-fA-F]{3,8}\\b';

/** Zwraca cialo pierwszej reguly pasujacej do selektora (regex). */
function ruleBody(selectorRe: RegExp): string | null {
  const m = STYLES.match(new RegExp(`${selectorRe.source}[^{]*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

test('style: root ma jawne tlo i kolor tekstu ze zmiennych klienta', () => {
  // Zgloszenie 2026-11-05 (A3): natywne UI - tlo i tekst roota ze
  // zmiennych motywu; zero hex.
  const body = ruleBody(/\.arkmail-root\s*/);
  assert.ok(body, 'regula .arkmail-root istnieje');
  assert.match(body!, new RegExp(`background:\\s*${VAR}`), 'tlo roota ze zmiennej');
  assert.match(body!, new RegExp(`color:\\s*${VAR}`), 'tekst roota ze zmiennej');
  assert.doesNotMatch(body!, new RegExp(HEX), 'root bez hex');
});

test('style: wszystkie przyciski maja jawne tlo i kolor (catch-all)', () => {
  const body = ruleBody(/\.arkmail-root\s+button\b/);
  assert.ok(body, 'istnieje catch-all .arkmail-root button');
  assert.match(body!, new RegExp(`background:\\s*${VAR}`), 'tlo przyciskow ze zmiennej');
  assert.match(body!, new RegExp(`color:\\s*${VAR}`), 'kolor przyciskow ze zmiennej');
  assert.doesNotMatch(body!, new RegExp(HEX), 'przyciski bez hex');
});

test('style: pola tekstowe bez wlasnych regul kolorow (klasy natywne klienta)', () => {
  // Zgloszenie 2026-11-05 (F4c): wyglad pol pilnuja natywne klasy
  // popup-input popup-input--control z arkusza klienta; plugin trzyma
  // wylacznie checkboxy (accent-color).
  assert.doesNotMatch(STYLES, /\.arkmail-root\s+input\s*,\s*\.arkmail-root\s+textarea/, 'bez catch-all dla pol');
  assert.doesNotMatch(STYLES, /\.arkmail-root\s+input:focus\b/, 'bez wlasnego fokusa pol');
  assert.doesNotMatch(STYLES, /input::placeholder/, 'bez wlasnego placeholdera');
  assert.match(STYLES, /input\[type='checkbox'\]\s*\{\s*accent-color:/, 'checkboxy: accent-color zostaje');
});

test('style: ostylowane klasy dotychczas gole (preview/ops/fwd/notify)', () => {
  // Zgloszenie 2026-11-05 (F4b): .arkmail-del nie ma juz wlasnej reguly;
  // klawisz kasowania listu dziala na klasach natywnego UI klienta.
  for (const cls of [
    'arkmail-preview',
    'arkmail-letter-ops',
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
  // Ancja do linii: po zwrocie ".arkmail-listy > .arkmail-search-row"
  // (1.30.2, Etap 4) wielolinijkowy ruleBody zlapalby regule flex: none.
  const rowM = STYLES.match(/^\.arkmail-search-row\s*\{([^}]*)\}/m);
  const row = rowM ? rowM[1] : null;
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
  assert.match(body!, /font-size:\s*calc\(12px \* var\(--window-font-scale, 1\)\)/, 'czcionka 12px skalowana');
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
  assert.match(forward!, /flex:\s*1\s+1\s+calc\(\d+px \* var\(--window-font-scale, 1\)\)/, 'pole ma elastyczna podstawe szerokosci');
  assert.match(forward!, /min-width:\s*0/, 'pole moze zmniejszyc sie bez przepelnienia');
});

test('style: filtr i sortowanie kontaktow mieszcza sie w waskim panelu', () => {
  const controls = ruleBody(/\.arkmail-contact-controls\s*/);
  assert.ok(controls, 'regula paska kontaktow istnieje');
  assert.match(controls!, /flex-wrap:\s*wrap/, 'kontrolki moga przejsc do kolejnego rzedu');

  const filter = ruleBody(/\.arkmail-root\s+\.arkmail-contact-filter\s*/);
  assert.ok(filter, 'regula filtra kontaktow istnieje');
  assert.match(filter!, /flex:\s*1\s+1\s+calc\(\d+px \* var\(--window-font-scale, 1\)\)/, 'filtr ma elastyczna podstawe szerokosci');
  assert.match(filter!, /min-width:\s*0/, 'filtr moze zmniejszyc sie bez przepelnienia');

  const sort = ruleBody(/\.arkmail-root\s+\.arkmail-contact-sort\s*/);
  assert.ok(sort, 'regula sortowania kontaktow istnieje');
  assert.match(sort!, /max-width:\s*100%/, 'sortowanie nie wyjdzie poza panel');
});

// Placeholdery pol pilnuje arkusz klienta (.popup-input::placeholder,
// zgloszenie 2026-11-05 F4c) - brak wlasnej reguly do piniowania.

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
  assert.match(all!, /min-height:\s*calc\(26px \* var\(--window-font-scale, 1\)\)/, 'jednolita minimalna wysokosc skalowana');

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
  assert.ok(src.includes('Przerwij ('), 'krotki format "Przerwij (N)" w uzyciu');
});

test('style: Wyczysc filtry w Archiwum zajmuje caly wiersz', () => {
  const clear = ruleBody(/\.arkmail-arch-controls\s+\.arkmail-arch-clear\b/);
  assert.ok(clear, 'regula przycisku Wyczysc filtry istnieje');
  assert.match(clear!, /grid-column:\s*1\s*\/\s*-1/, 'przycisk rozpiety na caly wiersz');
});

test('style: karty Archiwum nie maja ozdobnych strzalek', () => {
  assert.doesNotMatch(STYLES, /\.arkmail-archive-step[^{]*::after/);
  assert.ok(!STYLES.includes("content: '›'"));
});

// Waski popup: wiersz ksiazki trzyma checkbox, imie i oba przyciski
// w jednej linii (imie sie skraca, nie wypycha przyciskow); head grupy
// zawija kontrolki zamiast je ucinac.
test('style: wiersze ksiazki i heady grup maja uklad flex', () => {
  const row = ruleBody(/\.arkmail-root\s+\.arkmail-book-row\b/);
  assert.ok(row, 'regula .arkmail-book-row istnieje');
  assert.match(row!, /display:\s*flex/, 'flexbox w wierszu ksiazki');
  assert.match(row!, /align-items:\s*center/, 'centrowanie w pionie');

  const name = ruleBody(/\.arkmail-root\s+\.arkmail-book-name\b/);
  assert.ok(name, 'regula .arkmail-book-name istnieje');
  assert.match(name!, /flex:\s*1\s+1\s+auto/, 'imiage zajmuje wolna przestrzen');
  assert.match(name!, /min-width:\s*0/, 'bez sztywnego minimum');
  assert.match(name!, /text-overflow:\s*ellipsis/, 'nadmiar jako wielokropek');

  const head = ruleBody(/\.arkmail-root\s+\.arkmail-group-head\b/);
  assert.ok(head, 'regula .arkmail-group-head istnieje');
  assert.match(head!, /display:\s*flex/, 'flexbox w headzie grupy');
  assert.match(head!, /flex-wrap:\s*wrap/, 'zawijanie w waskim oknie');
});

/* --- F5: tokeny systemu projektowego (hover, disabled, dividery, mini, focus) --- */

test('style F5: hover tylko dla klawiszy spoza natywnych klas klienta', () => {
  // Zgloszenie 2026-11-05 (F4b): klawisze z klasami popup-btn--* maja hovery
  // z arkusza klienta; wlasny hover dotyczy wylacznie button:not(.popup-btn).
  const hover = ruleBody(/button:not\(\.popup-btn\):not\(\.dialog-tab\):hover/);
  assert.ok(hover, 'regula catch-all hover istnieje');
  assert.match(hover!, /background:\s*var\(--popup-control-hover-bg\)/, 'catch-all hover: control-hover');
  assert.doesNotMatch(STYLES, /\.arkmail-btn-(primary|action|danger|reset):hover/, 'zero wlasnych regul hover starych poziomow');
  assert.doesNotMatch(STYLES, /\.arkmail-tab\b[^:]*\{[^}]*background:/, 'zakladki poza hovorem catch-all');
});

test('style F5: liczba uzyc tokenow hover w STYLES dokladna', () => {
  // Zgloszenie 2026-11-05 (F4b): control-hover x3 (catch-all hover,
  // catch-all :active, hover rodziny mini); danger-hover x0 (hover
  // klawiszy danger obsluguje arkusz klienta).
  assert.equal((STYLES.match(/var\(--popup-control-hover-bg\)/g) || []).length, 3, 'control-hover-bg: 3 reguly');
  assert.equal((STYLES.match(/var\(--popup-danger-hover-bg\)/g) || []).length, 0, 'danger-hover-bg: 0 regul');
});

test('style F5: disabled takze dla klawiszy natywnych popup-btn', () => {
  const disabled = ruleBody(/\.arkmail-root \.popup-btn:disabled/);
  assert.ok(disabled, 'regula popup-btn:disabled istnieje');
  assert.match(disabled!, /opacity:\s*0\.45/, 'popup-btn:disabled przezroczystosc 0.45');
  assert.match(disabled!, /cursor:\s*default/, 'popup-btn:disabled bez kursora pointer');
});

test('style F5: pozioma linia hr w tokenach obramowania', () => {
  const hr = ruleBody(/\.arkmail-root hr/);
  assert.ok(hr, 'regula hr istnieje');
  assert.match(hr!, /border-top:\s*calc\(1px \* var\(--window-font-scale, 1\)\) solid var\(--popup-border\)/,
    'hr: linia w kolorze obramowania, skalowana');
  assert.doesNotMatch(hr!, /#[0-9a-fA-F]{3,8}/, 'hr: bez sztywnych kolorow hex');
});

test('style F5: jeden mechanizm disabled (generyczny button:disabled)', () => {
  assert.doesNotMatch(STYLES, /deletion-delete:disabled/, 'usuniety override deletion-delete:disabled');
  assert.doesNotMatch(STYLES, /contact-dir:disabled/, 'usuniety blok contact-dir/addbook:disabled');
  assert.doesNotMatch(STYLES, /opacity:\s*0\.4(?!\d)/, 'brak bloku opacity 0.4');
  const disabled = ruleBody(/\.arkmail-root\s+button:not\(\.popup-btn\):not\(\.dialog-tab\):disabled\b/);
  assert.ok(disabled, 'generyczna regula button:disabled zostaje');
  assert.match(disabled!, /opacity:\s*0\.45/, 'generyczna przezroczystosc 0.45');
});

test('style F5: dividery usuwania w tonie BG jak pozostale wiersze', () => {
  const results = ruleBody(/\.arkmail-deletion-results/);
  assert.ok(results, 'regula deletion-results istnieje');
  assert.match(results!, /border-top:\s*calc\(1px \* var\(--window-font-scale, 1\)\) solid var\(--popup-bg\)/,
    'border-top dividera w tonie tla okna');
  assert.doesNotMatch(results!, /var\(--popup-border\)/, 'divider bez border');
});

test('style F5: krok archiwum 3px i siatka krokow 10px', () => {
  const step = ruleBody(/\.arkmail-archive-step\b/);
  assert.ok(step, 'regula archive-step istnieje');
  assert.match(step!, /border-left:\s*calc\(3px \* var\(--window-font-scale, 1\)\) solid var\(--popup-text-dim\)/,
    'pasek kroku 3px (jak pasek zajetosci)');
  assert.doesNotMatch(step!, /4px \* var\(--window-font-scale, 1\)\) solid var\(--popup-text-dim\)/,
    'brak 4px na pasku kroku');
  const steps = ruleBody(/\.arkmail-archive-steps/);
  assert.match(steps!, /gap:\s*calc\(10px \* var\(--window-font-scale, 1\)\)/, 'siatka krokow gap 10px');
  assert.doesNotMatch(steps!, /18px/, 'siatka krokow bez 18px');
});

test('style F5: rodzina mini promien 6px i hover z tlem', () => {
  const mini = ruleBody(/\.arkmail-contact-dir,/);
  assert.ok(mini, 'regula rodziny mini istnieje');
  assert.match(mini!, /border-radius:\s*calc\(6px \* var\(--window-font-scale, 1\)\)/,
    'promien rodziny mini 6px');
  const miniHover = ruleBody(/\.arkmail-contact-dir:hover,/);
  assert.ok(miniHover, 'hover rodziny mini istnieje');
  assert.match(miniHover!, /background:\s*var\(--popup-control-hover-bg\)/, 'hover mini: control-hover');
  assert.match(miniHover!, /(?:^|;)\s*color:\s*var\(--popup-accent\)/, 'hover mini: tekst w kolorze akcentu');
});

test('style F5: focus-visible obwodka akcentu i stan :active', () => {
  const fv = ruleBody(/button:not\(\.popup-btn\):focus-visible,/);
  assert.ok(fv, 'regula focus-visible istnieje');
  assert.match(fv!, /outline:\s*calc\(2px \* var\(--window-font-scale, 1\)\) solid var\(--popup-accent\)/, 'focus-visible: 2px akcent');
  assert.match(fv!, /outline-offset:\s*calc\(1px \* var\(--window-font-scale, 1\)\)/, 'focus-visible: offset 1px');
  assert.match(STYLES, /\.arkmail-tab:focus-visible,/, 'focus-visible obejmuje zakladki');
  assert.match(STYLES, /\.arkmail-box:focus-visible,/, 'focus-visible obejmuje skrzynki');
  assert.match(STYLES, /\.arkmail-contact-dir:focus-visible/, 'focus-visible obejmuje rodzine mini');
  const active = ruleBody(/button:not\(\.popup-btn\):not\(\.dialog-tab\):not\(\[data-armed="1"\]\):active/);
  assert.ok(active, 'regula :active istnieje');
  assert.match(active!, /background:\s*var\(--popup-control-hover-bg\)/, ':active uzywa control-hover');
});

test('style F5: swiadome wyjatki bez zmian', () => {
  const send = ruleBody(/\.arkmail-send\b/);
  assert.match(send!, /padding:\s*calc\(6px \* var\(--window-font-scale, 1\)\) calc\(18px \* var\(--window-font-scale, 1\)\)/,
    'padding wysylki 18px zostaje');
  // 1.30.2 (Etap 4): arch-occ-list usuniety (martwy selektor po
  // przejsciu Archiwum na chipsy) - pin wciecia 18px odpada.
  assert.match(STYLES, /scrollbar-thumb \{ background:\s*var\(--popup-border\); border-radius:\s*calc\(4px/,
    'promien scrollbara 4px zostaje');
  const track = ruleBody(/\.arkmail-busy-track/);
  assert.match(track!, /border-radius:\s*calc\(3px/, 'promien paska postepu 3px zostaje');
  const attention = ruleBody(/\.arkmail-box-attention/);
  assert.match(attention!, /border-color:\s*var\(--popup-accent\)/, 'obramowanie box-attention akcent zostaje');
});
