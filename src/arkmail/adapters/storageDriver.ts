/** Asynchroniczny magazyn par klucz-wartosc dla danych wtyczki. */
export interface StorageDriver {
  loadAll(): Promise<Record<string, string>>;
  put(key: string, value: string): Promise<void>;
  putMany(values: Readonly<Record<string, string>>): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}

/** Sterownik testowy i zapasowy. Zwracane dane sa kopia stanu w RAM. */
export class MemoryStorageDriver implements StorageDriver {
  private readonly values = new Map<string, string>();

  async loadAll(): Promise<Record<string, string>> {
    return Object.fromEntries(this.values);
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async putMany(values: Readonly<Record<string, string>>): Promise<void> {
    for (const [key, value] of Object.entries(values)) this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async close(): Promise<void> {}
}

const STORE_NAME = "dane";

/** Trwaly magazyn IndexedDB. Jeden obiekt przechowuje wszystkie klucze wtyczki. */
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
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).openCursor();
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

  async put(key: string, value: string): Promise<void> {
    await this.write("put", key, value);
  }

  async putMany(values: Readonly<Record<string, string>>): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
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

  async delete(key: string): Promise<void> {
    await this.write("delete", key);
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
        request = this.factory.open(this.databaseName, 1);
      } catch (error) {
        reject(error);
        return;
      }
      let failed = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
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

  private async write(operation: "put" | "delete", key: string, value?: string): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      if (operation === "put") store.put(value!, key);
      else store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Blad zapisu IndexedDB."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Zapis IndexedDB przerwany."));
    });
  }
}
