import type { ArchiveLetter } from "../core/archive";
import type { StorageDriver } from "./storageDriver";
import {
  openWriteThroughStorage,
  WriteThroughStorage,
} from "./writeThroughStorage";

/** Magazyn danych jednej postaci. Nazwa postaci jest znana przed otwarciem. */
export class CharStorage {
  private constructor(
    private readonly char: string,
    private readonly storage: WriteThroughStorage,
  ) {}

  static async open(
    character: string,
    driver: StorageDriver,
    onError: () => void,
  ): Promise<CharStorage> {
    const normalized = character.trim().toLowerCase();
    if (!normalized) throw new Error("Brak nazwy postaci dla magazynu.");
    return new CharStorage(normalized, await WriteThroughStorage.open(driver, onError));
  }

  static fromWriteThrough(character: string, storage: WriteThroughStorage): CharStorage {
    const normalized = character.trim().toLowerCase();
    if (!normalized) throw new Error("Brak nazwy postaci dla magazynu.");
    return new CharStorage(normalized, storage);
  }

  get character(): string {
    return this.char;
  }

  getLetters(): ArchiveLetter[] {
    const letters: ArchiveLetter[] = [];
    for (const raw of Object.values(this.storage.getLetters(this.char))) {
      try {
        letters.push(JSON.parse(raw) as ArchiveLetter);
      } catch {
        // Uszkodzony rekord nie blokuje odczytu pozostalych listow.
      }
    }
    return letters;
  }

  setLetters(letters: readonly ArchiveLetter[]): void {
    this.storage.setLetters(this.char, letters);
  }

  clearLetters(): void {
    this.storage.clearLetters(this.char);
  }

  async clearMailData(keys: readonly string[]): Promise<void> {
    await this.storage.clearMailData(this.char, keys.map((key) => this.scoped(key)));
  }

  getJSON<T>(key: string): T | null {
    const raw = this.storage.get(this.scoped(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.storage.set(this.scoped(key), JSON.stringify(value));
  }

  setJSONBatch(values: Readonly<Record<string, unknown>>): void {
    const batch: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      batch[this.scoped(key)] = JSON.stringify(value);
    }
    this.storage.setMany(batch);
  }

  remove(key: string): void {
    this.storage.delete(this.scoped(key));
  }

  async flush(): Promise<void> {
    await this.storage.flush();
  }

  async close(): Promise<void> {
    await this.storage.close();
  }

  private scoped(key: string): string {
    return `arkmail.${this.char}.${key}`;
  }
}

export async function openCharStorage(
  character: string,
  onError: () => void,
  factory?: IDBFactory,
): Promise<CharStorage> {
  const storage = await openWriteThroughStorage(onError, factory);
  return CharStorage.fromWriteThrough(character, storage);
}

/** Usuwa dawne klucze localStorage. Dane obce dla wtyczki zostaja nietkniete. */
export function cleanupLegacyStorage(): void {
  try {
    const legacy = globalThis.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < legacy.length; i++) {
      const key = legacy.key(i);
      if (key?.startsWith("arkmail.")) keys.push(key);
    }
    for (const key of keys) legacy.removeItem(key);
  } catch {
    // Brak dostepu do localStorage nie blokuje docelowego magazynu.
  }
}
