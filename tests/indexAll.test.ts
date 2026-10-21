/**
 * Fala 18c (zgloszenie 2026-10-20 pkt 1): kontakty liczone z archiwum
 * maja sens dopiero po pelnej indeksacji wszystkich skrzynek (wczesniej
 * baza = pierwsze 50 wpisow i liczniki klamaly).
 * - brama Kontaktow: bez kompletnego indeksu przycisk "Indeksuj
 *   wszystkie skrzynki" zamiast mylacych licznikow; po indeksacji
 *   dotychczasowy widok + stopka "Zindeksowano ...; listow w bazie: N".
 * - indeksacja: kompletny listing kazdej skrzynki (z paginacja
 *   kotwiczaca jak "Wczytaj wszystkie") dokleja wszystko do archiwum,
 *   oznacza znikniete z serwera i stawia flage per skrzynka.
 * - guardy: "Pobierz tresci do archiwum" i "Zapisz wszystkie (ZIP)"
 *   przy pustej niezindeksowanej bazie najpierw indeksuja (zamiast
 *   martwego toastu "brak listow").
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

test('brama Kontaktow: bez indeksu przycisk indeksacji zamiast licznikow', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const store = new MailUiStore({});
    const container = window.document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, HANDLERS);
    try {
      store.setTab('kontakty');
      const btn = container.querySelector('.arkmail-index-all') as unknown as {
        textContent?: string;
      } | null;
      assert.ok(btn, 'przycisk indeksacji w bramie Kontaktow');
      assert.equal(btn.textContent, 'Indeksuj wszystkie skrzynki');
      // Fala 19b: brama ma wyjasniac, ze indeksowanie buduje baze
      // kontaktow ze wszystkich skrzynek i wszystkich listow - bez
      // technicznych szczegolow ("pierwszych 50") nic nie mowiacych
      // graczowi.
      const gateText = container.textContent ?? '';
      assert.ok(
        gateText.includes('Kontakty powstaja z listow zebranych ze wszystkich skrzynek'),
        'brama wyjasnia, skad bierze sie baza kontaktow',
      );
      assert.ok(
        gateText.includes('(jednorazowo)'),
        'brama zaznacza jednorazowosc indeksacji',
      );
      assert.ok(
        !gateText.includes('pierwszych 50'),
        'brama bez technicznych szczegolow o pierwszych 50 wpisach',
      );
      assert.ok(
        !container.querySelector('.arkmail-contact-controls'),
        'liczniki kontaktow ukryte przed indeksacja',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

/** Replay pustego listingu dla kolejnych skrzynek indeksacji. */
async function replayEmptyBoxes(h: Harness): Promise<void> {
  const { f } = h;
  await waitRt(() => f.sent.includes('listy odebrane'), 'indeksacja: odebrane');
  f.fire('Nie masz zadnych odebranych listow.', 'mail');
  await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'indeksacja: nieprzeczytane');
  f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
  await waitRt(() => f.sent.includes('listy wyslane'), 'indeksacja: wyslane');
  f.fire('Nie masz zadnych wyslanych listow.', 'mail');
  await waitRt(() => f.sent.includes('listy niewyslane'), 'indeksacja: niewyslane');
  f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
}

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
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    // Kotwica paginacji: dzien PO najstarszym widocznym (21 XII -> 22 XII).
    await waitRt(
      () => f.sent.includes('listy odebrane przed 22 XII 2025'),
      'indeksacja: kotwica paginacji odebranych',
    );
    // Strona 2 kompletna (bez suffixu uciecia) - nowy prastary list.
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: prastary', 'mail');
    f.fire('Nadawca: Gronk                        S, 15 XI 2025, 10:00:00', 'mail');
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
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'toast konca indeksacji');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji indeksacji');

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

    // Kontakty odblokowane: Foo i Gronk licza sie, Corge nie.
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'wiersze kontaktow');
    const names = Array.from(
      h.content.querySelectorAll('.arkmail-contact-name') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(names.includes('Foo'), 'kontakt z zywych listow');
    assert.ok(names.includes('Gronk'), 'kontakt z dopisanej strony');
    assert.ok(!names.includes('Corge'), 'kontakt zniknietego listu odpada');
    // Stopka bramy: data indeksacji + rozmiar bazy (4 rekordy lacznie
    // ze zniknieta Corge).
    const foot = h.content.querySelector('.arkmail-index-foot') as unknown as {
      textContent?: string;
    } | null;
    assert.ok(foot, 'stopka indeksacji');
    assert.match(String(foot.textContent ?? ''), /^Ostatnia indeksacja: 20\d\d-\d\d-\d\d/);
    assert.ok(String(foot.textContent ?? '').includes('listow w bazie: 4'), 'rozmiar bazy');
  } finally {
    await stopHarness();
  }
});

test('guard: Pobierz tresci przy pustej niezindeksowanej bazie najpierw indeksuje', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-download'), 'przycisk pobierania');
    click(h, '.arkmail-arch-download'); // uzbrojenie (dwuklik)
    click(h, '.arkmail-arch-download'); // odpalenie
    await waitRt(() => notifyText(f, 'najpierw kliknij Indeksuj'), 'toast guarda pobierania');
    await replayEmptyBoxes(h);
    // Kontynuacja po indeksacji: pobieranie na pustej bazie = jasny
    // toast zamiast martwego "brak listow bez tresci".
    await waitRt(() => notifyText(f, 'Skrzynki sa puste'), 'toast pustych skrzynek');
  } finally {
    await stopHarness();
  }
});

test('guard: Zapisz wszystkie (ZIP) przy pustej niezindeksowanej bazie najpierw indeksuje', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-export'), 'przycisk eksportu');
    click(h, '.arkmail-arch-export');
    await waitRt(() => notifyText(f, 'najpierw kliknij Indeksuj'), 'toast guarda eksportu');
    await replayEmptyBoxes(h);
    await waitRt(
      () => notifyText(f, 'kliknij ponownie Zapisz wszystkie'),
      'toast kontynuacji eksportu',
    );
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
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy nieprzeczytane'), 'prolog: nieprzeczytane');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec prologu');
    // Otwarcie listu z re-kotwica (Fala 9a).
    const row = Array.from(
      h.content.querySelectorAll('.arkmail-entry') as unknown as Iterable<{
        textContent?: string;
        dispatchEvent(e: unknown): void;
      }>,
    ).find((r) => String(r.textContent ?? '').includes('jedyny'));
    assert.ok(row, 'wiersz listingu');
    row.dispatchEvent(new h.window.Event('click'));
    await waitRt(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: jedyny', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt');
    f.fire('List : 1', 'mail');
    f.fire('Od   : Corge', 'mail');
    f.fire('Temat: jedyny', 'mail');
    f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
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
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec odczytu');
    // Archiwum ma 1 list i ma juz tresc -> pobieranie konczy sie jasnym
    // toastem (nie martwym "brak listow bez tresci").
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
