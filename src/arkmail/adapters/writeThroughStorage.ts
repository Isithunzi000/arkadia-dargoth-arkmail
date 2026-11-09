import {
  IndexedDbStorageDriver,
  MemoryStorageDriver,
  type LettersByCharacter,
  type StorageDriver,
} from "./storageDriver";

export { MemoryStorageDriver } from "./storageDriver";

export const STORAGE_WRITE_ERROR = "Nie udalo sie zapisac danych archiwum";

interface LetterValue {
  id: string;
}

interface PendingLetter {
  character: string;
  id: string;
  value: string;
}

/**
 * Odczyt i zmiany sa natychmiast widoczne w RAM. Trwaly zapis wykonuje
 * kolejka w tej samej kolejnosci. Listy sa zapisywane jako osobne rekordy.
 */
export class WriteThroughStorage {
  private readonly values: Map<string, string>;
  private readonly letters = new Map<string, Map<string, string>>();
  private readonly pendingLetters = new Map<string, PendingLetter>();
  private queue: Promise<void> = Promise.resolve();
  private errorReported = false;

  private constructor(
    private readonly driver: StorageDriver,
    initialValues: Record<string, string>,
    initialLetters: LettersByCharacter,
    private readonly onError: () => void,
    private readonly durable: boolean,
  ) {
    this.values = new Map(Object.entries(initialValues));
    for (const [character, letters] of Object.entries(initialLetters)) {
      this.letters.set(character, new Map(Object.entries(letters)));
    }
  }

  static async open(
    driver: StorageDriver,
    onError: () => void,
    durable = true,
  ): Promise<WriteThroughStorage> {
    const [values, letters] = await Promise.all([
      driver.loadAll(),
      driver.loadAllLetters ? driver.loadAllLetters() : Promise.resolve({}),
    ]);
    return new WriteThroughStorage(driver, values, letters, onError, durable);
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  getLetters(character: string): Record<string, string> {
    return Object.fromEntries(this.letters.get(character) ?? []);
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
    this.enqueue(() => this.driver.put(key, value));
  }

  setMany(values: Readonly<Record<string, string>>): void {
    const batch = { ...values };
    for (const [key, value] of Object.entries(batch)) this.values.set(key, value);
    this.enqueue(() => this.driver.putMany(batch));
  }

  setLetters(character: string, letters: readonly LetterValue[]): void {
    // Zapis w tle zglasza blad przez onError. Odrzucenie operacji jest tu
    // obsluzone, wiec istniejace wywolania synchroniczne nie tworza unhandled rejection.
    void this.writeLetters(character, letters, true).catch(() => {});
  }

  /** Potwierdza trwaly zapis zmienionych rekordow bez pelnego flush magazynu. */
  async setLettersConfirmed(character: string, letters: readonly LetterValue[]): Promise<void> {
    if (!this.durable) {
      throw new Error("Nie mozna potwierdzic trwalego zapisu, poniewaz IndexedDB nie dziala.");
    }
    // Wywolujacy otrzymuje blad konkretnej operacji. Kolejka nadal moze
    // wykonac pozniejsze zapisy, a ogolny onError nie dubluje komunikatu.
    await this.writeLetters(character, letters, false);
  }

  private writeLetters(
    character: string,
    letters: readonly LetterValue[],
    reportError: boolean,
  ): Promise<void> {
    const current = this.letters.get(character) ?? new Map<string, string>();
    this.letters.set(character, current);
    let changed = false;
    let retryPending = false;
    for (const letter of letters) {
      const value = JSON.stringify(letter);
      const key = JSON.stringify([character, letter.id]);
      if (current.get(letter.id) === value) {
        if (this.pendingLetters.has(key)) retryPending = true;
        continue;
      }
      current.set(letter.id, value);
      this.pendingLetters.set(key, { character, id: letter.id, value });
      changed = true;
    }
    // Fala 28: fizyczny purge - rekordy, ktorych NIE ma w przekazanym
    // stanie, wypadaja tez z magazynu (wczesniej setLetters robil
    // wylacznie upsert i zombie zostawaly w IndexedDB na zawsze).
    const alive = new Set(letters.map((letter) => letter.id));
    const removed: string[] = [];
    for (const id of current.keys()) {
      if (alive.has(id)) continue;
      removed.push(id);
      this.pendingLetters.delete(JSON.stringify([character, id]));
    }
    for (const id of removed) current.delete(id);
    const operations: Promise<void>[] = [];
    if (changed || retryPending) {
      operations.push(this.enqueue(() => this.flushPendingLetters(), reportError));
    }
    if (removed.length > 0) {
      const batch = removed;
      operations.push(this.enqueue(() => this.driver.deleteLetters(character, batch), reportError));
    }
    return Promise.all(operations).then(() => {});
  }

  delete(key: string): void {
    this.values.delete(key);
    this.enqueue(() => this.driver.delete(key));
  }

  clearLetters(character: string): void {
    this.letters.delete(character);
    for (const [key, letter] of this.pendingLetters) {
      if (letter.character === character) this.pendingLetters.delete(key);
    }
    this.enqueue(() => this.driver.clearLetters(character));
  }

  async clearMailData(character: string, keys: readonly string[]): Promise<void> {
    const operation = this.queue.then(async () => {
      await this.driver.clearMailData(character, keys);
      this.letters.delete(character);
      for (const [key, letter] of this.pendingLetters) {
        if (letter.character === character) this.pendingLetters.delete(key);
      }
      for (const key of keys) this.values.delete(key);
    });
    this.queue = operation.catch(() => {
      if (this.errorReported) return;
      this.errorReported = true;
      this.onError();
    });
    await operation;
  }

  async flush(): Promise<void> {
    await this.queue;
    if (this.pendingLetters.size === 0) return;
    this.enqueue(() => this.flushPendingLetters());
    await this.queue;
  }

  async close(): Promise<void> {
    await this.flush();
    await this.driver.close();
  }

  private async flushPendingLetters(): Promise<void> {
    if (this.pendingLetters.size === 0) return;
    const pending = [...this.pendingLetters.entries()];
    const byCharacter = new Map<string, Record<string, string>>();
    for (const [, letter] of pending) {
      let values = byCharacter.get(letter.character);
      if (!values) {
        values = {};
        byCharacter.set(letter.character, values);
      }
      values[letter.id] = letter.value;
    }
    for (const [character, values] of byCharacter) {
      await this.driver.putLetters(character, values);
      for (const [key, letter] of pending) {
        if (letter.character === character && this.pendingLetters.get(key) === letter) {
          this.pendingLetters.delete(key);
        }
      }
    }
  }

  private enqueue(operation: () => Promise<void>, reportError = true): Promise<void> {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => {
      if (!reportError || this.errorReported) return;
      this.errorReported = true;
      this.onError();
    });
    return pending;
  }
}

/** Otwiera trwaly magazyn, a przy jego braku przechodzi na RAM. */
export async function openWriteThroughStorage(
  onError: () => void,
  factory?: IDBFactory,
): Promise<WriteThroughStorage> {
  const persistent = new IndexedDbStorageDriver(factory);
  try {
    return await WriteThroughStorage.open(persistent, onError);
  } catch {
    await persistent.close();
    onError();
    return WriteThroughStorage.open(new MemoryStorageDriver(), onError, false);
  }
}
