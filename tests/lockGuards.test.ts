/**
 * Fala 20e (audyt race-condition, zgloszenie 2026-10-21): handlery
 * Odswiez / Szukaj / Wczytaj starsze / Wczytaj wszystkie nie mialy
 * guarda blokady sesji - klik w trakcie dlugiej operacji (petla
 * Wczytaj wszystkie, odczyt listu) CICHO KOLEJKOWAL komende, ktora
 * wystrzeliwala dopiero po zwolnieniu blokady (mlocenie serwera,
 * tosty spoznione o minuty, nieprzewidziane petle).
 *
 * Kontrakt: klik przy zajetej blokadzie = natychmiastowa odmowa
 * z toastem "Poczekaj, az skoncze biezaca operacje..." i ZEREM nowych komend
 * (jak reszta handlerow: Usun, Przekaz, Wyslij list itd.).
 * Wyjatki zachowane: drugi klik Wczytaj wszystkie = Przerwij (flaga
 * cancel PRZED guardem); wewnetrzne refreshBoxes po wysylce/kasowaniu
 * kolejkuje celowo (wołane z wnetrza sesji, nie z kliku).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  waitRt,
  click,
  notifyText,
} from './harness';

test('puste i wypelnione Szukaj podczas petli = odmowa, zero komend', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    // Start petli "Wczytaj wszystkie" - wysyla kotwice i CZEKA
    // (blokada sesji zajeta, petla wisi na odpowiedzi serwera).
    click(h, '.arkmail-older-all');
    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'kotwica petli');
    const sentBefore = f.sent.length;

    // Puste Szukaj odswieza skrzynke, wiec korzysta z tej samej blokady.
    click(h, '.arkmail-search-go');
    assert.ok(notifyText(f, 'Poczekaj, az skoncze biezaca operacje'), 'toast odmowy: puste Szukaj');
    assert.equal(f.sent.length, sentBefore, 'puste Szukaj nie wysyla komendy przy blokadzie');

    // Szukaj z niepustym zapytaniem: jw.
    const osoba = h.content.querySelector('.arkmail-search-row input') as { value: string };
    osoba.value = 'Bar';
    click(h, '.arkmail-search-go');
    assert.ok(notifyText(f, 'Poczekaj, az skoncze biezaca operacje'), 'toast odmowy: Szukaj');
    assert.equal(f.sent.length, sentBefore, 'Szukaj nie wysyla komendy przy blokadzie');

    // ("Wczytaj starsze" podczas petli nie istnieje w UI - petla chowa
    // paginacje; guard onLoadOlder pokrywa test "podczas odczytu".)

    // Domkniecie: drugi klik Wczytaj wszystkie = Przerwij (flaga cancel
    // PRZED guardem - mechanizm zachowany), pusta kotwica konczy petle.
    click(h, '.arkmail-older-all');
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
    // Po zwolnieniu blokady NIC nie dochodzi (odmowy nie kolejkowaly).
    assert.equal(f.sent.length, sentBefore, 'zero odroczonych komend po zwolnieniu blokady');
  } finally {
    await stopHarness();
  }
});

test('Wczytaj wszystkie podczas odczytu listu = odmowa, zero komend', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    // Otwarcie listu z re-kotwica: kontekst serwera po prologu to
    // nieprzeczytane, wiec resolveEntry najpierw doswieza listing
    // odebranych - blokada sesji zajeta, komenda WISI bez odpowiedzi.
    click(h, '.arkmail-entry');
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica odczytu');
    const sentBefore = f.sent.length;

    click(h, '.arkmail-older-all');
    assert.ok(notifyText(f, 'Poczekaj, az skoncze biezaca operacje'), 'toast odmowy: Wczytaj wszystkie');
    assert.equal(f.sent.length, sentBefore, 'Wczytaj wszystkie nie startuje przy blokadzie');

    // Wczytaj starsze (paginacja widoczna - lista zostaje w panelu): jw.
    click(h, '.arkmail-older');
    assert.ok(notifyText(f, 'Poczekaj, az skoncze biezaca operacje'), 'toast odmowy: Wczytaj starsze');
    assert.equal(f.sent.length, sentBefore, 'Wczytaj starsze nie wysyla komendy przy blokadzie');

    // Domkniecie: pusta odpowiedz re-kotwicy (wpis "nie znaleziony")
    // zamyka sesje odczytu bez otwierania listu.
    f.fire('Nie znaleziono zadnych takich odebranych listow.', 'mail');
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji');
    assert.equal(f.sent.length, sentBefore, 'po sesji zadnej petli ani odroczonych komend');
  } finally {
    await stopHarness();
  }
});
