/** Kolejka FIFO transakcji korzystajacych ze wspolnego transportu. */
export class SessionLock {
  private tail: Promise<void> = Promise.resolve();
  private active = 0;
  private readonly waiting = new Set<() => void>();

  get locked(): boolean {
    return this.active > 0;
  }

  async acquire(): Promise<() => void> {
    this.active++;
    let releaseNext!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    const prev = this.tail;
    this.tail = prev.then(() => next);

    return new Promise<() => void>((resolve, reject) => {
      let settled = false;
      let released = false;
      const cancel = (): void => {
        if (settled) return;
        settled = true;
        this.active--;
        this.waiting.delete(cancel);
        reject(new Error('operacja anulowana'));
      };
      this.waiting.add(cancel);
      void prev.then(() => {
        this.waiting.delete(cancel);
        if (settled) {
          releaseNext();
          return;
        }
        settled = true;
        resolve(() => {
          if (released) return;
          released = true;
          this.active--;
          releaseNext();
        });
      });
    });
  }

  /** Odrzuca operacje oczekujace; aktywna konczy sie przez swoja sesje. */
  cancelWaiting(): void {
    for (const cancel of [...this.waiting]) cancel();
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
