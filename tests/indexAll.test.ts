/**
 * Fala 18c (zgloszenie 2026-10-20 pkt 1): kontakty liczone z archiwum
 * maja sens dopiero po pelnej indeksacji wszystkich skrzynek (wczesniej
 * baza = pierwsze 50 wpisow i liczniki klamaly).
 * - brama Kontaktow: bez kompletnego indeksu przycisk "Indeksuj
 *   wszystkie skrzynki" zamiast mylacych licznikow; po indeksacji
 *   dotychczasowy widok + stopka "Zindeksowano ...; N listow w bazie".
 * - indeksacja: kompletny listing kazdej skrzynki (z paginacja
 *   kotwiczaca jak "Wczytaj wszystkie") dokleja wszystko do archiwum,
 *   oznacza znikniete z serwera i stawia flage per skrzynka.
 * - pobieranie tresci i eksport ZIP uzywaja aktualnej bazy bez
 *   automatycznego powtarzania indeksacji.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  waitRt,
  click,
  notifyText,
  type Harness,
  clickText,
} from './harness';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';

const HANDLERS = {
  onOpenLetter: () => {},
  onSendCompose: () => {},
  onCloseLetter: () => {},
  onRefreshBox: () => {},
  onLoadOlder: () => {},
  onLoadAll: () => {},
  onSearch: () => {},
  onClearSearch: () => {},
  onDeleteLetter: () => {},
  onForwardLetter: () => {},
} as unknown as MailUiHandlers;

test('brama panelu Osoby: bez indeksu przycisk indeksacji zamiast licznikow', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({});
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      // Fala UI-2 krok 4: brama stoi w zakladce Archiwum.
      store.setTab('archiwum');
      // Wydanie 1.30.1 (zgloszenie 6): klawisz indeksacji mieszka w
      // kroku 1 widoku listow; wskazowka bramy - pod chipem osoby.
      const btn = container.querySelector('.arkmail-index-all') as unknown as {
        textContent?: string;
      } | null;
      assert.ok(btn, 'przycisk indeksacji w bramie Kontaktow');
      assert.equal(btn.textContent, 'Indeksuj wszystkie skrzynki');
      // Wydanie 1.30.1 (zgloszenie 6): wskazowka bramy i kontrolki
      // osob mieszkaja pod chipem "Osoby z listow".
      for (const pill of Array.from(
        container.querySelectorAll('.arkmail-subpill') as unknown as Array<{ textContent?: string; click(): void }>,
      )) {
        if (pill.textContent === 'Osoby z listow') pill.click();
      }
      // Fala 19b: brama ma wyjasniac, ze indeksowanie buduje baze
      // kontaktow ze wszystkich skrzynek i wszystkich listow - bez
      // technicznych szczegolow ("pierwszych 50") nic nie mowiacych
      // graczowi.
      const gateText = container.textContent ?? '';
      assert.ok(
        gateText.includes('Kontakty powstaja z listow zebranych ze wszystkich skrzynek.'),
        'brama wyjasnia, skad bierze sie baza kontaktow',
      );
      // Fala 24a: bez dopisku "(jednorazowo)" - indeksowanie nie jest
      // jednorazowe (Fala 24e: incrementalna, przeczes co 7 dni).
      assert.ok(
        !gateText.includes('(jednorazowo)'),
        'brama bez dopisku jednorazowosci',
      );
      assert.ok(
        !gateText.includes('pierwszych 50'),
        'brama bez technicznych szczegolow o pierwszych 50 wpisach',
      );
      // Fala 24a: lista kontaktow jest ZAWSZE widoczna - brama to
      // wskazowka + przycisk NAD lista, nie zamiast niej (zgloszenie
      // 2026-10-21: kontakty niewidoczne mimo pelnego archiwum).
      assert.ok(
        container.querySelector('.arkmail-contact-controls'),
        'kontakty widoczne takze przed kompletna indeksacja',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('brama panelu Osoby: lista kontaktow widoczna mimo braku indeksu, wskazowka nad lista', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({});
    // Kontakty z czesciowego archiwum (bez kompletnej indeksacji) -
    // gracz ma je widziec od razu (Fala 24a, zgloszenie 2026-10-21:
    // "wczytaj wszystkie uzupelnilo archiwum, a kontakty niewidoczne").
    store.setContacts([
      { name: 'Bar', sources: [], lettersReceived: 12, lettersSent: 3 },
      { name: 'Grault', sources: [], lettersReceived: 2, lettersSent: 0 },
    ]);
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      // Fala UI-2 krok 4: panel Osoby w zakladce Archiwum.
      store.setTab('archiwum');
      // Wydanie 1.30.1 (zgloszenie 6): klawisz indeksacji zyje w
      // kroku 1 widoku listow - sprawdzamy przed przełączeniem chipsu.
      const stepBtn = container.querySelector('.arkmail-index-all');
      assert.ok(stepBtn, 'klawisz indeksacji w kroku 1 Archiwum');
      // Wydanie 1.30.1 (zgloszenie 6): panel osob pod chipem.
      for (const pill of Array.from(
        container.querySelectorAll('.arkmail-subpill') as unknown as Array<{ textContent?: string; click(): void }>,
      )) {
        if (pill.textContent === 'Osoby z listow') pill.click();
      }
      const text = container.textContent ?? '';
      assert.ok(text.includes('Bar'), 'kontakt z czesciowego archiwum widoczny');
      assert.ok(text.includes('Grault'), 'drugi kontakt widoczny');
      // Zgloszenie 2026-11-05: w panelu zostaje sama wskazowka -
      // klawisz indeksowania jest jeden, w kroku 1 Archiwum.
      const panel = container.querySelector('[data-arch-people]');
      assert.ok(panel, 'panel Osoby z listow');
      const panelText = (panel as unknown as { textContent?: string }).textContent ?? '';
      assert.ok(
        panelText.includes('Kontakty powstaja z listow zebranych ze wszystkich skrzynek.'),
        'wskazowka w panelu',
      );
      const gateBtn = (panel as unknown as { querySelector(s: string): unknown }).querySelector(
        '.arkmail-index-all',
      );
      assert.ok(!gateBtn, 'panel osob bez klawisza indeksacji (zostaje krok 1)');
      const controls = (panel as unknown as { querySelector(s: string): unknown }).querySelector(
        '.arkmail-contact-controls',
      );
      assert.ok(controls, 'kontrolki listy obecne w panelu');
      // Wskazowka jest przed kontrolkami w HTML panelu.
      const panelHtml = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
      assert.ok(
        panelHtml.indexOf('Kontakty powstaja z listow') <
          panelHtml.indexOf('arkmail-contact-controls'),
        'wskazowka NAD lista kontaktow',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('Indeksuj wszystkie: paginacja kotwicowa, flagi, gone-marking, odblokowanie Kontaktow', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
    click(h, '.arkmail-index-all');
    // W trakcie petli przycisk zamienia sie w Przerwij z postepem.
    await waitRt(
      () =>
        String(
          (h.content.querySelector('.arkmail-index-all') as { textContent?: string } | null)
            ?.textContent ?? '',
        ).includes('Przerwij indeksowanie (1/4)'),
      'etykieta Przerwij w trakcie indeksacji',
    );
    // --- odebrane, strona 1 (prolog juz wyslal 1x "listy odebrane").
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'indeksacja: listing odebrane',
    );
    // Uciety listing BEZ najnowszego listu (Corge zniknal z serwera).
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // Kotwica paginacji: dzien PO najstarszym widocznym (21 XII -> 22 XII).
    await waitRt(
      () => f.sent.includes('listy odebrane przed 23 VIII 1999'),
      'indeksacja: kotwica paginacji odebranych',
    );
    // Strona 2 kompletna (bez suffixu uciecia) - nowy prastary list.
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: prastary', 'mail');
    f.fire('Nadawca: Fred                        So, 7 VIII 1999, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    // --- pozostale skrzynki puste (nieprzeczytane: prolog wyslal 1x).
    await waitRt(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'indeksacja: nieprzeczytane',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    // --- koniec: toast + koniec sesji.
    await waitRt(() => notifyText(f, 'Zindeksowano skrzynki'), 'toast konca indeksacji');
    await waitRt(() => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'koniec sesji indeksacji');

    // Archiwum: 3 zywe wiersze (Corge zniknela, prastary doszedl).
    await waitRt(
      () => h.content.querySelectorAll('.arkmail-arch-entry').length === 3,
      '3 zywe wiersze archiwum po indeksacji',
    );
    const texts = Array.from(
      h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(texts.every((t) => !t.includes('najnowszy')), 'znikniety list ukryty');
    assert.ok(texts.some((t) => t.includes('prastary')), 'dopisany list z paginacji');

    // Kontakty odblokowane: Foo i Fred licza sie, Corge nie.
    // Fala UI-2 krok 4: wiersze kontaktow stoja w panelu Archiwum.
    // Zgloszenie 2026-11-05 (A1): panel domyslnie zwiniety - toggle
    // przed odczytem wierszy.
    click(h, '[data-tab="archiwum"]');
    clickText(h, '.arkmail-subpill', 'Osoby z listow');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'wiersze kontaktow');
    const names = Array.from(
      h.content.querySelectorAll('.arkmail-contact-name') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(names.includes('Foo'), 'kontakt z zywych listow');
    assert.ok(names.includes('Fred'), 'kontakt z dopisanej strony');
    assert.ok(!names.includes('Corge'), 'kontakt zniknietego listu odpada');
    // Wydanie 1.30.1 (zgloszenie 6): krok 1 i pasek licznikow stoja
    // w widoku listow - wracamy na chips listy.
    clickText(h, '.arkmail-subpill', 'Archiwum listow');
    // Opis indeksacji: najwczesniejsza data w kroku 1 Archiwum + rozmiar
    // bazy w pasku licznikow (3 zywe grupy; Fala 28: zniknieta Corge
    // jest FIZYCZNIE purgowana, nie siedzi w bazie jako zombie).
    // Stopka Kontaktow zniknela razem z sub-pigulka Osoby (krok 4).
    const stepStatus = h.content.querySelector('.arkmail-archive-step-status') as unknown as {
      textContent?: string;
    } | null;
    assert.ok(stepStatus, 'status kroku 1 istnieje');
    assert.match(
      String(stepStatus!.textContent ?? ''),
      /Gotowe od 20\d\d-\d\d-\d\d: wszystkie skrzynki zapisane/,
      'data kompletu w kroku 1',
    );
    const strip = h.content.querySelector('.arkmail-arch-counts') as unknown as {
      textContent?: string;
    } | null;
    assert.ok(strip, 'pasek licznikow istnieje');
    assert.ok(String(strip!.textContent ?? '').includes('Listow w bazie: 3'), 'rozmiar bazy');
  } finally {
    await stopHarness();
  }
});

test('pobieranie tresci przy pustej bazie: jasny toast bez indeksacji', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-download'), 'przycisk pobierania');
    click(h, '.arkmail-arch-download'); // uzbrojenie (dwuklik)
    click(h, '.arkmail-arch-download'); // odpalenie
    await waitRt(() => notifyText(f, 'Skrzynki sa puste'), 'toast pustych skrzynek');
    assert.equal(f.sent.length, 0, 'pobieranie pustej bazy bez komend');
  } finally {
    await stopHarness();
  }
});

test('eksport ZIP: pusta baza daje jasny toast bez indeksacji', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-export'), 'przycisk eksportu');
    click(h, '.arkmail-arch-export');
    await waitRt(() => notifyText(f, 'Skrzynki sa puste'), 'toast pustych skrzynek');
    assert.ok(!notifyText(f, 'kliknij ponownie'), 'brak prosby o ponowny klik');
    assert.equal(f.sent.length, 0, 'eksport pustej bazy bez komend');
  } finally {
    await stopHarness();
  }
});

test('pobieranie tresci przy kompletnej bazie: jasny toast zamiast martwego', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    // Mini-prolog: 1 list odebrany (kompletny listing) + puste
    // nieprzeczytane; potem odczyt listu (tresc w archiwum).
    f.fire(' [ POCZTA ] Masz nowa poczte od Corge.');
    await waitRt(() => f.sent.includes('listy odebrane'), 'prolog: odebrane');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: jedyny', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'prolog: nieprzeczytane');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'koniec prologu');
    // Otwarcie listu z re-kotwica (Fala 9a).
    const row = Array.from(
      h.content.querySelectorAll('.arkmail-entry') as unknown as Iterable<{
        textContent?: string;
        dispatchEvent(e: unknown): void;
      }>,
    ).find((r) => String(r.textContent ?? '').includes('jedyny'));
    assert.ok(row, 'wiersz listingu');
    row.dispatchEvent(new h.window.Event('click'));
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: jedyny', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt');
    f.fire('List : 1', 'mail');
    f.fire('Od   : Corge', 'mail');
    f.fire('Temat: jedyny', 'mail');
    f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('', 'mail');
    f.fire('Tresc jedynego.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    f.fire('> ', 'prompt');
    // Po odczycie plugin odswieza skrzynke (oznaczenie przeczytanym).
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'refresh po odczycie',
    );
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: jedyny', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => ((h.content.querySelector('.arkmail-busy') as { textContent?: string | null } | null)?.textContent ?? 'missing') === '', 'koniec odczytu');
    // Archiwum ma 1 list i ma juz tresc -> pobieranie konczy sie
    // jasnym toastem bez ponownej indeksacji.
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-download'), 'przycisk pobierania');
    click(h, '.arkmail-arch-download'); // uzbrojenie
    click(h, '.arkmail-arch-download'); // odpalenie
    await waitRt(
      () => notifyText(f, 'Wszystkie listy w bazie maja tresci.'),
      'toast kompletnej bazy',
    );
  } finally {
    await stopHarness();
  }
});
