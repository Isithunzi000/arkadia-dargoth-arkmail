/**
 * Plaska ksiazka adresowa: jedna lista imion pod kluczem "osoby",
 * grupy reczne pod "grupy-kontaktow" i aliasy pocztowe z gry (tylko
 * odczyt) pod "aliasy-importowane". Te klucze zostaja z dala od cache
 * listow: "Wyczysc zapisane dane" kasuje wylacznie indeks i luki
 * archiwum.
 *
 * Pochodzenie imion (import z gry, reczne wpisanie, czlonkowie grup,
 * adresaci aliasow) nie jest rozrozniane - ksiazka to jedna pula.
 * Dedup bez wielkosci liter; kanoniczna pisownia = pierwsza dodana.
 *
 * Migracja ze starego klucza "osoby-importowane" (pule zapamietani/
 * przedstawieni) sumuje obie listy do nowej ksiazki. Stary klucz
 * ZOSTAJE w magazynie - starsza wersja pluginu po rollbacku nadal
 * widzi swoje dane. Migracja odpala sie wylacznie, gdy nowy klucz
 * nie istnieje, wiec powtorny przebieg jest no-op.
 *
 * Eksport/import: format v2 (people + groups, bez aliasow - aliasy
 * zawsze pobiera sie z gry). Pliki v1 czytane wstecz: imiona = suma
 * pul, aliasy z pliku ignorowane. Kolizje nazw grup przy imporcie
 * NIE dostaja suffixu - tryb dolacz scala czlonkow przez
 * mergeAddressBook. Niezmiennik: po imporcie kazdy czlonek kazdej
 * grupy istnieje w ksiazce. Imiona w testach syntetyczne.
 */

/** Minimalny interfejs magazynu (CharStorage go spelnia). */
export interface AddressBookIO {
  getJSON<T>(key: string): T | null;
  setJSON(key: string, value: unknown): void;
}

export const GROUPS_KEY = "grupy-kontaktow";
export const PEOPLE_KEY = "osoby";
/** Stary klucz pul - wylacznie do odczytu przy migracji, nigdy kasowany. */
export const LEGACY_PEOPLE_KEY = "osoby-importowane";
export const ALIASES_KEY = "aliasy-importowane";

/** Grupa reczna: nazwa i czlonkowie (imiona gry, nie aliasy). */
export interface ContactGroup {
  name: string;
  members: string[];
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

/** Imiona ksiazki: trim, puste odrzucane, dedup bez wielkosci liter. */
function cleanBookNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
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

// --- ksiazka imion -------------------------------------------------------------

export function loadPeople(io: AddressBookIO): string[] {
  return cleanBookNames(io.getJSON(PEOPLE_KEY));
}

export function savePeople(io: AddressBookIO, people: readonly string[]): void {
  io.setJSON(PEOPLE_KEY, cleanBookNames(people));
}

/** Suma dwoch list imion, dedup bez wielkosci liter, pierwsza pisownia wygrywa. */
export function unionPeople(existing: readonly string[], incoming: readonly string[]): string[] {
  return cleanBookNames([...existing, ...incoming]);
}

/**
 * Jednorazowa migracja ze starego klucza pul do plaskiej ksiazki.
 * Odpala sie WYLACZNIE, gdy nowy klucz nie istnieje - istniejaca
 * ksiazka blokuje remigracje. Stary klucz pozostaje nietkniety
 * (bezpieczny rollback do starszej wersji pluginu).
 */
export function migratePeople(io: AddressBookIO): string[] {
  const current = io.getJSON<unknown>(PEOPLE_KEY);
  if (current !== null) return cleanBookNames(current);
  const legacy = io.getJSON<{ zapamietani?: unknown; przedstawieni?: unknown } | null>(
    LEGACY_PEOPLE_KEY,
  );
  const names = cleanBookNames([
    ...(legacy && typeof legacy === "object" ? cleanNames(legacy.zapamietani) : []),
    ...(legacy && typeof legacy === "object" ? cleanNames(legacy.przedstawieni) : []),
  ]);
  savePeople(io, names);
  return names;
}

/**
 * Niezmiennik kompletnosci: kazdy czlonek kazdej grupy istnieje
 * w ksiazce. Uzywane tez przez tryb "zastap" (ksiazka = imiona
 * z pliku + czlonkowie grup z pliku).
 */
export function withGroupMembers(
  people: readonly string[],
  groups: readonly ContactGroup[],
): string[] {
  return unionPeople(people, groups.flatMap((g) => g.members));
}

export interface AddressBookData {
  people: string[];
  groups: ContactGroup[];
}

export interface MergeStats {
  addedGroups: number;
  mergedGroups: number;
  addedPeople: number;
}

/**
 * Tryb "dolacz": grupy z incoming dolaczane do istniejacych - grupa
 * o tej samej nazwie (bez wzgledu na wielkosc liter) scala czlonkow,
 * kanoniczna nazwa i pisownia czlonkow z istniejacej. Imiona
 * dolaczane z deduplikacja. Na koniec ksiazka uzupelniana o czlonkow
 * grup (niezmiennik kompletnosci).
 */
export function mergeAddressBook(
  existing: AddressBookData,
  incoming: AddressBookData,
): { data: AddressBookData; stats: MergeStats } {
  const groups: ContactGroup[] = cleanGroups(existing.groups).map((g) => ({
    ...g,
    members: [...g.members],
  }));
  let addedGroups = 0;
  let mergedGroups = 0;
  for (const group of cleanGroups(incoming.groups)) {
    const found = groups.find((g) => g.name.toLowerCase() === group.name.toLowerCase());
    if (found) {
      mergedGroups += 1;
      for (const member of group.members) {
        if (!found.members.some((m) => m.toLowerCase() === member.toLowerCase())) {
          found.members.push(member);
        }
      }
    } else {
      addedGroups += 1;
      groups.push(group);
    }
  }
  const before = cleanBookNames(existing.people);
  const people = withGroupMembers(unionPeople(before, incoming.people), groups);
  return {
    data: { people, groups },
    stats: {
      addedGroups,
      mergedGroups,
      addedPeople: Math.max(0, people.length - before.length),
    },
  };
}

/** Tryb importu pliku: dolacz (merge) albo zastap (calosc z pliku). */
export type ImportMode = "dolacz" | "zastap";

/**
 * Zastosowanie importu pliku w wybranym trybie. "dolacz" to zwykly
 * mergeAddressBook. "zastap" zastepuje imiona i grupy zawartoscia pliku
 * (po oczyszczeniu), a niezmiennik kompletnosci i tak dopisuje czlonkow
 * grup do ksiazki. Aliasy sa lustrem z gry - zaden tryb ich nie rusza.
 */
export function applyBookImport(
  existing: AddressBookData,
  incoming: AddressBookData,
  mode: ImportMode = "dolacz",
): { data: AddressBookData; stats: MergeStats } {
  if (mode === "dolacz") return mergeAddressBook(existing, incoming);
  const groups = cleanGroups(incoming.groups);
  const before = cleanBookNames(existing.people);
  const people = withGroupMembers(cleanBookNames(incoming.people), groups);
  return {
    data: { people, groups },
    stats: {
      addedGroups: groups.length,
      mergedGroups: 0,
      addedPeople: Math.max(0, people.length - before.length),
    },
  };
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

// --- eksport/import JSON --------------------------------------------------------

export const ADDRESSBOOK_FORMAT = "arkmail-addressbook";
export const ADDRESSBOOK_VERSION = 2;

/** Zawartosc pliku eksportu ksiazki adresowej (v2). */
export interface AddressBookExport {
  people: string[];
  groups: ContactGroup[];
}

/**
 * Waliduje i czysci plik importu. Wersja 2: pola people + groups.
 * Wersja 1 (stare wydania): imiona = suma pul zapamietani/przedstawieni,
 * aliasy z pliku ignorowane (aliasy zawsze pobiera sie z gry).
 * Zly format, brak wersji lub uszkodzony JSON odrzucane (null).
 * Kolizji nazw grup NIE rozstrzyga - robi to mergeAddressBook.
 */
export function parseAddressBookExport(json: string): AddressBookExport | null {
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

  if (candidate.version === 1) {
    const pools =
      typeof candidate.importedPeople === "object" && candidate.importedPeople !== null
        ? (candidate.importedPeople as Record<string, unknown>)
        : {};
    return {
      people: cleanBookNames([
        ...cleanNames(pools.zapamietani),
        ...cleanNames(pools.przedstawieni),
      ]),
      groups: cleanGroups(candidate.groups),
    };
  }
  return {
    people: cleanBookNames(candidate.people),
    groups: cleanGroups(candidate.groups),
  };
}

/** Serializuje ksiazke adresowa do pliku eksportu (v2, bez aliasow). */
export function buildAddressBookExport(book: AddressBookExport): string {
  return JSON.stringify(
    {
      format: ADDRESSBOOK_FORMAT,
      version: ADDRESSBOOK_VERSION,
      people: cleanBookNames(book.people),
      groups: cleanGroups(book.groups),
    },
    null,
    2,
  );
}
