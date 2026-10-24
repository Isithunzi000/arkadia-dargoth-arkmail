/**
 * Ludzkie komunikaty bledow (Fala 17f, zgloszenie 2026-10-19/20 pkt 6
 * i audyt stringow).
 *
 * Blad z sesji: gracz widzial surowe debug-stringi w toastach
 * ("Blad szukania: pusta nieprzeczytane podczas fetch odebrane",
 * "timeout: mailbox fetch odebrane", "pager session list 12:
 * odrzucono przez sierocy pager") - po polsku "z dupy" albo wcale.
 *
 * Kontrakt:
 *  - humanizeMailError mapuje techniczne komunikaty sesji na ludzkie
 *    polskie (ASCII - Arkadia bez diakrytykow);
 *  - linie serwera (juz po polsku, np. "Data zostala podana w zlym
 *    formacie.") przechodza bez zmian;
 *  - nieznany blad -> neutralny fallback, NIGDY surowy technikal;
 *  - catch-site'y z err.message (wczytywanie, starsze, szukanie)
 *    przepuszczaja komunikat przez mapper;
 *  - audyt: zadne notify ani etykieta nie zawiera technikalow
 *    ("podczas fetch", "pager session", "timeout:").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { humanizeMailError } from '../src/arkmail/core/errors';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

test('humanize: timeouty sesji po ludzku', () => {
  assert.equal(
    humanizeMailError('timeout: mailbox fetch odebrane'),
    'Serwer nie odpowiedzial na czas - sprobuj ponownie.',
  );
  assert.equal(
    humanizeMailError('timeout: pager session list 12'),
    'Odczyt listu trwal za dlugo - sprobuj ponownie.',
  );
});

test('humanize: sierocy pager i throttle po ludzku', () => {
  assert.equal(
    humanizeMailError('sierocy pager podczas fetch odebrane'),
    'Poczta sie zawiesila - sprobuj ponownie.',
  );
  assert.equal(
    humanizeMailError('pager session list 12: odrzucono przez sierocy pager'),
    'Poczta sie zawiesila - sprobuj ponownie.',
  );
  assert.equal(
    humanizeMailError('Listy sa w tej chwili ladowane.'),
    'Serwer jeszcze laduje listy - sprobuj ponownie za chwile.',
  );
  assert.equal(
    humanizeMailError('pager session list 3: Listy sa w tej chwili ladowane.'),
    'Serwer jeszcze laduje listy - sprobuj ponownie za chwile.',
  );
});

test('humanize: mismatch skrzynki i przerwanie po ludzku', () => {
  assert.equal(
    humanizeMailError('pusta wyslane podczas fetch odebrane'),
    'Serwer odpowiedzial za inna skrzynke (wyslane zamiast odebrane) - sprobuj ponownie.',
  );
  assert.equal(
    humanizeMailError('listing wyslane podczas fetch odebrane'),
    'Serwer odpowiedzial za inna skrzynke (wyslane zamiast odebrane) - sprobuj ponownie.',
  );
  assert.equal(humanizeMailError('pager session list 7: przerwano'), 'Przerwano odczyt listu.');
});

test('humanize: linie serwera przechodza bez zmian, nieznane do fallbacku', () => {
  assert.equal(
    humanizeMailError('Data zostala podana w zlym formacie.'),
    'Data zostala podana w zlym formacie.',
  );
  assert.equal(humanizeMailError('Zly numer listu: 5.'), 'Zly numer listu: 5.');
  assert.equal(
    humanizeMailError('pager session list 9: Zadne listy nie zostaly wybrane.'),
    'Zadne listy nie zostaly wybrane.',
  );
  assert.equal(
    humanizeMailError('TypeError: undefined is not a function'),
    'Operacja nie powiodla sie - sprobuj ponownie.',
  );
});

const setInput = (h: Harness, selector: string, value: string): void => {
  const el = h.content.querySelector(selector) as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  el.value = value;
  el.dispatchEvent(new h.window.Event('input'));
};

test('integracja: blad szukania pokazuje ludzki komunikat, nie debug-string', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    setInput(h, '[data-search="osoba"]', 'Corge');
    click(h, '.arkmail-search-go');
    await waitRt(() => f.sent.includes('listy odebrane od corge'), 'komenda szukania');
    // Jednoznaczny mismatch (straznik Fali 14d) - serwer odpowiada
    // za inna skrzynke.
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => notifyText(f, 'Blad szukania:'), 'toast bledu szukania');
    assert.ok(
      notifyText(f, 'Serwer odpowiedzial za inna skrzynke (wyslane zamiast odebrane)'),
      'ludzki komunikat zamiast debug-stringa',
    );
    assert.ok(!notifyText(f, 'podczas fetch'), 'zadnych technikaliow w toascie');
  } finally {
    await stopHarness();
  }
});

test('audyt: zadne notify ani etykieta nie zawiera technikaliow sesji', () => {
  const root = join(__dirname, '..', '..');
  for (const rel of ['src/arkmail/index.ts', 'src/arkmail/ui/render.ts']) {
    const src = readFileSync(join(root, rel), 'utf8');
    const literals = [...src.matchAll(/(?:notify\(api,\s*|textContent =\s*)[`'"]([^`'"]+)[`'"]/g)].map(
      (m) => m[1],
    );
    for (const lit of literals) {
      assert.ok(
        !/podczas fetch|pager session|timeout:|odrzucono przez sierocy/.test(lit),
        `${rel}: technikal w komunikacie: "${lit}"`,
      );
    }
  }
});

test('stringi klasa B: poprawione, naturalne polskie (ASCII)', () => {
  const root = join(__dirname, '..', '..');
  const index = readFileSync(join(root, 'src/arkmail/index.ts'), 'utf8');
  const render = readFileSync(join(root, 'src/arkmail/ui/render.ts'), 'utf8');
  // Stare, niezgrabne wersje zakazane:
  assert.ok(!index.includes('Nie znalazlem listu na swiezym listingu'), 'stary komunikat re-kotwicy');
  assert.ok(!index.includes('zlokalizowac'), '"zlokalizowac" zastapione');
  assert.ok(!render.includes('Moze potrwac bardzo dlugo - kliknij ponownie'), 'stary tekst uzbrojenia');
  assert.ok(!render.includes('Podglad (tak list zostanie wyslany)'), 'stary podglad');
  assert.ok(!render.includes('niczego nie trafia'), '"niczego nie trafia" zastapione');
  // Fala 21a: bledy jezykowe i zargon zakazane:
  assert.ok(!index.includes('Przerwiano'), '"Przerwiano" (zle) - jest "Przerwano"');
  assert.ok(!index.includes('(brak daty)'), '"brak daty" - technikalia z toastu');
  assert.ok(!index.includes('Trwa inna operacja pocztowa'), '13 kopii toastu - jest SESSION_BUSY_MSG');
  assert.ok(!index.includes('Kasuje list'), '"Kasuje" - jest "Usuwam"');
  // Nowe wersje obecne:
  assert.ok(index.includes('Nie ma tego listu na liscie - odswiez skrzynke.'), 'nowy komunikat re-kotwicy');
  assert.ok(index.includes('Nie moge znalezc tego listu - odswiez skrzynke.'), 'brak daty bez technikaliow');
  assert.ok(index.includes('Poczekaj, az skoncze biezaca operacje.'), 'SESSION_BUSY_MSG');
  assert.ok(index.includes('Zapisane dane wyczyszczone.'), 'toast czyszczenia bez zargonu');
  // Fala 21b: anglicyzmy, zargon i niezgrabnosci zakazane:
  assert.ok(!render.includes("? ' (forwardowany)'"), '"forwardowany" - jest "(przekazany)"');
  assert.ok(!render.includes('Wyslij Zwierze'), 'wielka litera - jest "Wyslij zwierze"');
  assert.ok(!render.includes('Wyczysc pamiec podreczna'), 'zargon - jest "Wyczysc zapisane dane"');
  assert.ok(!render.includes('Podglad - tak list zostanie wyslany'), 'stary podglad (21b)');
  assert.ok(!render.includes('Zapisz w kolejce do wyslania'), 'trzeci termin - jest "niewyslanych"');
  assert.ok(!render.includes('w tym kierunku'), 'zargon - jest "Brak listow."');
  assert.ok(!render.includes('po pobraniu listingow'), '"listingi" - jest "skrzynki"');
  // Nowe wersje obecne (21b):
  assert.ok(render.includes("(przekazany)"), 'przekazany po polsku');
  assert.ok(render.includes('Wyczysc zapisane dane'), 'czyszczenie bez zargonu');
  assert.ok(render.includes('Kasuje listy i kontakty. Ustawienia zostaja.'), 'dim czyszczenia');
  assert.ok(render.includes('Podglad wysylanego listu'), 'nowy podglad (21b)');
  assert.ok(render.includes('Zapisz w niewyslanych'), 'spojne ze skrzynka niewyslane');
  assert.ok(render.includes('Kontakty powstaja z listow zebranych ze wszystkich skrzynek'), 'brama 21b');
  assert.ok(render.includes('Wybierz list, aby go przeczytac.'), 'bez "list z listy"');
  assert.ok(render.includes('Ostatnia indeksacja:'), 'stopka indeksu po ludzku');
  assert.ok(render.includes('Indeksuj wszystkie skrzynki'), 'jedna wersja przycisku indeksacji');
  assert.ok(render.includes('Pobieranie potrwa dlugo - kliknij ponownie'), 'nowy tekst uzbrojenia');
  assert.ok(render.includes('Archiwum puste albo zaden list nie pasuje do filtra.'), 'nowe puste archiwum');
  assert.ok(render.includes('Zaden kontakt nie pasuje do filtra.'), 'nowy pusty filtr kontaktow');
});
