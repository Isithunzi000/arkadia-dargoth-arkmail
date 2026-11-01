/**
 * Spojnosc etykiet UI (Fala 28d, audyt stringow 2026-10-22):
 *  - placeholdery filtrow dat w archiwum: "Od dnia"/"Do dnia" - tak jak
 *    w szukajce serwerowej (bylo "Od daty"/"Do daty", dwa nazewnictwa
 *    na te sama rzecz w jednym oknie);
 *  - busy petli "Wczytaj wszystkie" konczy sie wielokropkiem - jak
 *    "Wczytuje starsze listy..." (operacja w toku, nie komunikat
 *    zamkniety).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { startHarness, stopHarness, loadTruncatedBox, click, waitRt, textOf } from './harness';

const window = new Window();
const document = window.document;

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const off = mountMailUi(container as unknown as HTMLElement, store, {} as unknown as MailUiHandlers);
  return { container, off };
}

test('ui: placeholdery dat w archiwum brzmia "Od dnia"/"Do dnia"', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  const { container, off } = mount(s);
  const od = container.querySelector('[data-filter="odDaty"]') as { getAttribute(n: string): string | null } | null;
  const doo = container.querySelector('[data-filter="doDaty"]') as { getAttribute(n: string): string | null } | null;
  assert.ok(od && doo, 'pola dat archiwum istnieja');
  assert.equal(od.getAttribute('placeholder'), 'Od dnia');
  assert.equal(doo.getAttribute('placeholder'), 'Do dnia');
  off();
});

test('ui: busy "Wczytuje wszystkie" ma wielokropek (operacja w toku)', async () => {
  const h = await startHarness();
  const { f, waitFor, content } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '.arkmail-older-all');
    await waitFor(
      () => f.sent.some((s) => s.startsWith('listy odebrane przed ')),
      'pierwsza strona petli poszla',
    );
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 1. *R* Temat: starszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () => /\.\.\.$/.test(textOf(h, '.arkmail-busy')),
      'busy z wielokropkiem',
    );
    assert.match(textOf(h, '.arkmail-busy'), /Wczytuje wszystkie \(odebrane\): strona 1\.\.\./);
    // Przerwij petle, zeby test nie wisial na kolejnych stronach.
    click(h, '.arkmail-older-all');
    await waitRt(() => !content.querySelector('.arkmail-busy'), 'koniec petli');
  } finally {
    await stopHarness();
  }
});
