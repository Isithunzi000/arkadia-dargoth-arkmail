import {
  IndexedDbStorageDriver,
  MemoryStorageDriver,
  type StorageDriver,
} from "./storageDriver";

export { MemoryStorageDriver } from "./storageDriver";

export const STORAGE_WRITE_ERROR = "Nie udalo sie zapisac danych archiwum";

/**
 * Odczyt i zmiany sa natychmiast widoczne w RAM. Trwaly zapis wykonuje
 * kolejka w tej samej kolejnosci. Blad jest zgloszony raz i nie zatrzymuje
 * pozniejszych operacji.
 */
export class WriteThroughStorage {
  private readonly values: Map<string, string>;
  private queue: Promise<void> = Promise.resolve();
  private errorReported = false;

  private constructor(
    private readonly driver: StorageDriver,
    initialValues: Record<string, string>,
    private readonly onError: () => void,
  ) {
    this.values = new Map(Object.entries(initialValues));
  }

  static async open(driver: StorageDriver, onError: () => void): Promise<WriteThroughStorage> {
    return new WriteThroughStorage(driver, await driver.loadAll(), onError);
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
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

  delete(key: string): void {
    this.values.delete(key);
    this.enqueue(() => this.driver.delete(key));
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  async close(): Promise<void> {
    await this.flush();
    await this.driver.close();
  }

  private enqueue(operation: () => Promise<void>): void {
    this.queue = this.queue.then(operation).catch(() => {
      if (this.errorReported) return;
      this.errorReported = true;
      this.onError();
    });
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
    return WriteThroughStorage.open(new MemoryStorageDriver(), onError);
  }
}
