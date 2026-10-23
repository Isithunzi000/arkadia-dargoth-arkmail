/**
 * DargothTransport: Transport (core) nad zywym PluginApi klienta Dargoth.
 *
 * - send: api.command.send z zachowaniem wielkosci liter i bez echa.
 * - subscribe: jeden zbiorczy trigger /^/ (tag 'arkmail') rozdziela linie
 *   do subskrybentow; linia zwracana BEZ zmian (niczego nie modyfikujemy).
 *   cls = typ linii z klienta (trzeci argument callbacka, np. 'prompt').
 * - modal-guard: na czas sesji pager/edytor (ktore konsumuja caly strumien
 *   wejscia gry) hook commandHooks tlumi komendy gracza do kolejki;
 *   endModal() odtwarza je do gry w oryginalnej kolejnosci.
 *   Wlasne wysylki sesji omijaja hook (zbior bypass) - api.command.send
 *   przechodzi przez commandHooks, co zweryfikowano w PluginApi.ts.
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
  private bypass = new Set<string>();
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

  send(line: string, echo = false): void {
    if (this.modalActive) this.bypass.add(line);
    // Fala 28h: echo=true dla composera i "wyslij zwierze" - gracz
    // widzi w oknie, co plugin wyslal (jak przy recznym wpisaniu).
    void this.api.command.send(line, echo, { preserveCase: true });
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
      if (this.bypass.delete(command)) return undefined; // nasza wysylka
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
    this.bypass.clear();
    const pending = this.queue.splice(0);
    for (const command of pending) {
      void this.api.command.send(command, undefined, { preserveCase: true });
    }
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
    this.bypass.clear();
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
