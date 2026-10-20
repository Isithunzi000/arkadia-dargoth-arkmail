/**
 * Fala 18a (integracja): kompletny listing (bez suffixu "prezentowane
 * jest pierwsze 50") oznacza nieobecne rekordy archiwum jako
 * znikniete z serwera - znikaja z widoku archiwum i z licznikow
 * kontaktow. Plus podpis filtra tresci (X z Y).
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
  type Harness,
} from './harness';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';

function replayCompleteListing2(h: Harness): void {
  const { f } = h;
  // Kompletny (bez "(prezentowane jest pierwsze 50)") - najnowszego
  // listu (Corge) juz nie ma na serwerze.
  f.fire('Listy odebrane:', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
  f.fire('> ', 'prompt');
}

test('kompletny listing: znikniety list znika z widoku archiwum i kontaktow', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    // Odswiez odebrane kompletnym listingiem bez najnowszego listu.
    const before = f.sent.filter((c) => c === 'listy odebrane').length;
    click(h, '[data-box="odebrane"]');
    await waitRt(
      () => f.sent.filter((c) => c === 'listy odebrane').length === before + 1,
      'komenda odswiezenia',
    );
    replayCompleteListing2(h);
    await waitRt(() => !h.content.querySelector('.arkmail-busy'), 'koniec odswiezania');

    // Widok archiwum: 2 wiersze, zaden z "najnowszy".
    click(h, '[data-tab="archiwum"]');
    await waitRt(() => h.content.querySelectorAll('.arkmail-arch-entry').length === 2, '2 wiersze');
    const texts = Array.from(
      h.content.querySelectorAll('.arkmail-arch-entry') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(texts.every((t) => !t.includes('najnowszy')), 'znikniety list ukryty');
    assert.ok(texts.some((t) => t.includes('srodkowy')), 'zywe zostaja');

    // Kontakty: Corge (nadawca zniknietego) odpada z licznikow.
    click(h, '[data-tab="kontakty"]');
    await waitRt(() => !!h.content.querySelector('.arkmail-contact'), 'wiersze kontaktow');
    const names = Array.from(
      h.content.querySelectorAll('.arkmail-contact-name') as unknown as Iterable<{
        textContent?: string;
      }>,
    ).map((r) => String(r.textContent ?? ''));
    assert.ok(!names.includes('Corge'), 'kontakt bez zywych listow znika');
    assert.ok(names.includes('Foo'), 'zywy kontakt zostaje');
  } finally {
    await stopHarness();
  }
});

test('filtr tresci: podpis "obejmuje tylko listy z pobrana trescia (X z Y)"', () => {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  try {
    const document = window.document;
    const store = new MailUiStore({});
    const mk = (subject: string, body: string[]): ArchiveLetter => ({
      ...fromMailboxEntry('odebrane', {
        number: 1,
        isRead: true,
        subject,
        forwarded: false,
        party: 'Foo',
        partyKind: 'nadawca',
        date: parseMailDate('Wt, 23 XII 2025, 00:11:12'),
      }),
      body,
    });
    store.setArchive([
      mk('Pierwszy', ['tresc jeden']),
      mk('Drugi', ['tresc dwa']),
      mk('Trzeci', []),
    ]);
    const container = document.createElement('div');
    const off = mountMailUi(container as unknown as HTMLElement, store, {
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
    } as unknown as MailUiHandlers);
    try {
      store.setTab('archiwum');
      const input = container.querySelector('[data-filter="tresc"]') as unknown as {
        value: string;
        dispatchEvent(e: unknown): void;
      };
      assert.ok(input, 'pole filtra tresci');
      input.value = 'tresc';
      input.dispatchEvent(new window.Event('input'));
      const note = container.querySelector('.arkmail-tresc-note') as unknown as {
        textContent?: string;
      } | null;
      assert.ok(note, 'podpis filtra tresci widoczny');
      assert.equal(
        note.textContent,
        'Filtr tresci obejmuje tylko listy z pobrana trescia (2 z 3).',
      );
    } finally {
      off();
    }
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});
