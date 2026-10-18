/**
 * Wspolny harness integracyjny (happy-dom + FakeApi + prawdziwy index.ts).
 * Uzywany przez pagination.test.ts i cache.test.ts. NIE jest testem sam
 * w sobie (nazwa bez .test.) - node --test go nie odpala.
 */
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import type PluginApi from 'plugin-api';
import { init, destroy } from '../src/arkmail/index';

export type TriggerCb = (line: { text: string }, matches: unknown, type: string) => unknown;

export class FakeApi {
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
          close: async () => {},
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

export interface Harness {
  f: FakeApi;
  content: {
    querySelector(s: string): unknown;
    querySelectorAll(s: string): unknown[];
  };
  window: Window;
  waitFor(pred: () => boolean, what: string): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  const f = new FakeApi();
  await init(f.api);
  const content = (await f.popupConfig!.createContent()) as Harness['content'];
  const tick = () => new Promise((r) => setImmediate(r));
  const waitFor = async (pred: () => boolean, what: string) => {
    for (let i = 0; i < 500; i++) {
      if (pred()) return;
      await tick();
    }
    assert.fail(`timeout: ${what}`);
  };
  return { f, content, window, waitFor };
}

export async function stopHarness(): Promise<void> {
  await destroy();
  delete (globalThis as { document?: unknown }).document;
}

/** Wspolny prolog: powiadomienie -> listing 3 listow (obciety) -> puste nieprzeczytane. */
export async function loadTruncatedBox(h: Harness): Promise<void> {
  const { f, waitFor, content } = h;
  f.fire(' [ POCZTA ] Masz nowa poczte od Foo.');
  await waitFor(() => f.sent.includes('listy odebrane'), 'komenda listy odebrane');
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
}

export const click = (h: Harness, selector: string): void =>
  (h.content.querySelector(selector) as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new h.window.Event('click'),
  );

/** waitFor w czasie rzeczywistym (pacing petli to setTimeout, nie setImmediate). */
export async function waitRt(pred: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 240; i++) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`timeout(rt): ${what}`);
}

export const notifyText = (f: FakeApi, fragment: string): boolean =>
  f.emitted.some(
    (e) =>
      e.event === 'notify' &&
      String((e.args[0] as { text?: string })?.text ?? '').includes(fragment),
  );

/** Tekst elementu (happy-dom) albo ''. */
export const textOf = (h: Harness, selector: string): string =>
  String((h.content.querySelector(selector) as { textContent?: string } | null)?.textContent ?? '');
