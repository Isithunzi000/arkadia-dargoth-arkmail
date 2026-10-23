/**
 * Widoczny compose + echo wysylek (Fala 28h, decyzja 2026-10-23).
 *
 * Stan sprzed: compose szedl cicho - wysylki bez echa, a linie
 * pocztowe (cls mail) pod blokada sesji gagowane, wiec gracz nie
 * widzial ani co napisal, ani wyniku. Compose nie spamuje (krotki
 * dialog), wiec:
 *  - EditorSession wysyla z echem (jak reczne pisanie),
 *  - linie mail POD COMPOSE przechodza do glownego okna (prompty
 *    Adresat:/Temat:/DW:, numeracja, wynik ok/blad),
 *  - listingi/tresci (spam) gagowane jak dotychczas,
 *  - "wyslij zwierze" z przycisku tez z echem (lot zwierzecia locka
 *    nie bierze, linie lotu gagowane nie sa).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, stopHarness, click, textOf, waitRt } from './harness';

test('gag: compose widoczny w oknie gry (prompty i wynik nie gagowane)', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    const setField = (name: string, value: string) => {
      const el = content.querySelector(`[data-field="${name}"]`) as unknown as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      el.value = value;
      el.dispatchEvent(new h.window.Event('input'));
    };
    click(h, '[data-tab="napisz"]');
    setField('adresat', 'Corge');
    setField('temat', 'Perly');
    setField('tresc', 'czesc');
    click(h, '.arkmail-send');
    await waitFor(() => f.sent.includes('napisz list'), 'compose wystartowal');

    // Dialog composera: NIE gagowany (gracz widzi, co sie dzieje).
    f.fire('Adresat: Temat: DW: ', 'mail');
    await waitRt(() => f.sent.includes('**'), 'tresc poszla');
    f.fire('List jest gotowy do wyslania.', 'mail');
    f.fire('> ', 'prompt');
    assert.ok(!f.gagged.includes('Adresat: Temat: DW: '), 'prompty composera widoczne');
    assert.ok(
      !f.gagged.includes('List jest gotowy do wyslania.'),
      'wynik composera widoczny',
    );

    // Refresh niewyslanych po compose: POD lockiem, po zamknieciu
    // composera - listingowy spam gagowany jak dawniej.
    await waitFor(() => f.sent.includes('listy niewyslane'), 'refresh po compose');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec compose');
    assert.ok(
      f.gagged.includes('Nie masz zadnych niewyslanych listow.'),
      'listingowy spam po compose dalej gagowany',
    );
  } finally {
    await stopHarness();
  }
});

test('echo: wysylki composera i "wyslij zwierze" ida z echem, listingi bez', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    // Prolog: listingi pluginu bez echa (jak dawniej).
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(() => f.sent.includes('listy odebrane'), 'prolog');
    const echoOf = (line: string) => f.sentEcho[f.sent.indexOf(line)];
    assert.equal(echoOf('listy odebrane'), false, 'listing bez echa');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec prologu');

    const setField = (name: string, value: string) => {
      const el = content.querySelector(`[data-field="${name}"]`) as unknown as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      el.value = value;
      el.dispatchEvent(new h.window.Event('input'));
    };
    click(h, '[data-tab="napisz"]');
    setField('adresat', 'Corge');
    setField('temat', 'Perly');
    setField('tresc', 'czesc');
    click(h, '.arkmail-send');
    await waitFor(() => f.sent.includes('napisz list'), 'compose wystartowal');
    assert.equal(echoOf('napisz list'), true, 'napisz list z echem');
    assert.equal(echoOf('Corge'), true, 'adresat z echem');
    f.fire('Adresat: Temat: DW: ', 'mail');
    await waitRt(() => f.sent.includes('**'), 'tresc poszla');
    assert.equal(echoOf('Perly'), true, 'temat z echem');
    assert.equal(echoOf('**'), true, '** z echem');
    f.fire('List jest gotowy do wyslania.', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('listy niewyslane'), 'refresh po compose');
    f.fire('Nie masz zadnych niewyslanych listow.', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec compose');

    // Zwierze z przycisku (zakladka Listy): echo + linie lotu widoczne.
    click(h, '[data-tab="listy"]');
    await waitRt(() => content.querySelector('.arkmail-animal-send') !== null, 'przycisk zwierzecia');
    const idx = f.sent.length;
    click(h, '.arkmail-animal-send');
    assert.equal(f.sent[idx], 'wyslij zwierze', 'komenda zwierzecia');
    assert.equal(f.sentEcho[idx], true, 'wyslij zwierze z echem');
    const gagCount = f.gagged.length;
    f.fire('Wysylasz Kruk na poczte.', 'mail');
    assert.equal(f.gagged.length, gagCount, 'linia lotu nie gagowana');
  } finally {
    await stopHarness();
  }
});
