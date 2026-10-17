/**
 * CharStorage: trwalosc per postac nad localStorage klienta.
 *
 * Klucze: "arkmail.<postac>.<klucz>" (postac mala litera). Do czasu
 * pierwszego gmcp.char.info piszemy do przestrzeni "_unknown".
 * Uszkodzony JSON w readzie -> null (nigdy wyjatek do pluginu).
 *
 * Decyzja: archiwum trzymamy w localStorage (listy to krotkie teksty,
 * limit ~5 MB wystarcza na tysiace); IndexedDB odlozone - patrz
 * docs/PROTOCOL.md.
 */

/** Minimalny kontrakt KV (localStorage w produkcji, mapa w testach). */
export interface KVLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class CharStorage {
  private char = '_unknown';

  constructor(private readonly kv: KVLike) {}

  setCharacter(name: string): void {
    const normalized = name.trim().toLowerCase();
    if (normalized) this.char = normalized;
  }

  get character(): string {
    return this.char;
  }

  getJSON<T>(key: string): T | null {
    const raw = this.kv.getItem(this.scoped(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.kv.setItem(this.scoped(key), JSON.stringify(value));
  }

  remove(key: string): void {
    this.kv.removeItem(this.scoped(key));
  }

  private scoped(key: string): string {
    return `arkmail.${this.char}.${key}`;
  }
}
