/**
 * Re-login / znikniecie listingu serwera (Fala 16c).
 *
 * Problem (log sesji 1.9.0, 2026-10-19): po reconnectu klienta (nowe
 * logowanie 17:13:01) serwerowa sesja NIE MA "biezacego listingu".
 * Plugin trzymal stary kontekst {box, stamp} sprzed polaczenia, wiec
 * klik w list strzelal "przeczytaj list N" na slepo i dostawal
 * "Zadne listy nie zostaly wybrane." (17:13:14 i 17:13:17) -
 * "nie moge kliknac i wyswietlic zadnego listu" (zgloszenie pkt 3/13).
 *
 * Kontrakt:
 *  - client.connect / client.disconnect uniewazniaja kontekst listingu
 *    i odpalaja swiezy refresh skrzynek (widok dostaje nowe stemple);
 *  - blad pagera "listing zniknal" ("Zadne listy nie zostaly wybrane.",
 *    "Zly numer listu: N.") przy odczycie = JEDNA druga szansa:
 *    wymuszona re-kotwica po dacie i ponowny odczyt; powtorka = toast
 *    bledu, bez trzeciej proby.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  notifyText,
  type Harness,
} from './harness';

/** Listing odebranych: najnowszy (Corge 23 XII) = numer 1. */
function replayListingA(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

/** Listing po re-kotwicy: najnowszy (Corge 23 XII) = numer 2. */
function replayListingB(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: inny', 'mail');
  f.fire('Nadawca: Grault                         Wt, 23 XII 2025, 01:00:00', 'mail');
  f.fire(' 2. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire(' 1. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire('> ', 'prompt');
}

/** Pager: naglowki + body najnowszego listu + prompt pagera i gry. */
function replayLetter(h: Harness, numer: number): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire('Tresc najnowszego.', 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

/**
 * Setup: otwiera najnowszy list (przez re-kotwice po prologu) i domyka
 * refresh po odczycie (Fala 11f) listingiem A. Po powrocie kontekst
 * odebranych jest SWIEZY: klik w wpis strzela "przeczytaj" od razu.
 */
async function openAndRefresh(h: Harness): Promise<void> {
  const { f, waitFor, content } = h;
  click(h, '.arkmail-entry'); // najnowszy; prolog konczyl sie pustym listingiem
  await waitFor(
    () => f.sent.includes('listy odebrane przed 24 XII 2025'),
    'setup: re-kotwica po pustym prologu',
  );
  replayListingB(h);
  await waitFor(() => f.sent.includes('przeczytaj list 2'), 'setup: odczyt po re-kotwicy');
  replayLetter(h, 2);
  await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'setup: list otwarty');
  // Powrot do listy - kolejne kroki klikaja w wpisy (waskie okno: widok
  // listu zastepuje liste w DOM).
  click(h, '.arkmail-older'); // "Zamknij list"
  await waitFor(() => !!content.querySelector('.arkmail-entry'), 'setup: powrot do listy');
  await waitFor(
    () => f.sent.filter((c) => c === 'listy odebrane').length >= 2,
    'setup: refresh po odczycie',
  );
  replayListingA(h); // najnowszy = 1, swiezy kontekst
  await waitFor(() => !content.querySelector('.arkmail-busy'), 'setup: koniec refreshu');
}

test('re-login: client.connect uniewaznia kontekst i odswieza skrzynki', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await openAndRefresh(h);
    const base = f.sent.length;

    f.fireEvent('client.connect', undefined);
    await waitFor(
      () => f.sent.slice(base).includes('listy odebrane'),
      'auto-refresh odebranych po connect',
    );
    replayListingA(h);
    await waitFor(
      () => f.sent.slice(base).includes('listy nieprzeczytane'),
      'auto-refresh nieprzeczytanych',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitFor(
      () => f.sent.slice(base).includes('listy wyslane'),
      'auto-refresh wyslanych',
    );
    f.fire('Nie masz zadnych wyslanych listow.', 'mail');
    await waitFor(
      () => f.sent.slice(base).includes('listy niewyslane'),
      'auto-refresh niewyslanych',
    );
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    await waitFor(
      () => !content.querySelector('.arkmail-busy'),
      'koniec refreshu po connect',
    );

    // Po re-loginie kontekst jest uniewazniony: klik NIE strzela numerem
    // na slepo (stary kod: "przeczytaj" -> "Zadne listy nie zostaly
    // wybrane."), tylko idzie przez re-kotwice i odczyt dziala.
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.slice(base).includes('listy odebrane przed 24 XII 2025'),
      're-kotwica po re-loginie',
    );
    replayListingA(h);
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 1'),
      'odczyt po re-loginie',
    );
    replayLetter(h, 1);
    await waitFor(
      () => !!content.querySelector('.arkmail-letter-body'),
      'list otwarty po re-loginie',
    );
  } finally {
    await stopHarness();
  }
});

test('re-login: "Zadne listy nie zostaly wybrane" = re-kotwica i druga szansa', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await openAndRefresh(h);
    const base = f.sent.length;

    // Kontekst wyglada na swiezy, ale listing serwera zniknal (re-login
    // bez zdarzenia connect, cudzy listing gracza miedzy operacjami).
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 1'),
      'pierwsza proba odczytu',
    );
    f.fire('Zadne listy nie zostaly wybrane.', 'mail');
    await waitFor(
      () => f.sent.slice(base).includes('listy odebrane przed 24 XII 2025'),
      'wymuszona re-kotwica po bledzie',
    );
    replayListingB(h);
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 2'),
      'ponowny odczyt ze swiezym numerem',
    );
    replayLetter(h, 2);
    await waitFor(
      () => !!content.querySelector('.arkmail-letter-body'),
      'list otwarty po drugiej szansie',
    );
    assert.ok(!notifyText(f, 'Nie udalo sie odczytac'), 'bez toasta bledu');
  } finally {
    await stopHarness();
  }
});

test('re-login: powtorka bledu = toast, dokladnie dwie proby odczytu', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    await openAndRefresh(h);
    const base = f.sent.length;

    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 1'),
      'pierwsza proba odczytu',
    );
    f.fire('Zadne listy nie zostaly wybrane.', 'mail');
    await waitFor(
      () => f.sent.slice(base).includes('listy odebrane przed 24 XII 2025'),
      're-kotwica po pierwszym bledzie',
    );
    replayListingB(h);
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 2'),
      'druga proba odczytu',
    );
    f.fire('Zadne listy nie zostaly wybrane.', 'mail');
    await waitFor(
      () => notifyText(f, 'Nie udalo sie odczytac listu.'),
      'toast bledu po powtorce',
    );
    const reads = f.sent.slice(base).filter((c) => c.startsWith('przeczytaj')).length;
    assert.equal(reads, 2, 'dokladnie dwie proby, bez trzeciej');
  } finally {
    await stopHarness();
  }
});

test('re-login: "Zly numer listu" (desynchronizacja) tez dostaje druga szanse', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    await openAndRefresh(h);
    const base = f.sent.length;

    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 1'),
      'pierwsza proba odczytu',
    );
    f.fire('Zly numer listu: 1.', 'mail');
    await waitFor(
      () => f.sent.slice(base).includes('listy odebrane przed 24 XII 2025'),
      'wymuszona re-kotwica po zlym numerze',
    );
    replayListingB(h);
    await waitFor(
      () => f.sent.slice(base).includes('przeczytaj list 2'),
      'ponowny odczyt ze swiezym numerem',
    );
    replayLetter(h, 2);
    await waitFor(
      () => !!content.querySelector('.arkmail-letter-body'),
      'list otwarty po drugiej szansie',
    );
  } finally {
    await stopHarness();
  }
});
