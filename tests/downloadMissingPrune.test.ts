/**
 * Fala 31: parowanie purge'u archiwum z widokiem skrzynki przy
 * pobieraniu tresci.
 *
 * Analiza (pelna, nie kodowana w Fali 28): wszystkie sciezki
 * fizycznego usuwania rekordow archiwum paruja sie z
 * pruneGoneFromView - OPROCZ galezi 'missing' w petli pobierania
 * tresci (index.ts). Skutek: list znika z archiwum, ale martwy
 * wiersz zostaje w widoku skrzynki i jest klikalny.
 *
 * Scenariusz: 3 listy w odebranych, pobieranie tresci, pierwszy
 * kandydat (najnowszy) zniknal z serwera -> jego grupa wypada z
 * archiwum (to juz dzialo) I jego wiersz ma zniknac z widoku (RED).
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

const anchors = (h: { f: { sent: string[] } }): string[] =>
  h.f.sent.filter((c) => / przed \d+ [IVX]+ \d{4}$/.test(c));

/** Start pobierania z zakladki Archiwum (uzbrojenie + start). */
async function startDownload(h: Harness): Promise<void> {
  const btn = (): { dispatchEvent(e: unknown): void } => {
    const b = h.content.querySelector('.arkmail-arch-download') as unknown as {
      dispatchEvent(e: unknown): void;
    } | null;
    assert.ok(b, 'przycisk pobierania istnieje');
    return b;
  };
  btn().dispatchEvent(new h.window.Event('click'));
  btn().dispatchEvent(new h.window.Event('click'));
  await waitRt(() => anchors(h).length === 1, 'pierwsza re-kotwica petli');
}

test('missing przy pobieraniu: grupa wypada z archiwum I wiersz znika z widoku', async () => {
  const h = await startHarness();
  const { f, content } = h;
  try {
    await loadTruncatedBox(h); // 3 listy: najstarszy/srodkowy (Foo), najnowszy (Corge)

    click(h, '[data-tab="archiwum"]');
    await startDownload(h);

    // Re-kotwica 1: szukamy najnowszego (Corge, 24 VIII). Listing bez
    // niego -> kind 'missing' -> purge rekordu. Listing zawiera srodkowego
    // (juz w archiwum - dopasowanie tresci, zero duplikatu), zeby liczba
    // rekordow po purgu byla miarodajna (listingi re-kotwic tez trafiaja
    // do archiwum).
    await waitRt(() => anchors(h).length === 1, 're-kotwica 1');
    f.fire('Listy odebrane:', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('> ', 'prompt');

    // Fala 41: missing z odebranych zamyka sie dopiero po probie
    // pozostalych skrzynek (replica moze istniec gdzie indziej) - 3
    // kolejne kotwice, kazda z pustym listingiem.
    const emptyLine: Record<string, string> = {
      nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
      wyslane: 'Nie masz zadnych wyslanych listow.',
      niewyslane: 'Nie masz zadnych niewyslanych listow.',
    };
    for (const box of ['nieprzeczytane', 'wyslane', 'niewyslane']) {
      await waitRt(
        () => f.sent.some((c) => c.startsWith(`listy ${box} przed`)),
        `kotwica missing: ${box}`,
      );
      f.fire(emptyLine[box]!, 'mail');
      f.fire('> ', 'prompt');
    }

    // Re-kotwica 2: srodkowy (Foo, 23 VIII) - pelny odczyt.
    await waitRt(
      () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length === 2,
      're-kotwica 2',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((c) => c.startsWith('przeczytaj list')).length === 1,
      'odczyt srodkowego',
    );
    f.fire('List : 1', 'mail');
    f.fire('Od   : Foo', 'mail');
    f.fire('Temat: srodkowy', 'mail');
    f.fire('Data : Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('', 'mail');
    f.fire('Tresc srodkowego.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    f.fire('> ', 'prompt');

    // Re-kotwica 3: najstarszy (Foo, 22 VIII) - pelny odczyt.
    await waitRt(
      () => f.sent.filter((c) => c.startsWith('listy odebrane przed')).length === 3,
      're-kotwica 3',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(
      () => f.sent.filter((c) => c.startsWith('przeczytaj list')).length === 2,
      'odczyt najstarszego',
    );
    f.fire('List : 1', 'mail');
    f.fire('Od   : Foo', 'mail');
    f.fire('Temat: najstarszy', 'mail');
    f.fire('Data : Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire('', 'mail');
    f.fire('Tresc najstarszego.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ', 'mail');
    f.fire('> ', 'prompt');

    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec pobierania');
    assert.ok(
      notifyText(f, 'nie ma juz w skrzynce: 1'),
      'komunikat o missing jednej grupy',
    );

    // Archiwum: najnowszy wypadl (2 rekordy).
    const strip = (): string =>
      (content.querySelector('.arkmail-arch-counts') as { textContent: string } | null)
        ?.textContent ?? '';
    await waitRt(() => strip().includes('Listow w bazie: 2'), 'archiwum bez najnowszego');
    assert.ok(!strip().includes('3'), 'trzy rekordy juz nie');

    // Widok skrzynki: martwy wiersz ma zniknac (RED - dzis zostaje).
    click(h, '[data-tab="listy"]');
    await waitRt(
      () => content.querySelectorAll('.arkmail-entry').length === 2,
      'widok: 2 wiersze po purgu missing',
    );
    const rows = [...content.querySelectorAll('.arkmail-entry')].map(
      (r) => (r as unknown as { textContent: string }).textContent,
    );
    assert.ok(rows.some((r) => r.includes('najstarszy')), 'najstarszy zostaje');
    assert.ok(rows.some((r) => r.includes('srodkowy')), 'srodkowy zostaje');
    assert.ok(!rows.some((r) => r.includes('najnowszy')), 'najnowszy wypada z widoku');
  } finally {
    await stopHarness();
  }
});
