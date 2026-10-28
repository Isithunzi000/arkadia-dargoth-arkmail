/** Asynchroniczny magazyn ustawien i pojedynczych listow. */
export type LettersByCharacter = Record<string, Record<string, string>>;

export interface StorageDriver {
  loadAll(): Promise<Record<string, string>>;
  loadAllLetters(): Promise<LettersByCharacter>;
  put(key: string, value: string): Promise<void>;
  putMany(values: Readonly<Record<string, string>>): Promise<void>;
  putLetters(character: string, values: Readonly<Record<string, string>>): Promise<void>;
  delete(key: string): Promise<void>;
  clearLetters(character: string): Promise<void>;
  close(): Promise<void>;
}

/** Sterownik testowy i zapasowy. Zwracane dane sa kopia stanu w RAM. */
export class MemoryStorageDriver implements StorageDriver {
  private readonly values = new Map<string, string>();
  private readonly letters = new Map<string, Map<string, string>>();

  async loadAll(): Promise<Record<string, string>> {
    return Object.fromEntries(this.values);
  }

  async loadAllLetters(): Promise<LettersByCharacter> {
    return Object.fromEntries(
      [...this.letters].map(([character, values]) => [character, Object.fromEntries(values)]),
    );
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async putMany(values: Readonly<Record<string, string>>): Promise<void> {
    for (const [key, value] of Object.entries(values)) this.values.set(key, value);
  }

  async putLetters(character: string, values: Readonly<Record<string, string>>): Promise<void> {
    const current = this.letters.get(character) ?? new Map<string, string>();
    this.letters.set(character, current);
    for (const [id, value] of Object.entries(values)) current.set(id, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async clearLetters(character: string): Promise<void> {
    this.letters.delete(character);
  }

  async close(): Promise<void> {}
}

const STATE_STORE = "state";
const LETTERS_STORE = "letters";
const LEGACY_STORE = "dane";
const DATABASE_VERSION = 2;

interface StoredLetter {
  character: string;
  id: string;
  value: string;
}

/** Trwaly magazyn IndexedDB. Listy i ustawienia maja osobne obszary. */
export class IndexedDbStorageDriver implements StorageDriver {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private database: IDBDatabase | null = null;
  private readonly factory: IDBFactory | undefined;

  constructor(
    factory?: IDBFactory,
    private readonly databaseName = "arkmail",
  ) {
    this.factory = factory ?? globalThis.indexedDB;
  }

  async loadAll(): Promise<Record<string, string>> {
    const database = await this.openDatabase();
    return new Promise<Record<string, string>>((resolve, reject) => {
      const values: Record<string, string> = {};
      const transaction = database.transaction(STATE_STORE, "readonly");
      const request = transaction.objectStore(STATE_STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        values[String(cursor.key)] = String(cursor.value);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(values);
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad odczytu IndexedDB."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Odczyt IndexedDB przerwany."));
    });
  }

  async loadAllLetters(): Promise<LettersByCharacter> {
    const database = await this.openDatabase();
    return new Promise<LettersByCharacter>((resolve, reject) => {
      const result: LettersByCharacter = {};
      const transaction = database.transaction(LETTERS_STORE, "readonly");
      const request = transaction.objectStore(LETTERS_STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as StoredLetter;
        (result[record.character] ??= {})[record.id] = record.value;
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad odczytu listow."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Odczyt listow przerwany."));
    });
  }

  async put(key: string, value: string): Promise<void> {
    await this.writeState("put", key, value);
  }

  async putMany(values: Readonly<Record<string, string>>): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STATE_STORE, "readwrite");
      const store = transaction.objectStore(STATE_STORE);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad zapisu IndexedDB."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Zapis IndexedDB przerwany."));
      try {
        for (const [key, value] of Object.entries(values)) store.put(value, key);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async putLetters(character: string, values: Readonly<Record<string, string>>): Promise<void> {
    if (Object.keys(values).length === 0) return;
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LETTERS_STORE, "readwrite");
      const store = transaction.objectStore(LETTERS_STORE);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad zapisu listow."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Zapis listow przerwany."));
      try {
        for (const [id, value] of Object.entries(values)) store.put({ character, id, value });
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async delete(key: string): Promise<void> {
    await this.writeState("delete", key);
  }

  async clearLetters(character: string): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LETTERS_STORE, "readwrite");
      const request = transaction.objectStore(LETTERS_STORE).index("character").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if ((cursor.value as StoredLetter).character === character) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad usuwania listow."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Usuwanie listow przerwane."));
    });
  }

  async close(): Promise<void> {
    const pending = this.databasePromise;
    if (pending) {
      try {
        await pending;
      } catch {
        return;
      }
    }
    this.database?.close();
    this.database = null;
    this.databasePromise = null;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) {
        reject(new Error("IndexedDB jest niedostepne."));
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(this.databaseName, DATABASE_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      let failed = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        if (database.objectStoreNames.contains(LEGACY_STORE)) {
          database.deleteObjectStore(LEGACY_STORE);
        }
        if (!database.objectStoreNames.contains(STATE_STORE)) {
          database.createObjectStore(STATE_STORE);
        }
        if (!database.objectStoreNames.contains(LETTERS_STORE)) {
          const letters = database.createObjectStore(LETTERS_STORE, {
            keyPath: ["character", "id"],
          });
          letters.createIndex("character", "character", { unique: false });
        }
      };
      request.onerror = () => {
        failed = true;
        reject(request.error ?? new Error("Nie mozna otworzyc IndexedDB."));
      };
      request.onblocked = () => {
        failed = true;
        reject(new Error("Otwarcie IndexedDB jest zablokowane."));
      };
      request.onsuccess = () => {
        if (failed) {
          request.result.close();
          return;
        }
        this.database = request.result;
        resolve(request.result);
      };
    });
    this.databasePromise = opening;
    void opening.catch(() => {
      if (this.databasePromise === opening) this.databasePromise = null;
    });
    return opening;
  }

  private async writeState(operation: "put" | "delete", key: string, value?: string): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STATE_STORE, "readwrite");
      const store = transaction.objectStore(STATE_STORE);
      if (operation === "put") store.put(value!, key);
      else store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad zapisu IndexedDB."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Zapis IndexedDB przerwany."));
    });
  }
}
