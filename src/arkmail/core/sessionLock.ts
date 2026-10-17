/**
 * SessionLock: asynchroniczny mutex na wspoldzielony Transport.
 *
 * Pager i edytor poczty konsumuja caly strumien wejscia gry az do "q"/"**",
 * wiec dwie transakcje pocztowe naraz przeplatalyby sobie linie.
 * Kazda sesja (mailbox/pager/editor) biegnie w runExclusive().
 *
 * Implementacja: lancuch obietnic (kolejka FIFO), bez timerow,
 * deterministyczny pod testami. Zwolnienie jest idempotentne.
 */
export class SessionLock {
  private tail: Promise<void> = Promise.resolve();
  private active = 0;

  /** true, gdy ktokolwiek trzyma blokade lub czeka w kolejce. */
  get locked(): boolean {
    return this.active > 0;
  }

  /** Czeka na swoja kolej i zwraca funkcje zwalniajaca (idempotentna). */
  async acquire(): Promise<() => void> {
    this.active++;
    let releaseNext!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      releaseNext();
    };
  }

  /** Wykonuje fn pod blokada; zwalnia takze przy rzuceniu wyjatku. */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
