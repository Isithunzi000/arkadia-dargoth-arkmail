/**
 * Re-kotwiczenie komend pagerowych (Fala 9a).
 *
 * Problem: serwer interpretuje "przeczytaj list N" w kontekscie OSTATNIEGO
 * listingu. Po "Wczytaj starsze/wszystkie" albo szukaniu ostatnim listingiem
 * jest inna strona niz ta, z ktorej pochodzi klikany wpis - surowy numer
 * otworzyly ZLY list. Plugin trzyma kontekst (ctx) per pobrany listing i
 * dla wpisu ze starego kontekstu najpierw pobiera strone po dacie listu,
 * odnajduje wpis po tozsamosci (osoba+temat+data+forwarded) i dopiero
 * wtedy wysyla "przeczytaj list <swiezy numer>".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

/** Dokleja starsza strone (2 wpisy, 20/19 XII) przez "Wczytaj starsze". */
async function loadOlderPage(h: Harness): Promise<void> {
  const { f, waitFor } = h;
  click(h, '.arkmail-older');
  await waitFor(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'kotwica paginacji');
  f.fire('Wybrane listy odebrane:', 'mail');
  f.fire(' 2. *R* Temat: prastary', 'mail');
  f.fire('Nadawca: Waldo                          So, 21 VIII 1999, 10:00:00', 'mail');
  f.fire(' 1. *R* Temat: antyczny', 'mail');
  f.fire('Nadawca: Baz                          Pt, 20 VIII 1999, 09:00:00', 'mail');
  f.fire('> ', 'prompt');
  await waitFor(
    () => h.content.querySelectorAll('.arkmail-entry').length === 5,
    '5 wierszy po doklejeniu strony',
  );
}

/** Odtwarza swiezy listing, w ktorym "najnowszy" (Corge 23 XII) ma numer 2. */
function replayFreshListing(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: inny', 'mail');
  f.fire('Nadawca: Grault                         Wt, 24 VIII 1999, 01:00:00', 'mail');
  f.fire(' 2. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire(' 1. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire('> ', 'prompt');
}

/** Odtwarza otwarcie listu numer N w pagerze i wyjscie. */
function replayLetter(h: Harness, n: number): void {
  const { f } = h;
  f.fire(`List : ${n}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire('Tresc karteczki.', 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${n}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('re-kotwiczenie: wpis ze starej strony pobiera swiezy kontekst i numer', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);

    // Klik w NAJNOWSZY wiersz (23 XII) - pochodzi z pierwszej strony,
    // a ostatnim listingiem serwera jest doklejona strona starsza.
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.includes('listy odebrane przed 25 VIII 1999'),
      're-kotwica: listing po dacie listu (dzien po)',
    );
    replayFreshListing(h);
    await waitFor(() => f.sent.includes('przeczytaj list 2'), 'przeczytaj ze swiezym numerem 2');
    replayLetter(h, 2);
    await waitFor(() => !!h.content.querySelector('.arkmail-letter-body'), 'widok listu otwarty');
  } finally {
    await stopHarness();
  }
});

test('re-kotwiczenie: wpis z biezacego kontekstu otwiera sie bez dodatkowego fetchu', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    // Fala 14f: prolog konczy sie PUSTYM listingiem nieprzeczytanych, ktory
    // nadpisuje kontekst serwera - zeby wpis odebranych byl biezacy,
    // najpierw odswiezamy skrzynke odebranych (klik w jej przycisk).
    click(h, '[data-box="odebrane"]');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'refresh odebranych po prologu',
    );
    // Swiezy listing identyczny z prologiem: "najnowszy" ma numer 1.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec refreshu');
    const sentBefore = f.sent.length;
    click(h, '.arkmail-entry'); // najnowszy - biezacy kontekst po refreshu
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'przeczytaj list 1');
    // Zero nowych listingow po kliku - tylko komenda czytania.
    assert.equal(
      f.sent.slice(sentBefore).filter((c) => c.startsWith('listy')).length,
      0,
    );
  } finally {
    await stopHarness();
  }
});

test('re-kotwiczenie: wpis nie znaleziony na swiezym listingu -> komunikat, brak przeczytaj', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    await loadOlderPage(h);

    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.includes('listy odebrane przed 25 VIII 1999'),
      're-kotwica: listing po dacie listu',
    );
    // Swiezy listing BEZ kliknietego listu (skasowany w miedzyczasie).
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: inny', 'mail');
    f.fire('Nadawca: Grault                         Wt, 24 VIII 1999, 01:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => notifyText(f, 'odswiez skrzynke'), 'komunikat o braku listu');
    assert.ok(!f.sent.some((c) => c.startsWith('przeczytaj')), 'nie wyslano przeczytaj na slepo');
  } finally {
    await stopHarness();
  }
});

test('re-kotwiczenie: kasowanie po zmianie kontekstu uzywa swiezego numeru', async () => {
  const h = await startHarness();
  const { f, waitFor } = h;
  try {
    await loadTruncatedBox(h);
    // Fala 14f: prolog konczy sie pustym listingiem nieprzeczytanych,
    // wiec otwarcie najnowszego listu idzie przez re-kotwice.
    click(h, '.arkmail-entry');
    await waitFor(
      () => f.sent.includes('listy odebrane przed 25 VIII 1999'),
      're-kotwica przed otwarciem',
    );
    replayFreshListing(h);
    await waitFor(() => f.sent.includes('przeczytaj list 2'), 'przeczytaj list 2');
    replayLetter(h, 2);
    await waitFor(() => !!h.content.querySelector('.arkmail-del'), 'widok listu z Usun');

    // Fala 11f: po odczycie plugin odswieza skrzynke - ten refresh
    // NADPISUJE kontekst listingu serwera (stampEntries).
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 2,
      'refresh po odczycie (11f)',
    );
    replayFreshListing(h);

    // Nowa poczta w tle: kolejny refresh (merge).
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length === 3,
      'refresh po powiadomieniu',
    );
    replayFreshListing(h);
    await waitFor(
      () => f.sent.filter((c) => c === 'listy nieprzeczytane').length === 2,
      'refresh nieprzeczytanych',
    );
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec refreshu');

    // Usun: zrodlowy wpis listu ma stary kontekst -> re-kotwica.
    // Fala 14e: dwuklik (pierwszy klik tylko uzbraja przycisk).
    click(h, '.arkmail-del');
    click(h, '.arkmail-del');
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane przed 25 VIII 1999').length === 2,
      're-kotwica przed kasowaniem (druga - pierwsza byla przy otwarciu)',
    );
    // Na tej stronie "najnowszy" ma numer 4.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 5. *R* Temat: zupelnie inny', 'mail');
    f.fire('Nadawca: Zump                          Wt, 24 VIII 1999, 03:00:00', 'mail');
    f.fire(' 4. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('przeczytaj list 4'), 'swiezy numer 4 do pagera');
    replayLetter(h, 4);
    await waitFor(() => f.sent.includes('d 4'), 'zaznaczenie 4 do skasowania');
    f.fire('Zaznaczono do skasowania: 4.', 'mail');
    // Po potwierdzeniu serwer WRACA do promptu pagera - dopiero wtedy q.
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 4) -- ', 'mail');
    f.fire('Kasuje listy...', 'mail');
    f.fire('Kasuje: 4.', 'mail');
    f.fire('> ', 'prompt');
    // Fala 14e: pager (d N -> q) kasuje list FAKTYCZNIE przy wyjsciu -
    // toast mowi o skutku, nie o zaznaczeniu.
    await waitFor(() => notifyText(f, 'List zostal usuniety.'), 'notify o skasowaniu');
  } finally {
    await stopHarness();
  }
});
