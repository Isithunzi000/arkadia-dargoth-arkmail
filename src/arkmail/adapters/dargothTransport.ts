/**
 * DargothTransport: Transport (core) nad zywym PluginApi klienta Dargoth.
 *
 * - send: api.command.send z zachowaniem wielkosci liter.
 * - subscribe: jeden zbiorczy trigger /^/ (tag 'arkmail') rozdziela linie
 *   do subskrybentow; linia zwracana BEZ zmian (niczego nie modyfikujemy).
 *   cls = typ linii z klienta (trzeci argument callbacka, np. 'prompt').
 * - modal-guard: na czas sesji pager/edytor (ktore konsumuja caly strumien
 *   wejscia gry) hook commandHooks tlumi komendy gracza do kolejki;
 *   endModal() odtwarza je do gry w oryginalnej kolejnosci.
 *   Wlasne wysylki sesji omijaja hook tylko podczas wywolania api.command.send.
 *   Komendy sa wykonywane pojedynczo, w kolejnosci przekazania do transportu.
 */

import type PluginApi from 'plugin-api';
import type { AnsiAwareBuffer } from 'plugin-api';
import type { ProtoLine, Transport } from '../core/session/transport.js';

/** Priorytet hooka modalnego: wysoko, zanim aliasy/inne wtyczki. */
const MODAL_HOOK_PRIORITY = 100;

export class DargothTransport implements Transport {
  private readonly subscribers = new Set<(line: ProtoLine) => void>();
  private triggerArmed = false;
  private modalActive = false;
  private hookId: string | null = null;
  private queue: string[] = [];
  private commandQueue: Promise<void> = Promise.resolve();
  private connectionGeneration = 0;
  private sendingOwn = false;
  private online = true;
  /** Fala 16j: kiedy tlumic linie pocztowe (index.ts: blokada sesji). */
  private gagWhen: (() => boolean) | null = null;

  constructor(private readonly api: PluginApi) {}

  /**
   * Fala 16j: predykat gagowania linii pocztowych (cls 'mail'). Linie
   * przychodzace podczas operacji pluginowej (listingi, tresci listow)
   * nie smieca glownego okna gry; poza operacja wszystko przechodzi
   * bez zmian (reczne "listy" gracza, powiadomienie POCZTA).
   */
  setGagPredicate(pred: () => boolean): void {
    this.gagWhen = pred;
  }

  send(line: string, echo = false): Promise<void> {
    return this.enqueue(line, echo);
  }

  /** Jedna komenda czeka na zakonczenie przetwarzania poprzedniej. */
  private enqueue(line: string, echo: boolean | undefined): Promise<void> {
    if (!this.online) return Promise.resolve();
    const generation = this.connectionGeneration;
    const task = this.commandQueue.then(async () => {
      if (!this.online || generation !== this.connectionGeneration) return;
      let pending: Promise<void>;
      // Hook jest wywolywany synchronicznie przez api.command.send. Flaga
      // rozroznia wysylke pluginu od komendy gracza takze przy tym samym tekscie.
      this.sendingOwn = true;
      try {
        pending = this.api.command.send(line, echo, { preserveCase: true });
      } finally {
        this.sendingOwn = false;
      }
      await pending;
    });
    this.commandQueue = task.catch(() => {});
    return task;
  }

  subscribe(cb: (line: ProtoLine) => void): () => void {
    this.armTrigger();
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Liczba komend gracza odlozonych w trakcie sesji modalnej. */
  get modalQueueLength(): number {
    return this.queue.length;
  }

  beginModal(): void {
    if (this.modalActive) return;
    this.modalActive = true;
    this.hookId = this.api.commandHooks.register((command: string) => {
      if (this.sendingOwn) return undefined;
      this.queue.push(command);
      return null; // stlumienie: pager/edytor konsumuje wejscie
    }, MODAL_HOOK_PRIORITY);
  }

  endModal(): void {
    if (!this.modalActive) return;
    this.modalActive = false;
    if (this.hookId !== null) {
      this.api.commandHooks.unregister(this.hookId);
      this.hookId = null;
    }
    const pending = this.queue.splice(0);
    if (!this.online) return;
    for (const command of pending) {
      void this.enqueue(command, undefined).catch(() => {});
    }
  }

  /** Odcina stare wysylki i porzuca kolejke bez drenowania. */
  setOnline(online: boolean): void {
    this.online = online;
    if (online) return;
    this.connectionGeneration++;
    this.commandQueue = Promise.resolve();
    if (this.hookId !== null) {
      this.api.commandHooks.unregister(this.hookId);
      this.hookId = null;
    }
    this.modalActive = false;
    this.queue = [];
  }

  /** Zdejmuje trigger i modal-guard; do wywolania w destroy() pluginu. */
  dispose(): void {
    this.endModal();
    if (this.triggerArmed) {
      this.api.triggers.removeByTag('arkmail');
      this.triggerArmed = false;
    }
    this.subscribers.clear();
    this.queue = [];
    this.connectionGeneration++;
    this.commandQueue = Promise.resolve();
  }

  private armTrigger(): void {
    if (this.triggerArmed) return;
    this.triggerArmed = true;
    this.api.triggers.register(
      /^/,
      // 4. argument (originalLine) niesie dziewiczy tekst linii z gry -
      // system triggerow Dargoth przekazuje kolejnym callbackom buffer
      // po cudzych modyfikacjach (np. newMail klienta dokleja prefix
      // "\n[ POCZTA ] " i suffix "\n\n"), co lamalo dopasowania
      // (Fala 8a, dowod: Triggers.ts TriggerCallback + newMail.ts).
      (line: AnsiAwareBuffer, _matches: RegExpMatchArray, type: string, originalLine?: string) => {
        const proto: ProtoLine = { text: originalLine ?? line.text, cls: type ?? '' };
        for (const cb of [...this.subscribers]) cb(proto);
        // Fala 16j: subskrybenci (parser) dostaja linie ZAWSZE; zwrot
        // null tlumi tylko wyswietlanie w glownym oknie gry, i to
        // wylacznie podczas operacji pluginowej (blokada sesji).
        if (type === 'mail' && this.gagWhen?.()) return null;
        return line;
      },
      'arkmail',
    );
  }
}
