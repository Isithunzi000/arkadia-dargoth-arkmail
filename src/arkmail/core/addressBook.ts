/**
 * Fala UI-2 krok 1: ksiazka adresowa jako osobne klucze magazynu.
 * Trzy pule trzymaja sie z dala od cache listow:
 *  - grupy reczne (skladane przez gracza z bazy osob),
 *  - osoby importowane (zapamietani / przedstawieni z gry),
 *  - aliasy pocztowe zaimportowane z gry (tylko odczyt; rozstrzyga
 *    je serwer przy wysylce).
 * Czyszczenie zapisanych danych kasuje wylacznie klucze cache
 * (indeks, luki archiwum) - te klucze zostaja. Imiona w testach
 * syntetyczne.
 */

/** Minimalny interfejs magazynu (CharStorage go spelnia). */
export interface AddressBookIO {
  getJSON<T>(key: string): T | null;
  setJSON(key: string, value: unknown): void;
}

export const GROUPS_KEY = "grupy-kontaktow";
export const PEOPLE_KEY = "osoby-importowane";
export const ALIASES_KEY = "aliasy-importowane";

/** Grupa reczna: nazwa i czlonkowie (imiona gry, nie aliasy). */
export interface ContactGroup {
  name: string;
  members: string[];
}

/** Pule importowane z gry; zrodlem sa komendy, nie edycja reczna. */
export interface ImportedPeople {
  zapamietani: string[];
  przedstawieni: string[];
}

/** Alias pocztowy z gry: nazwa i adresaci rozwijani przez serwer. */
export interface ImportedAlias {
  name: string;
  targets: string[];
}

function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function cleanGroups(value: unknown): ContactGroup[] {
  if (!Array.isArray(value)) return [];
  const out: ContactGroup[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.name !== "string") continue;
    const name = candidate.name.trim();
    if (!name) continue;
    // Uszkodzony wpis (czlonkowie nie sa lista) odpada caly; pusta
    // lista to legalna grupa/alias oczekujacy na czlonkow.
    if (!Array.isArray(candidate.members)) continue;
    const members = cleanNames(candidate.members);
    const existing = out.find((g) => g.name === name);
    if (existing) {
      for (const member of members) {
        if (!existing.members.includes(member)) existing.members.push(member);
      }
    } else {
      out.push({ name, members });
    }
  }
  return out;
}

function cleanAliases(value: unknown): ImportedAlias[] {
  if (!Array.isArray(value)) return [];
  const out: ImportedAlias[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.name !== "string") continue;
    const name = candidate.name.trim();
    if (!name) continue;
    if (!Array.isArray(candidate.targets)) continue;
    const targets = cleanNames(candidate.targets);
    const existing = out.find((a) => a.name === name);
    if (existing) {
      for (const target of targets) {
        if (!existing.targets.includes(target)) existing.targets.push(target);
      }
    } else {
      out.push({ name, targets });
    }
  }
  return out;
}

export function loadGroups(io: AddressBookIO): ContactGroup[] {
  return cleanGroups(io.getJSON(GROUPS_KEY));
}

export function saveGroups(io: AddressBookIO, groups: readonly ContactGroup[]): void {
  io.setJSON(GROUPS_KEY, cleanGroups(groups));
}

function cleanPeople(value: unknown): ImportedPeople {
  if (typeof value !== "object" || value === null) {
    return { zapamietani: [], przedstawieni: [] };
  }
  const candidate = value as Record<string, unknown>;
  return {
    zapamietani: cleanNames(candidate.zapamietani),
    przedstawieni: cleanNames(candidate.przedstawieni),
  };
}

export function loadImportedPeople(io: AddressBookIO): ImportedPeople {
  return cleanPeople(io.getJSON(PEOPLE_KEY));
}

export function saveImportedPeople(
  io: AddressBookIO,
  people: ImportedPeople,
): void {
  io.setJSON(PEOPLE_KEY, {
    zapamietani: cleanNames(people.zapamietani),
    przedstawieni: cleanNames(people.przedstawieni),
  });
}

export function loadImportedAliases(io: AddressBookIO): ImportedAlias[] {
  return cleanAliases(io.getJSON(ALIASES_KEY));
}

export function saveImportedAliases(
  io: AddressBookIO,
  aliases: readonly ImportedAlias[],
): void {
  io.setJSON(ALIASES_KEY, cleanAliases(aliases));
}

// --- eksport/import JSON (Fala UI-2 krok 3) -------------------------------------

export const ADDRESSBOOK_FORMAT = "arkmail-addressbook";
export const ADDRESSBOOK_VERSION = 1;

/** Zawartosc pliku eksportu ksiazki adresowej. */
export interface AddressBookExport {
  groups: ContactGroup[];
  importedPeople: ImportedPeople;
  importedAliases: ImportedAlias[];
}

/**
 * Waliduje i czysci plik importu. Grupy kolidujace z istniejacymi
 * nazwami dostaja suffix " (import)" (w petli, az wolna nazwa).
 * Zly format, brak wersji lub uszkodzony JSON odrzucane (null).
 */
export function parseAddressBookExport(
  json: string,
  existingGroupNames: readonly string[],
): AddressBookExport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.format !== ADDRESSBOOK_FORMAT) return null;
  if (typeof candidate.version !== "number") return null;

  const taken = new Set(existingGroupNames.map((n) => n.trim().toLowerCase()));
  const groups = cleanGroups(candidate.groups).map((g) => {
    let name = g.name;
    while (taken.has(name.toLowerCase())) name = `${name} (import)`;
    taken.add(name.toLowerCase());
    return { name, members: g.members };
  });
  return {
    groups,
    importedPeople: cleanPeople(candidate.importedPeople),
    importedAliases: cleanAliases(candidate.importedAliases),
  };
}

/** Serializuje ksiazke adresowa do pliku eksportu. */
export function buildAddressBookExport(book: AddressBookExport): string {
  return JSON.stringify(
    {
      format: ADDRESSBOOK_FORMAT,
      version: ADDRESSBOOK_VERSION,
      groups: book.groups,
      importedPeople: book.importedPeople,
      importedAliases: book.importedAliases,
    },
    null,
    2,
  );
}
