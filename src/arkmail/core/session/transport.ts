/**
 * Abstrakcja transportu dla maszyn stanow sesji pocztowych.
 * Produkcja: adapter Dargoth (commandHooks + triggery). Testy: MockTransport
 * odtwarzajacy golden fixtures. Port WWW/Mudlet: wlasna implementacja.
 */

import { isPromptLine } from './lines.js';

export interface ProtoLine {
  cls: string;
  text: string;
  /** Echo wlasnej komendy pluginu (oznacza transport, Fala 42). */
  own?: boolean;
}

/** Rejestracja jednej sesji wiazana z generacja polaczenia. */
export interface SessionScope {
  readonly id: number;
  readonly generation: number;
  readonly active: boolean;
  subscribe(cb: (line: ProtoLine) => void): () => void;
  close(): void;
}

class RegisteredSession implements SessionScope {
  private readonly callbacks = new Set<(line: ProtoLine) => void>();
  private open = true;

  constructor(
    readonly id: number,
    readonly generation: number,
    private readonly onClose: (session: RegisteredSession) => void,
  ) {}

  get active(): boolean {
    return this.open;
  }

  subscribe(cb: (line: ProtoLine) => void): () => void {
    if (!this.open) return () => {};
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  dispatch(line: ProtoLine): void {
    if (!this.open) return;
    for (const cb of [...this.callbacks]) cb(line);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.callbacks.clear();
    this.onClose(this);
  }
}

/** Wspolny rejestr identyfikatorow i generacji dla adapterow transportu. */
export class SessionScopeRegistry {
  private readonly sessions = new Set<RegisteredSession>();
  private nextId = 0;
  private generation = 0;

  get hasActive(): boolean {
    return this.sessions.size > 0;
  }

  openSession(): SessionScope {
    // Jeden uporzadkowany kanal odpowiedzi nie moze karmic dwoch transakcji.
    // Lokalny identyfikator nie rozstrzyga, ktorej z nich odpowiada serwer.
    if (this.sessions.size > 0) throw new Error('operacja anulowana');
    const session = new RegisteredSession(
      ++this.nextId,
      this.generation,
      (closed) => this.sessions.delete(closed),
    );
    this.sessions.add(session);
    return session;
  }

  dispatch(line: ProtoLine): void {
    for (const session of [...this.sessions]) session.dispatch(line);
  }

  reconnect(): void {
    this.generation++;
    this.closeAll();
  }

  closeAll(): void {
    for (const session of [...this.sessions]) session.close();
  }
}

export interface Transport {
  /** Wysyla jedna linie do gry. echo=true: linia pokazuje sie w oknie
   *  gry jak wpisana recznie (Fala 28h: compose i "wyslij zwierze" sa
   *  widoczne dla gracza); domyslnie bez echa (operacje pluginowe). */
  send(line: string, echo?: boolean): void | Promise<void>;
  /** Otwiera rejestracje rozdzielajaca sesje i generacje polaczenia. */
  openSession(): SessionScope;
  /** Pozostawia odpowiedzi mail gagowane do potwierdzonego promptu gry. */
  beginRecovery(): void;
  /** Globalna subskrypcja linii; zwraca unsubscribe. */
  subscribe(cb: (line: ProtoLine) => void): () => void;
}

export class MockTransport implements Transport {
  readonly sent: string[] = [];
  /** Flagi echa rownolegle do sent (Fala 28h). */
  readonly sentEcho: boolean[] = [];
  private subs = new Set<(line: ProtoLine) => void>();
  private readonly sessions = new SessionScopeRegistry();
  private recovering = false;

  send(line: string, echo = false): void {
    if (this.recovering) throw new Error('operacja anulowana');
    this.sent.push(line);
    this.sentEcho.push(echo);
  }

  openSession(): SessionScope {
    if (this.recovering) throw new Error('operacja anulowana');
    return this.sessions.openSession();
  }

  beginRecovery(): void {
    this.recovering = true;
  }

  setOnline(online: boolean): void {
    if (online) return;
    if (this.sessions.hasActive) this.beginRecovery();
    this.sessions.reconnect();
  }

  subscribe(cb: (line: ProtoLine) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  emit(line: ProtoLine): void {
    if (this.recovering && (line.cls === 'prompt' || isPromptLine(line.text))) {
      this.recovering = false;
    }
    for (const cb of [...this.subs]) cb(line);
    this.sessions.dispatch(line);
  }

  /** Odtwarzanie fixture'a: po kazdej linii oddaje sterowanie do
   *  mikrozadan, zeby maszyny stanow zdazyly zareagowac (staged sending). */
  async replay(lines: ProtoLine[]): Promise<void> {
    for (const line of lines) {
      this.emit(line);
      await new Promise((r) => setImmediate(r));
    }
  }
}
