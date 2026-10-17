/**
 * Paginacja wstecz (Fala 7a) - integracja przez skompilowany index.ts.
 *
 * Dowody z loga sesji testowej 2026-10-17:
 * 1) Serwer odrzuca mala litere miesiaca rzymskiego: "Data zostala
 *    podana w zlym formacie. Przykladowy format to: 13 X 2007."
 *    -> komenda paginacji MUSI miec miesiac WIELKA litera.
 * 2) Listing skrzynki idzie od NAJSTARSZEGO listu (gora, najwiekszy
 *    numer) do najnowszego (dol, numer 1) -> date graniczna paginacji
 *    bierzemy z NAJSTARSZEGO widocznego wpisu, nie z ostatniego.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import type PluginApi from 'plugin-api';
import { olderListingCommand } from '../src/arkmail/core/protocol/commands';
import { parseMailDate } from '../src/arkmail/core/protocol/parser';
import { init, destroy } from '../src/arkmail/index';

type TriggerCb = (line: { text: string }, matches: unknown, type: string) => unknown;

test('paginacja: miesiac rzymski WIELKA litera (wymog serwera)', () => {
  assert.equal(
    olderListingCommand('wyslane', parseMailDate('Cz, 9 III 2026, 12:00:00')!),
    'listy wyslane przed 9 III 2026',
  );
  assert.equal(
    olderListingCommand('odebrane', parseMailDate('N, 21 XII 2025, 01:15:04')!),
    'listy odebrane przed 21 XII 2025',
  );
});

class FakeApi {
  sent: string[] = [];
  triggerCb: TriggerCb | null = null;
  emitted: { event: string; args: unknown[] }[] = [];
  popupConfig: { createContent: () => Promise<unknown> } | null = null;

  readonly api = {
    command: {
      send: async (command: string) => {
        this.sent.push(command);
      },
      addSuggestions: () => {},
      removeSuggestions: () => {},
    },
    triggers: {
      register: (_pattern: unknown, cb: TriggerCb, _tag?: string) => {
        this.triggerCb = cb;
        return { id: 'trig-1' };
      },
      remove: () => {},
      removeByTag: () => {},
    },
    commandHooks: {
      register: () => 'hook-1',
      unregister: () => true,
    },
    events: {
      on: () => {},
      off: () => {},
      emit: (event: string, ...args: unknown[]) => {
        this.emitted.push({ event, args });
      },
    },
    aliases: {
      register: () => 'alias-1',
      remove: () => {},
    },
    people: {
      subscribe: () => () => {},
      getAll: () => [],
    },
    ui: {
      registerPersistentPopup: async (cfg: { createContent: () => Promise<unknown> }) => {
        this.popupConfig = cfg;
        return {
          id: 'arkmail',
          isOpen: false,
          wasRestored: false,
          isPinned: false,
          element: null,
          open: async () => {},
          close: () => {},
          onClose: () => {},
          setTitle: () => {},
          setBody: () => {},
          setPinned: () => {},
          setHeaderActions: () => {},
        };
      },
      addPopupMenuEntry: () => ({ remove: () => {} }),
      registerFooterButton: () => ({ update: () => {}, remove: () => {} }),
      setFooterButtonState: () => {},
    },
  } as unknown as PluginApi;

  fire(text: string, cls = ''): void {
    this.triggerCb?.({ text }, null, cls);
  }
}

test('paginacja: wczytaj starsze wysyla date NAJSTARSZEGO wpisu skrzynki', async () => {
  const window = new Window();
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = window.document;
  const f = new FakeApi();
  try {
    await init(f.api);
    const content = (await f.popupConfig!.createContent()) as {
      querySelector(s: string): unknown;
    };

    const tick = () => new Promise((r) => setImmediate(r));
    const waitFor = async (pred: () => boolean, what: string) => {
      for (let i = 0; i < 500; i++) {
        if (pred()) return;
        await tick();
      }
      assert.fail(`timeout: ${what}`);
    };

    // Powiadomienie o nowej poczcie odpala odswiezenie odebranych.
    f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
    await waitFor(() => f.sent.includes('listy odebrane'), 'komenda listy odebrane');

    // Listing uciety do 50 (suffix) - gora to NAJSTARSZE listy.
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        N, 21 XII 2025, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 22 XII 2025, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 23 XII 2025, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(() => f.sent.includes('listy nieprzeczytane'), 'komenda listy nieprzeczytane');
    f.fire('Nie masz zadnych nieprzeczytanych listow.', 'mail');
    await waitFor(() => !!content.querySelector('.arkmail-older'), 'przycisk Wczytaj starsze');

    const older = content.querySelector('.arkmail-older') as {
      dispatchEvent(e: unknown): void;
    };
    older.dispatchEvent(new window.Event('click'));
    await waitFor(
      () => f.sent.some((c) => c.startsWith('listy odebrane przed')),
      'komenda paginacji wstecz',
    );
    const cmd = f.sent.find((c) => c.startsWith('listy odebrane przed'))!;
    assert.equal(cmd, 'listy odebrane przed 21 XII 2025');

    // Odpowiedz serwera laduje w archiwum (merge + notify).
    f.fire('Listy odebrane:', 'mail');
    f.fire('50. *R* Temat: antyczny', 'mail');
    f.fire('Nadawca: Waldo                          N, 14 XII 2025, 10:00:00', 'mail');
    f.fire('> ', 'prompt');
    await waitFor(
      () =>
        f.emitted.some(
          (e) =>
            e.event === 'notify' &&
            String((e.args[0] as { text?: string })?.text ?? '').includes('Archiwum: +1'),
        ),
      'notify o dopisaniu starszych do archiwum',
    );
  } finally {
    await destroy();
    if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = prevDoc;
  }
});
