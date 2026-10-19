/**
 * Gagowanie linii pocztowych podczas operacji pluginowych (Fala 16j).
 *
 * Zgloszenie 2026-10-19: listingi i tresci listow pobierane przez plugin
 * smieca w glownym oknie gry. Linie pocztowe (cls 'mail') przychodzace
 * PODCZAS operacji pluginowej (blokada sesji) maja byc stlumione
 * (trigger zwraca null). Linie poza operacja - gracz sam pisze "listy",
 * powiadomienie POCZTA - zostaja widoczne. Prompt gry zawsze widoczny.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, loadTruncatedBox, click, type Harness } from './harness';

/** Pager: naglowki + body + prompt pagera i gry (jak archiveOpen). */
function replayLetter(h: Harness, numer: number, body: string): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire('Temat: najnowszy', 'mail');
  f.fire('Data : Wt, 23 XII 2025, 00:11:12', 'mail');
  f.fire('', 'mail');
  f.fire(body, 'mail');
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

test('gag: listing pluginowy stlumiony, reczny listing i prompt widoczne', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    // Poza operacja pluginowa: gracz sam pisze "listy" - widoczne.
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: reczny listing', 'mail');
    assert.equal(f.gagged.length, 0, 'poza operacja nic nie jest gagowane');

    // Powiadomienie o nowej poczcie: poza blokada -> widoczne.
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    assert.equal(f.gagged.length, 0, 'powiadomienie POCZTA zostaje widoczne');

    // Auto-refresh pluginu: linie listingowe gagowane, prompt nie.
    await waitFor(() => f.sent.includes('listy odebrane'), 'komenda listy odebrane');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    assert.ok(
      f.gagged.includes('Listy odebrane (prezentowane jest pierwsze 50):'),
      'naglowek listingowego pluginu gagowany',
    );
    assert.ok(f.gagged.includes(' 1. *R* Temat: najnowszy'), 'wpis listingowy pluginu gagowany');
    assert.ok(
      !f.gagged.includes('> ') && !f.gagged.includes('Listy odebrane:'),
      'prompt i reczny listing nietkniete',
    );

    // Druga skrzynka prologu: pusty listing nieprzeczytanych tez gagowany.
    await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'komenda listy nieprzeczytane');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    f.fire('> ', 'prompt');
    assert.ok(
      f.gagged.includes('Nie masz zadnych nieprzeczytanych listow.'),
      'pusty listing pluginu gagowany',
    );

    // Koniec operacji: kolejne linie pocztowe znowu widoczne.
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec sesji prologu');
    const gagCount = f.gagged.length;
    f.fire('Listy wyslane:', 'mail');
    assert.equal(f.gagged.length, gagCount, 'po operacji linie pocztowe widoczne');
  } finally {
    await stopHarness();
  }
});

test('gag: odczyt listu stumliony w calosci, prompt gry widoczny', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    const gaggedBase = f.gagged.length;

    click(h, '.arkmail-entry');
    await waitFor(() => f.sent.includes('listy odebrane przed 24 XII 2025'), 're-kotwica');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('przeczytaj list 1'), 'odczyt');
    replayLetter(h, 1, 'Tresc najtajniejsza.');
    await waitFor(() => !!content.querySelector('.arkmail-letter-body'), 'list otwarty');

    // Naglowki, tresc i prompt pagera stlumione; prompt gry nie.
    for (const line of [
      'List : 1',
      'Od   : Corge',
      'Temat: najnowszy',
      'Tresc najtajniejsza.',
      '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ',
    ]) {
      assert.ok(f.gagged.slice(gaggedBase).includes(line), `gagowany: ${line}`);
    }
    assert.ok(!f.gagged.includes('> '), 'prompt gry zawsze widoczny');

    // Refresh po odczycie (Fala 11f): tez pod blokada, tez gagowany.
    await waitFor(
      () => f.sent.filter((c) => c === 'listy odebrane').length >= 2,
      'refresh po odczycie',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec refreshu');

    // Po wszystkim: reczny listing gracza znowu widoczny.
    const gagCount = f.gagged.length;
    f.fire('Listy odebrane:', 'mail');
    assert.equal(f.gagged.length, gagCount, 'po operacji reczny listing widoczny');
  } finally {
    await stopHarness();
  }
});
