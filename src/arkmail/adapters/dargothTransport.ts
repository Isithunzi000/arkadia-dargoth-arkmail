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
  onUserCommand: (command: string) => void;
  /** Komende czytania odrzucono, bo pager jest juz zamkniety. */
  onCommandDropped: () => void;
}

/** Priorytet hooka modalnego: wysoko, zanim aliasy/inne wtyczki. */
const MODAL_HOOK_PRIORITY = 100;

/** Fala 42: pamiec ostatnich wysylek z echem oczekujacych na linie-echo. */
const PENDING_ECHO_CAP = 10;
const PENDING_ECHO_TTL_MS = 10_000;

export const MODAL_QUEUE_DROPPED_MESSAGE =
  'Nie wykonano komend odlozonych podczas operacji pocztowej. ' +
  'Powtorz je po powrocie do zwyklego widoku gry.';

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

const isPagerCloseCommand = (command: string): boolean => /^(?:q|x)$/i.test(command.trim());

export class DargothTransport implements Transport {
  private readonly subscribers = new Set<(line: ProtoLine) => void>();
  private readonly sessions = new SessionScopeRegistry();
  private triggerArmed = false;
  private modalActive = false;
  private hookId: string | null = null;
  private pagerModal: PagerModalHooks | null = null;
  private pagerOpen = false;
  private pagerCloseSent = false;
  private pagerClosePromptSeen = false;
  private pagerTakenOver = false;
  private pagerCloseFailed = false;
  private pagerCloseAttempt = 0;
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
  private playerMailMode = false;

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

  /** Lokalna operacja moze zachowac dotychczasowy stan polaczenia przy anulowaniu sesji. */
  isOnline(): boolean {
    return this.online;
  }

  send(line: string, echo = false): Promise<void> {
    if (!this.pagerModal || !isPagerCloseCommand(line)) return this.enqueue(line, echo);
    if (this.pagerCloseSent) return Promise.resolve();
    return this.startPagerClose(line, echo);
  }

  /** Automatyczne q jest pojedyncze dla danego pagera; reczne q/x omija te sciezke. */
  private startPagerClose(line: string, echo: boolean): Promise<void> {
    if (!this.pagerModal) return this.enqueue(line, echo);
    this.pagerOpen = false;
    this.pagerCloseSent = true;
    this.pagerClosePromptSeen = false;
    const attempt = ++this.pagerCloseAttempt;
    const result = this.enqueue(line, echo, 'arkmail');
    void result.catch(() => {
      if (attempt !== this.pagerCloseAttempt || this.pagerClosePromptSeen) return;
      this.pagerCloseAttempt++;
      this.pagerCloseSent = false;
      this.pagerClosePromptSeen = false;
      this.pagerOpen = false;
      this.pagerCloseFailed = true;
    });
    return result;
  }

  /** Reczne q/x przechodzi przez oryginalny kanal klienta, bez kopii i kolejki. */
  private takeOverPagerClose(command: string): void {
    const hooks = this.pagerModal;
    if (!hooks) return;
    this.pagerCloseAttempt++;
    this.pagerOpen = false;
    this.pagerCloseSent = true;
    this.pagerClosePromptSeen = false;
    this.pagerTakenOver = true;
    this.pagerCloseFailed = false;
    hooks.onUserCommand(command);
  }

  /** Jedna komenda czeka na zakonczenie przetwarzania poprzedniej. */
  private enqueue(
    line: string,
    echo: boolean | undefined,
    source: CommandSource = 'arkmail',
  ): Promise<void> {
    if (!this.online) return Promise.reject(new Error('transport offline'));
    if (source === 'arkmail' && this.playerMailMode) {
      return Promise.reject(new Error('operacja anulowana'));
    }
    const generation = this.connectionGeneration;
    const task = this.commandQueue.then(async () => {
      if (!this.online || generation !== this.connectionGeneration) {
        throw new Error('transport offline: wysylka anulowana');
      }
      // Sprawdzenie takze w kolejce: reczna poczta mogla rozpoczac sie
      // po enqueue, zanim poprzednia komenda zakonczyla ten task.
      if (source === 'arkmail' && this.playerMailMode) {
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

  /** Blokuje wylacznie komendy pluginu; ruch gracza przechodzi bez zmian. */
  setPlayerMailMode(active: boolean): void {
    this.playerMailMode = active;
  }

  openSession(): SessionScope {
    if (this.playerMailMode) throw new Error('operacja anulowana');
    this.armTrigger();
    return this.sessions.openSession();
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
    this.pagerCloseSent = false;
    this.pagerClosePromptSeen = false;
    this.pagerTakenOver = false;
    this.pagerCloseFailed = false;
    this.hookId = this.api.commandHooks.register((command: string) => {
      if (this.sendingOwn) return undefined;
      if (this.pagerModal && isPagerCloseCommand(command)) {
        // Kazde reczne q/x wraca do klienta jako oryginalna komenda.
        // Plugin jedynie konczy wlasna sesje i wstrzymuje automatyzacje.
        this.takeOverPagerClose(command);
        return undefined;
      } else if (!this.modalActive) {
        // Po zamknieciu modalu kazda komenda wraca do zwyklego klienta.
        return undefined;
      } else if (this.pagerModal && this.pagerOpen && isPagerCommand(command)) {
        const hooks = this.pagerModal;
        // Przejecie najpierw anuluje sesje, wiec PagerSession nie wysle
        // wlasnego q. Komenda gracza idzie raz, z zachowanym zrodlem.
        this.pagerTakenOver = true;
        hooks.onUserCommand(command);
        void this.enqueue(command, true, 'user').catch(() => {});
      } else {
        this.queue.push(command);
      }
      return null; // stlumienie: pager/edytor konsumuje wejscie
    }, MODAL_HOOK_PRIORITY);
  }

  /** Jawny prompt i idle-completion korzystaja z tej samej procedury. */
  confirmPagerOpen(): void {
    if (!this.modalActive || !this.pagerModal || this.pagerCloseSent) return;
    this.pagerOpen = true;
    this.takeoverQueuedPagerCommand();
  }

  /** Przekazuje pierwsza odlozona komende czytania do wlasnie
   *  otwartego pagera, zanim sesja pluginu zdazy wyslac q. */
  private takeoverQueuedPagerCommand(): void {
    if (!this.pagerModal || this.pagerCloseSent) return;
    const index = this.queue.findIndex(isPagerCommand);
    if (index < 0) return;
    const command = this.queue[index]!;
    const hooks = this.pagerModal;
    this.queue.splice(index, 1);
    this.pagerTakenOver = true;
    hooks.onUserCommand(command);
    void this.enqueue(command, true, 'user').catch(() => {});
  }

  private clearPagerCloseLatch(): void {
    this.pagerCloseAttempt++;
    this.pagerModal = null;
    this.pagerOpen = false;
    this.pagerCloseSent = false;
    this.pagerClosePromptSeen = false;
    this.pagerTakenOver = false;
    this.pagerCloseFailed = false;
    if (this.hookId !== null) {
      this.api.commandHooks.unregister(this.hookId);
      this.hookId = null;
    }
  }

  endModal(): void {
    if (!this.modalActive) return;
    this.modalActive = false;
    const pagerHooks = this.pagerModal;
    const discardQueue = this.pagerTakenOver || this.pagerCloseFailed;
    this.pagerOpen = false;
    // Zakonczona operacja nie moze przechwytywac pozniejszych komend gracza.
    this.clearPagerCloseLatch();
    const pending = this.queue.splice(0);
    if (!this.online) return;
    let dropped = false;
    if (discardQueue) {
      // Stara intencja nie moze trafic do nierozstrzygnietego pagera ani
      // edytora. Swieze komendy po zdjeciu modalu nadal przechodza.
      dropped = pending.length > 0;
    } else {
      for (const command of pending) {
        if (pagerHooks && isPagerCommand(command)) {
          dropped = true;
          continue;
        }
        // Sukces potwierdzony zachowuje odtwarzanie Z echem i kolejnoscia.
        void this.enqueue(command, true, 'user').catch(() => {});
      }
    }
    if (dropped) {
      if (pagerHooks) pagerHooks.onCommandDropped();
      else notify(this.api, MODAL_QUEUE_DROPPED_MESSAGE, { level: 'warning' });
    }
  }

  /** Odcina stare wysylki i porzuca kolejke bez drenowania. */
  setOnline(online: boolean): void {
    this.online = online;
    if (online) return;
    this.connectionGeneration++;
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
    this.pagerCloseSent = false;
    this.pagerClosePromptSeen = false;
    this.pagerTakenOver = false;
    this.pagerCloseFailed = false;
    this.pagerCloseAttempt++;
    this.queue = [];
  }

  /** Zdejmuje trigger i modal-guard; do wywolania w destroy() pluginu. */
  dispose(): void {
    this.endModal();
    this.clearPagerCloseLatch();
    if (this.triggerArmed) {
      this.api.triggers.removeByTag('arkmail');
      this.triggerArmed = false;
    }
    this.subscribers.clear();
    this.sessions.closeAll();
    this.queue = [];
    this.clearPendingEchoes();
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
        if (this.pagerCloseSent && (proto.cls === 'prompt' || isPromptLine(proto.text))) {
          this.pagerClosePromptSeen = true;
        }
        if (this.modalActive && this.pagerModal) {
          if (extractPagerPrompt(proto.text)) {
            // Pozny lub powtorzony prompt po wyslaniu zamkniecia nie
            // otwiera ponownie drogi dla duplikatu q/x.
            if (!this.pagerCloseSent) {
              // Prompt jest dowodem otwarcia wlasnego pagera. Odlozona
              // komenda gracza ma pierwszenstwo przed automatycznym q.
              this.confirmPagerOpen();
            }
          } else if (proto.cls === 'prompt' || isPromptLine(proto.text)) {
            this.pagerOpen = false;
            if (this.pagerCloseSent && this.pagerClosePromptSeen) {
              // Zwykly prompt konczy poprzednie zamykanie. Ponowiona operacja
              // moze otworzyc nowy pager i musi moc zamknac go niezaleznie.
              this.pagerCloseAttempt++;
              this.pagerCloseSent = false;
              this.pagerClosePromptSeen = false;
            }
          }
        }
        // Najpierw wlasciciel sesji. Globalny subskrybent moze ja zamknac
        // i otworzyc kolejna, ale nie moze przejac biezacej linii.
        this.sessions.dispatch(proto);
        if (!this.modalActive && this.pagerCloseSent && this.pagerClosePromptSeen) {
          this.clearPagerCloseLatch();
        }
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
