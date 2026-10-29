/**
 * Abstrakcja transportu dla maszyn stanow sesji pocztowych.
 * Produkcja: adapter Dargoth (commandHooks + triggery). Testy: MockTransport
 * odtwarzajacy golden fixtures. Port WWW/Mudlet: wlasna implementacja.
 */

export interface ProtoLine {
  cls: string;
  text: string;
}

export interface Transport {
  /** Wysyla jedna linie do gry. echo=true: linia pokazuje sie w oknie
   *  gry jak wpisana recznie (Fala 28h: compose i "wyslij zwierze" sa
   *  widoczne dla gracza); domyslnie bez echa (operacje pluginowe). */
  send(line: string, echo?: boolean): void | Promise<void>;
  /** Subskrypcja linii przychodzacych; zwraca unsubscribe. */
  subscribe(cb: (line: ProtoLine) => void): () => void;
}

export class MockTransport implements Transport {
  readonly sent: string[] = [];
  /** Flagi echa rownolegle do sent (Fala 28h). */
  readonly sentEcho: boolean[] = [];
  private subs = new Set<(line: ProtoLine) => void>();

  send(line: string, echo = false): void {
    this.sent.push(line);
    this.sentEcho.push(echo);
  }

  subscribe(cb: (line: ProtoLine) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  emit(line: ProtoLine): void {
    for (const cb of [...this.subs]) cb(line);
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
