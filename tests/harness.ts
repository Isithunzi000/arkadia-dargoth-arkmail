/**
 * Wspolny harness integracyjny (happy-dom + FakeApi + prawdziwy index.ts).
 * Uzywany przez pagination.test.ts i cache.test.ts. NIE jest testem sam
 * w sobie (nazwa bez .test.) - node --test go nie odpala.
 */
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { IDBFactory } from 'fake-indexeddb';

import type PluginApi from 'plugin-api';
import { init, destroy } from '../src/arkmail/index';

export type TriggerCb = (line: { text: string }, matches: unknown, type: string) => unknown;

export class FakeApi {
  sent: string[] = [];
  triggerCb: TriggerCb | null = null;
  emitted: { event: string; args: unknown[] }[] = [];
  popupConfig: { createContent: () => Promise<unknown> } | null = null;
  /** Zarejestrowane nasluchy zdarzen klienta (Fala 13a: gmcp.mail.state). */
  eventListeners = new Map<string, Array<(payload: unknown) => void>>();
  /** Historia update'ow klawisza stopki (Fala 14d: badge '(u/n)'). */
  footerUpdates: Array<{ label?: string }> = [];
  /** Historia podswietlen stopki (setFooterButtonState). */
  footerStates: Array<{ state: string; highlighted: boolean }> = [];
  /** Linie stlumione przez trigger pluginu (zwrot null = gag, Fala 16j). */
  gagged: string[] = [];
  /** Flagi echa wysylek, rownolegle do sent (Fala 28h: compose/zwierze
   *  wysylaja z echem, reszta bez). */
  sentEcho: boolean[] = [];

  readonly api = {
    command: {
      send: async (command: string, echo?: boolean) => {
        this.sent.push(command);
        this.sentEcho.push(echo ?? false);
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
      on: (event: string, cb: (payload: unknown) => void) => {
        const arr = this.eventListeners.get(event) ?? [];
        arr.push(cb);
        this.eventListeners.set(event, arr);
      },
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
      registerFooterButton: (_id: string, _cfg: unknown) => ({
        update: (u: { label?: string }) => {
          this.footerUpdates.push(u);
        },
        remove: () => {},
      }),
      setFooterButtonState: (state: string, highlighted: boolean) => {
        this.footerStates.push({ state, highlighted });
      },
    },
  } as unknown as PluginApi;

  fire(text: string, cls = ''): void {
    const ret = this.triggerCb?.({ text }, null, cls);
    if (ret === null) this.gagged.push(text); // Fala 16j: null = gag linii
  }

  /** Wystrzelenie zdarzenia klienta do nasluchow pluginu (np. gmcp.mail.state). */
  fireEvent(event: string, payload: unknown): void {
    for (const cb of this.eventListeners.get(event) ?? []) cb(payload);
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

let previousIndexedDB: IDBFactory | undefined;

export async function startHarness(): Promise<Harness> {
  const window = new Window();
  (globalThis as { document?: unknown }).document = window.document;
  previousIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  const f = new FakeApi();
  const initializing = init(f.api);
  f.fireEvent('gmcp.char.info', { name: 'Foo' });
  await initializing;
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
  if (previousIndexedDB === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  else globalThis.indexedDB = previousIndexedDB;
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
  // Fala 13a: koniec prologu = sesja ZAMKNIETA. Sam przycisk pojawia sie
  // juz po listingu odebranych (przed koncem fetchu nieprzeczytanych),
  // wiec czekamy tez na znikniecie paska busy - inaczej test łapal
  // chwile, gdy blokada sesji jeszcze stoi (wyscig mikrozadan).
  await waitFor(() => !content.querySelector('.arkmail-busy'), 'koniec sesji prologu');
}

export const click = (h: Harness, selector: string): void =>
  (h.content.querySelector(selector) as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new h.window.Event('click'),
  );

/**
 * Napedza pelny przebieg indeksacji 4 skrzynek (indexAllBoxes) do konca.
 * Dla kazdej skrzynki (kolejnosc stala: odebrane, nieprzeczytane,
 * wyslane, niewyslane) czeka na NOWA komende "listy <skrzynka>" (liczona
 * od chwili wywolania, wiec wczesniejsze listingi nie myla rachunku)
 * i odpowiada zadanymi liniami + promptem. Domyslna odpowiedz: pusta
 * skrzynka ("Nie masz zadnych ... listow."). Odpowiedzi podawac tak,
 * zeby przebieg byl kompletny: listing bez suffixu uciecia albo pusta
 * skrzynka (listing uciety wymagalby kotwic paginacji).
 */
export async function driveIndexAll(
  h: Harness,
  answers?: Partial<
    Record<'odebrane' | 'nieprzeczytane' | 'wyslane' | 'niewyslane', string[]>
  >,
): Promise<void> {
  const { f } = h;
  const boxes = ['odebrane', 'nieprzeczytane', 'wyslane', 'niewyslane'] as const;
  const emptyLine: Record<(typeof boxes)[number], string> = {
    odebrane: 'Nie masz zadnych odebranych listow.',
    nieprzeczytane: 'Nie masz zadnych nieprzeczytanych listow.',
    wyslane: 'Nie masz zadnych wyslanych listow.',
    niewyslane: 'Nie masz zadnych niewyslanych listow.',
  };
  const base = new Map(boxes.map((b) => [b, f.sent.filter((c) => c === `listy ${b}`).length]));
  for (const box of boxes) {
    const want = base.get(box)! + 1;
    await waitRt(
      () => f.sent.filter((c) => c === `listy ${box}`).length >= want,
      `indeksacja: listing ${box}`,
    );
    const lines = answers?.[box] ?? [emptyLine[box]];
    for (const line of lines) f.fire(line, 'mail');
    f.fire('> ', 'prompt');
  }
}

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
