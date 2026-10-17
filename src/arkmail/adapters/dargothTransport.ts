/**
 * DargothTransport: Transport (core) nad zywym PluginApi klienta Dargoth.
 *
 * - send: api.command.send(linia, false) - bez echa naszych komend.
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

  constructor(private readonly api: PluginApi) {}

  send(line: string): void {
    if (this.modalActive) this.bypass.add(line);
    void this.api.command.send(line, false);
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
    for (const command of pending) void this.api.command.send(command);
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
      (line: AnsiAwareBuffer, _matches: RegExpMatchArray, type: string) => {
        const proto: ProtoLine = { text: line.text, cls: type ?? '' };
        for (const cb of [...this.subscribers]) cb(proto);
        return line;
      },
      'arkmail',
    );
  }
}
