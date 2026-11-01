/**
 * Nawigacja archiwum -> list -> archiwum (Fala 17d, zgloszenie
 * 2026-10-19/20 pkt 2).
 *
 * Blad z sesji: klik w wpis archiwum ladowal list, ale w trybie
 * szerokim zakladka zostawala na "archiwum" - list byl niewidoczny,
 * gracz musial recznie przechodzic na "Listy" ("bez sensu"). Do tego
 * "Zamknij list" zawsze wracal na zakladke Listy, nawet gdy list
 * otwarto z Archiwum.
 *
 * Kontrakt:
 *  - openLetter ZAWSZE pokazuje list: waski -> zakladka 'list',
 *    szeroki -> 'listy' (split: listing + list obok);
 *  - openLetter zapamietuje zakladke zrodlowa, closeLetter wraca
 *    DO NIEJ (z archiwum -> archiwum; z list -> listy jak dawniej);
 *  - kolejne openLetter nad otwartym listem (zakladka 'list') nie
 *    nadpisuje zapamietanego zrodla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MailUiStore } from '../src/arkmail/ui/store';
import type { LetterContent } from '../src/arkmail/core/session/pager';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  textOf,
  waitRt,
  type Harness,
} from './harness';

const LETTER: LetterContent = {
  number: 1,
  from: 'Corge',
  subject: 'najnowszy',
  to: 'Waldo',
  cc: null,
  date: 'Wt, 24 VIII 1999, 00:11:12',
  body: ['Tresc.'],
};

test('store: otwarcie listu z archiwum pokazuje list w obu trybach, Zamknij wraca do archiwum', () => {
  const narrow = new MailUiStore({ tab: 'archiwum' });
  narrow.openLetter('odebrane', LETTER);
  assert.equal(narrow.state.tab, 'list', 'waski: zakladka listu');
  narrow.closeLetter();
  assert.equal(narrow.state.tab, 'archiwum', 'waski: powrot do archiwum');

  const wide = new MailUiStore({ tab: 'archiwum', wide: true });
  wide.openLetter('odebrane', LETTER);
  assert.equal(wide.state.tab, 'listy', 'szeroki: split na zakladce Listy');
  wide.closeLetter();
  assert.equal(wide.state.tab, 'archiwum', 'szeroki: powrot do archiwum');
});

test('store: otwarcie z zakladki Listy - Zamknij wraca na Listy (regresja)', () => {
  const s = new MailUiStore({ tab: 'listy' });
  s.openLetter('odebrane', LETTER);
  assert.equal(s.state.tab, 'list');
  s.closeLetter();
  assert.equal(s.state.tab, 'listy');
});

test('store: openLetter nad otwartym listem nie nadpisuje zrodla powrotu', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.openLetter('odebrane', LETTER); // zrodlo: archiwum
  s.openLetter('odebrane', { ...LETTER, subject: 'inny' }); // tab juz 'list'
  s.closeLetter();
  assert.equal(s.state.tab, 'archiwum', 'powrot do pierwszego zrodla');
});

/** Klik w wiersz archiwum z zadanym fragmentem tematu. */
function clickArchiveRow(h: Harness, fragment: string): void {
  const rows = Array.from(
    h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
      textContent?: string;
      dispatchEvent(e: unknown): void;
    }>,
  );
  const row = rows.find((r) => String(r.textContent ?? '').includes(fragment));
  assert.ok(row, `wiersz archiwum "${fragment}" istnieje`);
  row.dispatchEvent(new h.window.Event('click'));
}

test('integracja: klik w archiwum pokazuje list, Zamknij list wraca do archiwum', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    clickArchiveRow(h, 'srodkowy');

    // Odczyt z serwera (re-kotwica po dacie).
    await waitRt(() => f.sent.includes('listy odebrane przed 24 VIII 1999'), 're-kotwica');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'odczyt');
    f.fire('List : 2', 'mail');
    f.fire('Od   : Foo', 'mail');
    f.fire('Temat: srodkowy', 'mail');
    f.fire('Data : Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire('', 'mail');
    f.fire('Tresc srodkowego.', 'mail');
    f.fire('[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 2) -- ', 'mail');
    f.fire('> ', 'prompt');

    await waitRt(
      () => textOf(h, '.arkmail-letter-body').includes('Tresc srodkowego.'),
      'list widoczny od razu po kliku w archiwum',
    );

    // Zamknij list wraca do archiwum (skad przyszlismy), nie na Listy.
    const back = Array.from(
      h.content.querySelectorAll('button') as unknown as Iterable<{ textContent?: string; dispatchEvent(e: unknown): void }>,
    ).find((b) => b.textContent === 'Zamknij list');
    assert.ok(back, 'przycisk Zamknij list');
    back.dispatchEvent(new h.window.Event('click'));
    await waitRt(
      () => h.content.querySelectorAll('.arkmail-arch-entry').length > 0,
      'widok archiwum po zamknieciu',
    );
    assert.ok(
      (h.content.querySelector('[data-tab="archiwum"]') as { className: string }).className.includes(
        'arkmail-tab-active',
      ),
      'zakladka archiwum aktywna po zamknieciu',
    );
  } finally {
    await stopHarness();
  }
});
