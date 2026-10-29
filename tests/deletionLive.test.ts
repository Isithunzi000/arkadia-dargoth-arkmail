/**
 * Usuwanie na zywym kliencie (zgloszenie 2026-10-30: "usuwanie listow
 * nie dziala w zakladce usuwanie listow").
 *
 * Dwie roznice miedzy harnessem a zywym klientem, ktore razem zabijaly
 * usuwanie, a przy przejsciu przez testy byly niewidzialne:
 *
 *  1. Straznik sierocych pagerow (index.ts) resetowal stan zakladki
 *     usuwanie na KAZDA komende gracza (cls 'command' / echo klienta).
 *     Gracz z otwartym popupem pisze komendy do gry - kazda kasowala
 *     wyniki i zaznaczenie. Zakladka Listy tego nie robi (jej wyniki
 *     zadna komenda gracza nie tyka) - parzystosc wymuszona zgloszeniem.
 *  2. Uzbrojenie dwuklikowego potwierdzenia zylo w zamknieciu renderu
 *     (per-przycisk). Na zywym kliencie popup przemalowuje sie przy
 *     kazdym badge/busy/GMCP - miedzy pierwszym a drugim klikiem
 *     przycisk bywal odtwarzany od nowa i drugi klik uzbrajal od nowa
 *     zamiast kasowac. Stan musi zyc w store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import { startHarness, stopHarness, click, waitRt, textOf } from './harness';

test('usuwanie: komenda gracza nie kasuje wynikow i zaznaczenia', async () => {
  const h = await startHarness();
  try {
    click(h, '[data-tab="usuwanie"]');
    click(h, '.arkmail-deletion-search');
    await waitRt(() => h.f.sent.includes('listy odebrane'), 'komenda listingu');
    h.f.fire('Listy odebrane:', 'mail');
    h.f.fire(' 1. *R* Temat: Temat A', 'mail');
    h.f.fire('Nadawca: Bar                         Wt, 23 XII 2025, 00:11:12', 'mail');
    h.f.fire('> ', 'prompt');
    await waitRt(() => h.content.querySelectorAll('.arkmail-deletion-entry').length === 1, 'wynik');
    const field = h.content.querySelector('[data-deletion-number="1"]') as {
      checked: boolean;
      dispatchEvent(event: unknown): void;
    };
    field.checked = true;
    field.dispatchEvent(new h.window.Event('change'));
    await waitRt(() => textOf(h, '.arkmail-deletion-selected').includes('Zaznaczono'), 'zaznaczenie');
    // Gracz gra dalej: komenda w glownym oknie gry, popup otwarty.
    h.f.fire('polnoc', 'command');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(h.content.querySelectorAll('.arkmail-deletion-entry').length, 1, 'wyniki zostaja');
    assert.ok(textOf(h, '.arkmail-deletion-selected').includes('Zaznaczono'), 'zaznaczenie zostaje');
    assert.ok(textOf(h, '.arkmail-deletion-summary').includes('Wyniki: 1 list.'), 'podsumowanie zostaje');
  } finally {
    await stopHarness();
  }
});

const window = new Window();
const document = window.document;

function entry(number: number): MailboxEntry {
  return {
    number,
    isRead: true,
    subject: `Temat ${number}`,
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
  };
}

function deletionStore(): MailUiStore {
  const store = new MailUiStore({ tab: 'usuwanie' });
  store.applyDeletionResult('odebrane', 'listy odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(1), entry(2)],
  });
  store.selectAllDeletionEntries();
  return store;
}

test('usuwanie: uzbrojenie potwierdzenia przetrwa repaint', () => {
  const container = document.createElement('div');
  const calls: string[] = [];
  const handlers = {
    onDeletionSearch: () => {},
    onDeletionDelete: () => calls.push('deletion-delete'),
  } as unknown as MailUiHandlers;
  const off = mountMailUi(container as unknown as HTMLElement, deletionStore(), handlers);
  try {
    const remove = () => container.querySelector('.arkmail-deletion-delete') as {
      textContent?: string;
      dispatchEvent(event: unknown): void;
    };
    remove().dispatchEvent(new window.Event('click'));
    assert.deepEqual(calls, [], 'pierwszy klik tylko uzbraja');
    assert.ok((remove().textContent ?? '').includes('Potwierdz usuniecie'), 'etykieta uzbrojona');
    remove().dispatchEvent(new window.Event('click'));
    assert.deepEqual(calls, ['deletion-delete'], 'drugi klik kasuje od razu');
  } finally {
    off();
  }
});

test('usuwanie: repaint miedzy klikami nie rozbraja potwierdzenia', () => {
  const container = document.createElement('div');
  const calls: string[] = [];
  const handlers = {
    onDeletionSearch: () => {},
    onDeletionDelete: () => calls.push('deletion-delete'),
  } as unknown as MailUiHandlers;
  const store = deletionStore();
  const off = mountMailUi(container as unknown as HTMLElement, store, handlers);
  try {
    const remove = () => container.querySelector('.arkmail-deletion-delete') as {
      dispatchEvent(event: unknown): void;
    };
    remove().dispatchEvent(new window.Event('click'));
    assert.deepEqual(calls, [], 'pierwszy klik uzbraja');
    // Dwa repainty z rzedem - na zywym kliencie normalka.
    store.setBusy('Praca...');
    store.setBusy(null);
    store.setNotifyEnabled(true);
    remove().dispatchEvent(new window.Event('click'));
    assert.deepEqual(calls, ['deletion-delete'], 'uzbrojenie przetrwało repainty');
  } finally {
    off();
  }
});

test('usuwanie: store - uzbrojenie/rozbrojenie i kasowanie kontekstem', () => {
  // Casty: test ma padac RUNTIME na starym kodzie (brak metod), nie
  // tylko przy kompilacji - dowod RED pokazuje zachowanie, nie typy.
  const store = deletionStore() as MailUiStore & {
    state: MailUiStore['state'] & { deletion: { armedAt: number } };
    armDeletionConfirm(): void;
    disarmDeletionConfirm(): void;
  };
  assert.equal(store.state.deletion.armedAt, 0, 'start nieuzbrojony');
  store.armDeletionConfirm();
  assert.ok(store.state.deletion.armedAt > 0, 'uzbrojone');
  const revision = store.state.deletion.revision;
  store.armDeletionConfirm();
  assert.equal(store.state.deletion.revision, revision, 'uzbrajanie nie podbija revision');
  store.disarmDeletionConfirm();
  assert.equal(store.state.deletion.armedAt, 0, 'rozbrojone');
  store.armDeletionConfirm();
  store.applyDeletionResult('odebrane', 'listy odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(1)],
  });
  assert.equal(store.state.deletion.armedAt, 0, 'nowe wyniki rozbrajaja');
});
