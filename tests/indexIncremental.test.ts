/**
 * Fala 24e: indeksacja incrementalna.
 *
 * Pelny przeczes 4 skrzynek przy kazdej indeksacji mieli serwer i
 * trwa minuty, a swieza baza (stamp <= 7 dni) nie wymaga pelnego
 * przejscia - wystarczy dojsc do KLAMRY: strony w calosci znanej
 * z archiwum (przeciecie z posiadana baza). Klamra NIE jest
 * mieleniem: mielenie = strona powtorzona z tej samej petli
 * (straznik freshCount, Fala 9d/24d), klamra = strona nowa dla
 * petli, ale bez nowych wpisow dla archiwum.
 *
 * Klamra domyka skrzynke bez stampa (stamp = pelna weryfikacja,
 * daje ja dopiero pelny przeces / naturalny koniec stron / loadAll
 * z Fali 24c) i z gone-markingiem ZAKRESOWYM: tylko rekordy nowsze
 * niz najstarszy widziany dzien (strony sa ciagle od najnowszego,
 * wiec wszystko nowsze musialo przejsc przez pobrane strony);
 * dzien graniczny jest nietkniety (klamra mogla uciac go w polowie
 * strony).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexSweepMode, INDEX_FULL_SWEEP_AGE_MS } from '../src/arkmail/index';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  waitRt,
  click,
  notifyText,
  type Harness,
} from './harness';

test('tryb przeczesu: brak stampa lub stamp > 7 dni = pelny, inaczej incrementalny', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(INDEX_FULL_SWEEP_AGE_MS, 7 * 24 * 60 * 60 * 1000, 'prog pelnego przeczesu');
  // brak stampa = pelny
  assert.equal(indexSweepMode({}, 'odebrane', now), 'full');
  // stamp swiezy = incrementalny
  assert.equal(
    indexSweepMode({ odebrane: '2026-10-21T10:00:00.000Z' }, 'odebrane', now),
    'incremental',
  );
  // granica: dokladnie 7 dni = jeszcze incrementalny
  assert.equal(
    indexSweepMode(
      { odebrane: new Date(now - INDEX_FULL_SWEEP_AGE_MS).toISOString() },
      'odebrane',
      now,
    ),
    'incremental',
  );
  // 7 dni + 1 ms = pelny
  assert.equal(
    indexSweepMode(
      { odebrane: new Date(now - INDEX_FULL_SWEEP_AGE_MS - 1).toISOString() },
      'odebrane',
      now,
    ),
    'full',
  );
  // uszkodzony stamp = pelny (bezpieczna strona)
  assert.equal(indexSweepMode({ odebrane: 'nie-data' }, 'odebrane', now), 'full');
});

/** Indeksacja z klikiem w przycisk archiwum. */
async function startIndexing(h: Harness): Promise<void> {
  click(h, '[data-tab="archiwum"]');
  await waitRt(() => !!h.content.querySelector('.arkmail-index-all'), 'przycisk indeksacji');
  click(h, '.arkmail-index-all');
}

/** Obsluga pustych skrzynek indeksacji (nieprzeczytane/wyslane/niewyslane). */
async function drainEmptyBoxes(
  h: Harness,
  counts: { nieprzeczytane: number; wyslane: number; niewyslane: number },
): Promise<void> {
  const { f } = h;
  await waitRt(
    () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === counts.nieprzeczytane,
    'indeksacja: nieprzeczytane',
  );
  f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
  await waitRt(
    () => f.sent.filter((c) => c === 'listy wyslane').length === counts.wyslane,
    'indeksacja: wyslane',
  );
  f.fire('Nie masz zadnych wyslanych listow.', 'mail');
  await waitRt(
    () => f.sent.filter((c) => c === 'listy niewyslane').length === counts.niewyslane,
    'indeksacja: niewyslane',
  );
  f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
}

test('klamra: incrementalny przeczes staje na stronie znanej z archiwum, gone-marking zakresowy (Fala 24e)', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);

    // --- FAZA 1: pelna indeksacja (brak stampow) - stampuje 4/4.
    await startIndexing(h);
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'faza 1: odebrane',
    );
    // Strona 1 ucieta: 3 wpisy jak w prologu.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy odebrane przed 22 XII 2025'), 'faza 1: kotwica');
    // Strona 2 kompletna: 3 starsze wpisy (dwa z tego samego dnia).
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 3. *R* Temat: stary', 'mail');
    f.fire('Nadawca: Baz                          Pn, 10 XI 2025, 08:00:00', 'mail');
    f.fire(' 2. *R* Temat: drugi prastary', 'mail');
    f.fire('Nadawca: Gronk                        So, 15 XI 2025, 09:00:00', 'mail');
    f.fire(' 1. *R* Temat: prastary', 'mail');
    f.fire('Nadawca: Gronk                        So, 15 XI 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await drainEmptyBoxes(h, { nieprzeczytane: 2, wyslane: 1, niewyslane: 1 });
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'faza 1: toast 4/4');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'faza 1: koniec sesji');

    // --- Zmiany na serwerze: doszedl 'swiezak' (24 XII), 'najnowszy'
    // (23 XII) skasowany. Archiwum ma: najstarszy, srodkowy, najnowszy,
    // stary, drugi prastary, prastary.

    // --- FAZA 2: stamp swiezy = przeczes INCREMENTALNY.
    await startIndexing(h);
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 3,
      'faza 2: odebrane',
    );
    // Strona 1 ucieta: nowy 'swiezak' + znany 'srodkowy' (bez
    // 'najnowszego' - zniknal z serwera). Upsert dopisuje 1 -> to NIE
    // klamra, petla leci dalej.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: swiezak', 'mail');
    f.fire('Nadawca: Jinx                        Wt, 24 XII 2025, 07:30:00', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 XII 2025'), 'faza 2: kotwica 1');
    // Strona 2 ucieta: W CALOSCI znana z archiwum ('prastary' 15 XI,
    // 'najstarszy' 21 XII), ale nowa dla petli = KLAMRA. Petla staje;
    // kotwica przed 16 XI NIE moze wyjsc.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: prastary', 'mail');
    f.fire('Nadawca: Gronk                        So, 15 XI 2025, 10:00:00', 'mail');
    f.fire(' 1. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire('> ', 'prompt');
    // Poczekaj dluzej niz pacing: stary kod (bez klamry) wyslalby
    // kolejna kotwice; domykamy ja pusta strona, zeby test dojechal
    // asercji (dowod RED przez asercje, nie przez timeout).
    await new Promise((r) => setTimeout(r, 700));
    if (f.sent.includes('listy odebrane przed 16 XI 2025')) {
      f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    }
    await drainEmptyBoxes(h, { nieprzeczytane: 3, wyslane: 2, niewyslane: 2 });
    await waitRt(() => notifyText(f, 'Zindeksowano wszystkie skrzynki'), 'faza 2: toast 4/4');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'faza 2: koniec sesji');

    assert.ok(
      !f.sent.includes('listy odebrane przed 16 XI 2025'),
      'klamra: kotwica ponizej przeciecia nie wyszla',
    );

    // Archiwum po fazie 2:
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-arch-entry'), 'wiersze archiwum');
    const texts = Array.from(
      h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    // 'najnowszy' (23 XII): nowszy niz dzien graniczny (15 XI), nie
    // widziany w fazie 2 -> zniknal z serwera, wiersz ukryty.
    assert.ok(texts.every((t) => !t.includes('najnowszy')), 'skasowany list oznaczony (ukryty)');
    // 'swiezak' dopisany i zywy.
    assert.ok(texts.some((t) => t.includes('swiezak')), 'nowy list z fazy 2');
    // 'stary' (10 XI): ponizej klamry, nie sprawdzany -> ZYWY (pelny
    // gone-marking oznaczylby go blednie).
    assert.ok(texts.some((t) => t.includes('stary')), 'rekord ponizej klamry nietkniety');
    // 'drugi prastary' (15 XI): DOKLADNIE dzien graniczny, nie widziany
    // w fazie 2 -> guard dnia granicznego, ZYWY.
    assert.ok(
      texts.some((t) => t.includes('drugi prastary')),
      'rekord z dnia granicznego nietkniety (guard)',
    );
  } finally {
    await stopHarness();
  }
});
