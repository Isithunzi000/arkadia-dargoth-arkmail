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
import { SessionScopeRegistry } from '../core/session/transport.js';
import type { ProtoLine, SessionScope, Transport } from '../core/session/transport.js';
import { extractPagerPrompt } from '../core/protocol/parser.js';
import { isPromptLine } from '../core/session/lines.js';
import { notify } from './notify.js';

export interface PagerModalHooks {
  /** Gracz przejmuje wlasny pager; sesja pluginu konczy sie bez q. */
  onUserCommand: () => void;
  /** Komende czytania odrzucono, bo pager jest juz zamkniety. */
  onCommandDropped: () => void;
}

/** Priorytet hooka modalnego: wysoko, zanim aliasy/inne wtyczki. */
const MODAL_HOOK_PRIORITY = 100;

/** Fala 42: pamiec ostatnich wysylek z echem oczekujacych na linie-echo. */
const PENDING_ECHO_CAP = 10;
const PENDING_ECHO_TTL_MS = 10_000;
/** Brak promptu po tym czasie jest widoczny, ale nie otwiera kanalu. */
const RECOVERY_LIMIT_MS = 10_000;

type CommandSource = 'arkmail' | 'user';

interface PendingEcho {
  id: number;
  line: string;
  source: CommandSource;
  timer: ReturnType<typeof setTimeout>;
}

/** Komendy z pomocy trybu czytania. Wykrzyknik jawnie wykonuje komende
 *  poza pagerem, wiec zachowuje zwykle odtwarzanie po modalu. */
const isPagerCommand = (command: string): boolean => {
  const value = command.trim();
  if (value.startsWith('!')) return false;
  if (value === '') return true;
  if (/^(?:\.|<|>|\?|\d+|m|e|q|x)$/i.test(value)) return true;
  if (/^[-+](?:\s+.*)?$/s.test(value)) return true;
  return /^(?:h|r|f|a|d|u|n)(?:\s+.*)?$/is.test(value);
};

export class DargothTransport implements Transport {
  private readonly subscribers = new Set<(line: ProtoLine) => void>();
  private readonly sessions = new SessionScopeRegistry();
  private triggerArmed = false;
  private modalActive = false;
  private hookId: string | null = null;
  private pagerModal: PagerModalHooks | null = null;
  private pagerOpen = false;
  private queue: string[] = [];
  private commandQueue: Promise<void> = Promise.resolve();
  private connectionGeneration = 0;
  private sendingOwn = false;
  /** Fala 42: teksty wysylek z echem (echo=true) czekajacych na
   *  linie-echo w strumieniu. FIFO z limitem. Wysylka bez echa NIE
   *  rejestruje sie - identyczny tekst wpisany recznie przez gracza
   *  nigdy nie dostanie znacznika own. */
  private pendingEchoSends: PendingEcho[] = [];
  private nextEchoId = 1;
  // Fala 25 (blad 3): transport startuje ROZBROJONY. Brama otwiera
  // wylacznie sygnal obecnosci w grze (gmcp.char.info / char.name /
  // mail.state / room.long albo proxy.session z faktycznym wznowieniem
  // sesji); client.connect sam w sobie NIE uzbraja, bo odpala tez na
  // ekranie logowania - komenda "listy ..." na prompcie nazwy postaci
  // zabijala logowanie ("Nie ma takiej postaci").
  private online = false;
  /** Fala 16j: kiedy tlumic linie pocztowe (index.ts: blokada sesji). */
  private gagWhen: (() => boolean) | null = null;
  /** Niepotwierdzony koniec odpowiedzi: mail gagowany do promptu gry. */
  private recovering = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

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
    // Wlasne q/x sesji oznacza, ze automatyczne zamykanie juz sie
    // rozpoczelo. Komendy gracza nie moga zostac wyslane do takiego
    // pagera jako jego dalsza nawigacja.
    if (this.pagerModal && /^(?:q|x)$/i.test(line.trim())) this.pagerOpen = false;
    return this.enqueue(line, echo);
  }

  /** Jedna komenda czeka na zakonczenie przetwarzania poprzedniej. */
  private enqueue(
    line: string,
    echo: boolean | undefined,
    source: CommandSource = 'arkmail',
  ): Promise<void> {
    if (!this.online) return Promise.reject(new Error('transport offline'));
    if (source === 'arkmail' && this.recovering) {
      return Promise.reject(new Error('operacja anulowana'));
    }
    const generation = this.connectionGeneration;
    const task = this.commandQueue.then(async () => {
      if (!this.online || generation !== this.connectionGeneration) {
        throw new Error('transport offline: wysylka anulowana');
      }
      // Sprawdzenie takze w kolejce: timeout mogl nastapic po enqueue,
      // zanim poprzednia komenda zakonczyla sie i zwolnila ten task.
      if (source === 'arkmail' && this.recovering) {
        throw new Error('operacja anulowana');
      }
      let echoEntry: PendingEcho | undefined;
      if (echo) {
        // Kazda operacja ma wlasna tozsamosc, takze przy identycznym tekscie.
        // Termin ogranicza pomylke z pozniejsza, reczna komenda gracza.
        const entry: PendingEcho = {
          id: this.nextEchoId++,
          line,
          source,
          timer: setTimeout(() => this.removePendingEcho(entry), PENDING_ECHO_TTL_MS),
        };
        (entry.timer as unknown as { unref?: () => void }).unref?.();
        echoEntry = entry;
        this.pendingEchoSends.push(entry);
        if (this.pendingEchoSends.length > PENDING_ECHO_CAP) {
          this.removePendingEcho(this.pendingEchoSends[0]!);
        }
      }
      try {
        // Hook jest wywolywany synchronicznie przez api.command.send. Flaga
        // rozroznia wysylke pluginu od komendy gracza takze przy tym samym tekscie.
        this.sendingOwn = true;
        let pending: Promise<void>;
        try {
          pending = this.api.command.send(line, echo, { preserveCase: true });
        } finally {
          this.sendingOwn = false;
        }
        await pending;
      } catch (err: unknown) {
        if (echoEntry) this.removePendingEcho(echoEntry);
        throw err;
      }
    });
    this.commandQueue = task.catch(() => {});
    return task;
  }

  private removePendingEcho(entry: PendingEcho): void {
    const index = this.pendingEchoSends.findIndex((candidate) => candidate.id === entry.id);
    if (index < 0) return;
    this.pendingEchoSends.splice(index, 1);
    clearTimeout(entry.timer);
  }

  private clearPendingEchoes(): void {
    for (const entry of this.pendingEchoSends) clearTimeout(entry.timer);
    this.pendingEchoSends = [];
  }

  openSession(): SessionScope {
    if (this.recovering) throw new Error('operacja anulowana');
    this.armTrigger();
    return this.sessions.openSession();
  }

  private clearRecoveryTimer(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  private finishRecovery(): void {
    this.recovering = false;
    this.clearRecoveryTimer();
  }

  beginRecovery(): void {
    if (this.recovering) {
      this.armTrigger();
      return;
    }
    this.recovering = true;
    this.armTrigger();
    const generation = this.connectionGeneration;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (!this.recovering || generation !== this.connectionGeneration) return;
      notify(
        this.api,
        'Nie potwierdzono zakonczenia poprzedniej odpowiedzi. Poczekaj na powrot zwyklego widoku gry lub polacz ponownie.',
        { title: 'Brak synchronizacji z gra', level: 'error' },
      );
      // Sam uplyw czasu nie dowodzi synchronizacji. Blokada i gag
      // pozostaja do zwyklego promptu albo ponownego polaczenia.
    }, RECOVERY_LIMIT_MS);
    (this.recoveryTimer as unknown as { unref?: () => void }).unref?.();
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

  beginModal(options?: { pager?: PagerModalHooks }): void {
    if (this.modalActive) return;
    this.modalActive = true;
    this.pagerModal = options?.pager ?? null;
    this.pagerOpen = false;
    this.hookId = this.api.commandHooks.register((command: string) => {
      if (this.sendingOwn) return undefined;
      if (this.pagerModal && this.pagerOpen && isPagerCommand(command)) {
        const hooks = this.pagerModal;
        if (/^(?:q|x)$/i.test(command.trim())) this.pagerOpen = false;
        // Przejecie najpierw anuluje sesje, wiec PagerSession nie wysle
        // wlasnego q. Komenda gracza idzie raz, z zachowanym zrodlem.
        hooks.onUserCommand();
        void this.enqueue(command, true, 'user').catch(() => {});
      } else {
        this.queue.push(command);
      }
      return null; // stlumienie: pager/edytor konsumuje wejscie
    }, MODAL_HOOK_PRIORITY);
  }

  /** Przekazuje pierwsza odlozona komende czytania do wlasnie
   *  otwartego pagera, zanim sesja pluginu zdazy wyslac q. */
  private takeoverQueuedPagerCommand(): void {
    if (!this.pagerModal) return;
    const index = this.queue.findIndex(isPagerCommand);
    if (index < 0) return;
    const command = this.queue.splice(index, 1)[0]!;
    const hooks = this.pagerModal;
    if (/^(?:q|x)$/i.test(command.trim())) this.pagerOpen = false;
    hooks.onUserCommand();
    void this.enqueue(command, true, 'user').catch(() => {});
  }

  endModal(): void {
    if (!this.modalActive) return;
    this.modalActive = false;
    const pagerHooks = this.pagerModal;
    this.pagerModal = null;
    this.pagerOpen = false;
    if (this.hookId !== null) {
      this.api.commandHooks.unregister(this.hookId);
      this.hookId = null;
    }
    const pending = this.queue.splice(0);
    if (!this.online) return;
    let dropped = false;
    for (const command of pending) {
      if (pagerHooks && isPagerCommand(command)) {
        dropped = true;
        continue;
      }
      // Fala 42: odtworzenie Z echem - to komenda gracza, wiec straznik
      // wejscia w poczte musi ja zobaczyc tak jak wpisana recznie.
      void this.enqueue(command, true, 'user').catch(() => {});
    }
    if (dropped) pagerHooks?.onCommandDropped();
  }

  /** Odcina stare wysylki i porzuca kolejke bez drenowania. */
  setOnline(online: boolean): void {
    this.online = online;
    if (online) return;
    this.connectionGeneration++;
    const needsRecovery = this.recovering || this.sessions.hasActive;
    this.recovering = false;
    this.clearRecoveryTimer();
    if (needsRecovery) this.beginRecovery();
    this.sessions.reconnect();
    this.commandQueue = Promise.resolve();
    this.clearPendingEchoes();
    if (this.hookId !== null) {
      this.api.commandHooks.unregister(this.hookId);
      this.hookId = null;
    }
    this.modalActive = false;
    this.pagerModal = null;
    this.pagerOpen = false;
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
    this.sessions.closeAll();
    this.queue = [];
    this.clearPendingEchoes();
    this.finishRecovery();
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
        // Zwykly prompt potwierdza koniec strumienia i zdejmuje odzyskiwanie.
        if (this.recovering && (proto.cls === 'prompt' || isPromptLine(proto.text))) {
          this.finishRecovery();
        }
        // Fala 42: echo wlasnej komendy (wysylka z echem) oznaczamy own
        // po dopasowaniu FIFO do zarejestrowanego tekstu - hook wejscia
        // w poczte gracza rozroznia wtedy gracza od pluginu takze pod
        // blokada sesji.
        if (this.pendingEchoSends.length > 0) {
          const echoed = proto.text.startsWith('→ ')
            ? proto.text.slice(2)
            : proto.cls === 'command'
              ? proto.text
              : null;
          if (echoed !== null) {
            const i = this.pendingEchoSends.findIndex((entry) => entry.line === echoed);
            if (i >= 0) {
              const entry = this.pendingEchoSends[i]!;
              this.removePendingEcho(entry);
              if (entry.source === 'arkmail') proto.own = true;
            }
          }
        }
        if (this.modalActive && this.pagerModal) {
          if (extractPagerPrompt(proto.text)) {
            this.pagerOpen = true;
            // Prompt jest dowodem otwarcia wlasnego pagera. Odlozona
            // komenda gracza ma pierwszenstwo przed automatycznym q.
            this.takeoverQueuedPagerCommand();
          } else if (proto.cls === 'prompt' || isPromptLine(proto.text)) {
            this.pagerOpen = false;
          }
        }
        // Najpierw wlasciciel sesji. Globalny subskrybent moze ja zamknac
        // i otworzyc kolejna, ale nie moze przejac biezacej linii.
        this.sessions.dispatch(proto);
        for (const cb of [...this.subscribers]) cb(proto);
        // Fala 16j: subskrybenci (parser) dostaja linie ZAWSZE; zwrot
        // null tlumi tylko wyswietlanie w glownym oknie gry, i to
        // wylacznie podczas operacji pluginowej (blokada sesji).
        if (type === 'mail' && (this.recovering || this.gagWhen?.())) return null;
        return line;
      },
      'arkmail',
    );
  }
}
