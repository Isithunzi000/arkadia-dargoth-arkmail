/**
 * Archiwum listow (czysta logika, zero I/O).
 *
 * Serwer pokazuje max 50 najnowszych listow na skrzynke; ArkMail paginuje
 * wstecz ("listy <skrzynka> przed <data>", patrz protocol/commands.ts)
 * i sklada wyniki w lokalne archiwum. Deduplikacja po stabilnym id
 * (FNV-1a z pol protokolowych), upsert aktualizuje flage przeczytania
 * i tresc. Sortowanie: najnowsze pierwsze, deterministycznie.
 */

import type { MailBox } from './protocol/types.js';
import type { MailDate } from './protocol/types.js';
import { parseMailDate } from './protocol/parser.js';
import { fromISODate } from './protocol/commands.js';
import type { MailboxEntry } from './session/mailbox.js';
import type { LetterContent } from './session/pager.js';

export interface ArchiveLetter {
  /**
   * Stabilny identyfikator rekordu. Fala 41: FNV-1a(box|scanKey|pozycja) -
   * tozsamosc pochodzi z PRZEBIEGU SKANU (skrot tresci calej strony
   * listingu) i pozycji wpisu w nim, NIE z metadanych. Dwa wpisy o
   * identycznych osobie/tematcie/dacie to zawsze DWA rekordy (kazdy
   * listingowany list = osobny list). Zapis 'stary-identyfikator'
   * ponizej = legacy (rekordy sprzed Fali 41, klucz z metadanych).
   */
  id: string;
  box: MailBox;
  number: number;
  /** Druga strona listu: nadawca (odebrane) lub odbiorcy (wyslane). */
  party: string;
  subject: string;
  /**
   * Flaga "(forwardowany)" z listingu (Fala 14a: kontakty z archiwum
   * rozrozniaja nia forward oryginalu wyslany w tej samej sekundzie,
   * jak letterId). Rekordy zapisane przed Fala 14a nie maja tego pola
   * - przy odczycie traktowane jak false (konsumuj przez === true).
   */
  forwarded?: boolean;
  dateRaw: string | null;
  /** Klucz sortowania "YYYY-MM-DD HH:MM:SS" ('0000-...' gdy brak daty). */
  sortKey: string;
  read: boolean;
  body: string[];
  /**
   * Fala 35: liczba wystapien listu na serwerze (blizniaki o
   * identycznych metadanych wylistowane pod roznymi numerami).
   * Brak pola = 1 (zapisy ze starych wersji). Ustawiana wylacznie
   * z pelnego listingu indeksacji - wynik listingu, nie suma zapisow.
   */
  occurrences?: number;
  /**
   * Fala 35: tresci wystapien 2..n przeczytane kazde osobno (petla
   * pobierania czyta kazde wystapienie; body = wystapienie 1). Bez
   * deduplikacji bajtow - dwa identyczne wystapienia to dwie kopie.
   */
  extraBodies?: string[][];
  /**
   * LEGACY (Fala 28): wczesniej flaga "nieobecny na serwerze".
   * Od Fali 28 rekordy nieobecne sa FIZYCZNIE usuwane (purge), wiec
   * flagi nikt nie stawia ani nie czyta w runtime. Pole zostaje w
   * typie wylacznie dla danych zapisanych przez stare wersje - przy
   * ladowaniu plugin je odfiltrowuje (jednorazowy przeglad storage).
   */
  missingOnServer?: boolean;
}

export interface ArchiveFilter {
  /** Nadawca (skrzynki odebrane/nieprzeczytane), podciag bez wielkosci. */
  od?: string;
  /** Odbiorca (skrzynki wyslane/niewyslane), podciag bez wielkosci. */
  do?: string;
  /** Strona listu w DOWOLNYM kierunku (nadawca albo odbiorca). */
  osoba?: string;
  /** Ograniczenie do jednej skrzynki. */
  skrzynka?: MailBox;
  temat?: string;
  tresc?: string;
  /** "YYYY-MM-DD", wlacznie. */
  odDaty?: string;
  doDaty?: string;
}

const SENDER_BOXES: ReadonlySet<MailBox> = new Set(['odebrane', 'nieprzeczytane']);
const RECIPIENT_BOXES: ReadonlySet<MailBox> = new Set(['wyslane', 'niewyslane']);

/** Kolejnosc kanoniczna skrzynki dla blizniaka (Fala 17c/18a). */
export const BOX_RANK: Record<MailBox, number> = {
  odebrane: 0,
  nieprzeczytane: 1,
  wyslane: 2,
  niewyslane: 3,
};

/** FNV-1a 32-bit, hex - deterministyczny skrot bez zaleznosci. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function sortKeyOf(date: MailDate | null): string {
  if (!date) return '0000-00-00 00:00:00';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.year}-${p(date.month)}-${p(date.day)} ${date.time}`;
}

/**
 * LEGACY (przed Fala 41): klucz z metadanych. Zostaje wylacznie jako
 * fallback dla rekordow bez tozsamosci skanowej (otwarcie listu z
 * wynikow szukania, wpisy widoku bez archiveId). Runtime NIE uzywa go
 * do tozsamosci archiwum - patrz recordId/scanKeyOfEntries.
 */
export function letterId(
  box: MailBox,
  party: string,
  subject: string,
  forwarded: boolean,
  dateRaw: string | null,
): string {
  return fnv1a([box, party, subject, forwarded ? 'f' : '', dateRaw ?? ''].join('|'));
}

/**
 * Fala 41: klucz PRZEBIEGU SKANU - skrot serializacji wszystkich wpisow
 * jednej strony listingu (w kolejnosci serwera). Deterministyczny i
 * idempotentny: ten sam listing zawsze daje ten sam klucz, wiec powtorka
 * pobrania tej samej strony nie tworzy duplikatow. Zmiana TRESCI strony
 * (nowy list na gorze) = inny klucz = nowe tozsamosci pozycji.
 */
export function scanKeyOfEntries(entries: readonly MailboxEntry[]): string {
  return fnv1a(
    entries
      .map((e) =>
        [
          e.number,
          e.isRead ? 'R' : 'N',
          e.forwarded ? 'F' : '',
          e.party,
          e.subject,
          e.date?.raw ?? '',
        ].join('|'),
      )
      .join('\n'),
  );
}

/**
 * Fala 41: identyfikator rekordu = FNV-1a(box|scanKey|pozycja). Numer
 * listu NIE wchodzi w sklad: serwer renumeruje wpisy na stronach
 * "Wybrane listy" (1..N selekcji). Pozycja w przebiegu skanu rozroznia
 * blizniakow o identycznych metadanych - kazdy z nich dostaje wlasny,
 * niezalezny rekord.
 */
export function recordId(box: MailBox, scanKey: string, position: number): string {
  return fnv1a([box, scanKey, String(position)].join('|'));
}

/** Wystapienia rekordu (Fala 35): brak pola = 1 (zapis legacy). */
export function occurrenceCount(letter: ArchiveLetter): number {
  return letter.occurrences ?? 1;
}

/** Wszystkie przeczytane tresci wystapien: body + extraBodies, bez dedupu. */
export function bodiesOf(letter: ArchiveLetter): string[][] {
  return [letter.body, ...(letter.extraBodies ?? [])];
}

/**
 * Fala 35c: wypelnia sloty tresci per wystapienie (body = wystapienie 1,
 * extraBodies = 2..n). Brakujace sloty zostaja puste (pobieranie dociaga
 * je pozniej); occurrences rosnie, gdy dostarczono wiecej tresci niz
 * dotychczasowy rozmiar. Czysta funkcja - zwraca nowy rekord.
 */
export function withOccurrenceBodies(
  letter: ArchiveLetter,
  bodies: string[][],
): ArchiveLetter {
  const n = Math.max(occurrenceCount(letter), bodies.length);
  const prev = bodiesOf(letter);
  const merged: string[][] = [];
  for (let i = 0; i < n; i++) merged.push(bodies[i] ?? prev[i] ?? []);
  return {
    ...letter,
    occurrences: n,
    body: merged[0] ?? [],
    extraBodies: merged.slice(1),
  };
}

/**
 * Fala 35: nadpisuje liczbe wystapien rekordow skrzynki o danym
 * kluczu tresci wynikiem listingu (NIE sumuje). Klucz jest
 * jednodniowy (dataRaw wchodzi w sklad), wiec jedna strona paginacji
 * pokazuje wszystkie jego wystapienia. Zwraca nowa tablice i liczbe
 * zmienionych rekordow.
 */
export function setOccurrences(
  existing: readonly ArchiveLetter[],
  box: MailBox,
  contentKey: string,
  count: number,
): { letters: ArchiveLetter[]; changed: number } {
  let changed = 0;
  const letters = existing.map((l) => {
    if (l.box !== box || contentKeyOf(l) !== contentKey) return l;
    if ((l.occurrences ?? 1) === count) return l;
    changed += 1;
    return { ...l, occurrences: count };
  });
  return { letters, changed };
}

/**
 * Klucz TRESCI rekordu (Fala 17c): jak letterId, ale BEZ skrzynki.
 * Ten sam list istnieje w archiwum podwojnie, gdy jest nieprzeczytany
 * (rekordy "nieprzeczytane" i "odebrane" maja rozne id) - petla
 * pobierania tresci grupuje po tym kluczu i pobiera blizniaka RAZ.
 */
export function contentKeyOf(letter: ArchiveLetter): string {
  return fnv1a(
    [letter.party, letter.subject, letter.forwarded === true ? 'f' : '', letter.dateRaw ?? ''].join(
      '|',
    ),
  );
}

/**
 * List z listingu -> rekord archiwum (tresc pusta, dokleja ja pager).
 * Fala 41: tozsamosc rekordu = (box, scanKey strony, pozycja wpisu).
 * Parametry scanKey/position sa wymagane na kazdej sciezce runtime;
 * fallback metadanych istnieje tylko dla zapisow/testow legacy (commit
 * sprzatajacy Fali 41 go usuwa).
 */
export function fromMailboxEntry(
  box: MailBox,
  entry: MailboxEntry,
  scanKey?: string,
  position?: number,
): ArchiveLetter {
  const dateRaw = entry.date?.raw ?? null;
  return {
    id:
      scanKey !== undefined && position !== undefined
        ? recordId(box, scanKey, position)
        : letterId(box, entry.party, entry.subject, entry.forwarded, dateRaw),
    box,
    number: entry.number,
    party: entry.party,
    subject: entry.subject,
    forwarded: entry.forwarded,
    dateRaw,
    sortKey: sortKeyOf(entry.date),
    read: entry.isRead,
    body: [],
  };
}

/**
 * Otwarty list (pager) -> rekord archiwum z TRESCIA. Ze znanym wpisem
 * listingu bierzemy jego dane do id (zgodnosc flagi forwarded -> dedup
 * z rekordem z listingu); bez wpisu (np. list otwarty z wynikow
 * szukania) fallback: strona listu po kierunku skrzynki (Od/Do),
 * forwarded=false. Otwarcie = przeczytany.
 */
export function fromOpenedLetter(
  box: MailBox,
  letter: LetterContent,
  entry?: MailboxEntry,
): ArchiveLetter {
  if (entry) {
    // Fala 41: swiezy wpis niesie archiveId rekordu z listingu - tresc
    // trafia do DOKLADNIE tego rekordu (blizniak o tych samych
    // metadanych ma wlasne ID i zostaje nietkniety).
    const base = entry.archiveId
      ? {
          ...fromMailboxEntry(box, entry),
          id: entry.archiveId,
        }
      : fromMailboxEntry(box, entry);
    return { ...base, read: true, body: letter.body };
  }
  const party = SENDER_BOXES.has(box) ? letter.from : letter.to;
  const dateRaw = letter.date;
  const parsed = dateRaw ? parseMailDate(dateRaw) : null;
  return {
    id: letterId(box, party, letter.subject, false, dateRaw),
    box,
    number: letter.number,
    party,
    subject: letter.subject,
    forwarded: false,
    dateRaw,
    sortKey: sortKeyOf(parsed),
    read: true,
    body: letter.body,
  };
}

const ARCHIVE_DATE_SUFFIX_RE = /\s+([A-Za-z]+, \d{1,2} (?:XII|XI|IX|VIII|VII|VI|IV|V|III|II|I|X) \d{4}, \d{2}:\d{2}:\d{2})$/;
const ARCHIVE_SORT_KEY_RE = /^(\d{4})-(\d{2})-(\d{2}) ((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/;
const ARCHIVE_WEEKDAYS = ['N', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So'];
const ARCHIVE_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function dateFromSortKey(sortKey: string): MailDate | null {
  const match = sortKey.match(ARCHIVE_SORT_KEY_RE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(0, 0, 0, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }
  const raw = `${ARCHIVE_WEEKDAYS[calendar.getUTCDay()]}, ${day} ${ARCHIVE_MONTHS[month - 1]} ${year}, ${match[4]}`;
  return parseMailDate(raw);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function mergeArchiveDuplicates(group: ArchiveLetter[]): ArchiveLetter {
  if (group.length === 1) return group[0];
  const ordered = [...group].sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));
  const bodies = new Map<string, string[]>();
  for (const letter of ordered) {
    const key = JSON.stringify(letter.body);
    if (!bodies.has(key)) bodies.set(key, letter.body);
  }
  const orderedBodies = [...bodies.values()].sort(
    (a, b) => b.length - a.length || compareText(JSON.stringify(a), JSON.stringify(b)),
  );
  const body = [...(orderedBodies[0] ?? [])];
  for (const candidate of orderedBodies.slice(1)) {
    for (const line of candidate) {
      if (!body.includes(line)) body.push(line);
    }
  }
  const merged: ArchiveLetter = {
    ...ordered[0],
    number: Math.max(...group.map((letter) => letter.number)),
    read: group.some((letter) => letter.read),
    body,
    // Fala 35: te same id = te same metadane = te same wystapienia;
    // MAX chroni przed podwojnym liczeniem przy scalaniu duplikatow.
    occurrences: Math.max(...group.map((letter) => occurrenceCount(letter))),
  };
  return merged;
}

/**
 * Naprawia zapisane rekordy bez kasowania danych. Data pochodzi kolejno
 * z dateRaw, konca osoby albo poprawnego sortKey. Fala 41: identyfikator
 * NIE jest przebudowywany (tozsamosc = przebieg skanu, ktorego storage
 * nie zna) i rekordy o ROZNYCH id NIGDY nie sa scalane - scalenie
 * dotyczy wylacznie dokladnie tego samego id (ten sam wpis zapisany
 * dwukrotnie), deterministycznie.
 */
export function normalizeArchive(letters: readonly ArchiveLetter[]): ArchiveLetter[] {
  const groups = new Map<string, ArchiveLetter[]>();
  for (const letter of letters) {
    const suffix = letter.party.match(ARCHIVE_DATE_SUFFIX_RE);
    const suffixDate = suffix ? parseMailDate(suffix[1]) : null;
    const directDate = letter.dateRaw ? parseMailDate(letter.dateRaw) : null;
    const date = directDate ?? suffixDate ?? dateFromSortKey(letter.sortKey);
    const party = suffixDate ? letter.party.slice(0, suffix!.index).trimEnd() : letter.party;
    const dateRaw = date?.raw ?? letter.dateRaw;
    const normalized: ArchiveLetter = {
      ...letter,
      party,
      dateRaw,
      sortKey: date ? sortKeyOf(date) : letter.sortKey,
      body: [...letter.body],
    };
    const group = groups.get(normalized.id);
    if (group) group.push(normalized);
    else groups.set(normalized.id, [normalized]);
  }
  return [...groups.values()].map(mergeArchiveDuplicates).sort(byNewest);
}

function byNewest(a: ArchiveLetter, b: ArchiveLetter): number {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1;
  if (a.number !== b.number) return b.number - a.number;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface UpsertResult {
  letters: ArchiveLetter[];
  added: number;
  updated: number;
}

/**
 * Fala 41: WKLEJANIE bez nadpisywania. Kazdy listingowany list to
 * osobny rekord - istniejacego rekordu o tym samym id NIE ruszamy
 * (stary upsert zjadal tresc blizniaka o identycznych metadanych).
 * Idempotenty: powtorka tego samego skanu daje added === 0.
 */
export function insertLetters(
  existing: readonly ArchiveLetter[],
  incoming: readonly ArchiveLetter[],
): { letters: ArchiveLetter[]; added: number } {
  const map = new Map<string, ArchiveLetter>(existing.map((l) => [l.id, l]));
  let added = 0;
  for (const inc of incoming) {
    if (map.has(inc.id)) continue;
    map.set(inc.id, inc);
    added++;
  }
  return { letters: [...map.values()].sort(byNewest), added };
}

/**
 * Fala 41: wynik JEDNEJ strony listingu wklejony do bazy. Dwa poziomy:
 *
 *  1. TOZSAMOSC: kazdy wpis listingu, ktorego tresci NIE ma jeszcze w
 *     archiwum tej skrzynki, dostaje wlasny rekord (id z przebiegu
 *     skanu). Blizniak = drugi taki wpis na tej samej stronie DOSTAJE
 *     wlasny rekord (matchowanie bierze pod uwage WYLACZNIE stan bazy
 *     sprzed strony, wiec dwa swieze blizniaki nigdy sie nie skleja).
 *  2. IDEMPOTENCJA TRESCI: wpis, ktorego tresc JUZ ISTNIEJE w archiwum
 *     tej skrzynki, NIE tworzy nowego rekordu - dopasowuje sie do
 *     istniejacego (ktory zachowuje swoje id, tresc i flage). Powtorka
 *     odswiezenia glowy (przesuniecie pozycji, nowy scanKey) nie mnozy
 *     rekordow tego samego fizycznego listu, a klamra incrementalnego
 *     przeczesu (strona w calosci znana) zatrzymuje skan bez smiecia.
 *
 * To NIE jest mergowanie metadanych: rekordow nikt nie scala ani nie
 * nadpisuje - decyzja dotyczy wylacznie dopisania NOWEGO rekordu.
 */
export interface ListingMergeResult {
  letters: ArchiveLetter[];
  /** liczba dopisanych rekordow (nowe tresci). */
  added: number;
  /** resolvedIds[i] = id rekordu archiwum dla incoming[i]. */
  resolvedIds: string[];
  /** zywe id strony (dopasowane + dopisane) - do zakresowego purge. */
  freshIds: Set<string>;
}

export function mergeListingPage(
  existing: readonly ArchiveLetter[],
  box: MailBox,
  incoming: readonly ArchiveLetter[],
): ListingMergeResult {
  // Pula dopasowania: wielozbior rekordow skrzynki po kluczu tresci
  // (stan PRZED ta strona - swiezi blizniak z tej strony nie moze
  // sparowac sie z rekordem dopisanym z tej samej strony).
  const pool = new Map<string, ArchiveLetter[]>();
  for (const l of existing) {
    if (l.box !== box) continue;
    const key = contentKeyOf(l);
    const arr = pool.get(key);
    if (arr) arr.push(l);
    else pool.set(key, [l]);
  }
  const resolvedIds: string[] = [];
  const freshIds = new Set<string>();
  const toInsert: ArchiveLetter[] = [];
  for (const rec of incoming) {
    const candidates = pool.get(contentKeyOf(rec));
    if (candidates && candidates.length > 0) {
      const matched = candidates.shift()!;
      resolvedIds.push(matched.id);
      freshIds.add(matched.id);
    } else {
      resolvedIds.push(rec.id);
      freshIds.add(rec.id);
      toInsert.push(rec);
    }
  }
  const inserted = insertLetters(existing, toInsert);
  return { letters: inserted.letters, added: inserted.added, resolvedIds, freshIds };
}

/**
 * Fala 41: PELNY SKAN zastepuje stan skrzynki. Najpierw wklejenie
 * strony z dopasowaniem tresci (stabilna tozsamosc rekordow miedzy
 * przecesami), potem FIZYCZNE usuniecie rekordow skrzynki nieobecnych
 * w swiezym zrzucie. Zwraca nowa baze + zbior usunietych id (widok
 * skrzynki czysci sie na ich podstawie). Baza po wyjsciu pokrywa
 * dokladnie pelny listing: kazdy wpis = rekord, zadnych duplikatow.
 */
export function replaceBoxLetters(
  existing: readonly ArchiveLetter[],
  box: MailBox,
  incoming: readonly ArchiveLetter[],
): { letters: ArchiveLetter[]; removedIds: Set<string>; resolvedIds: string[] } {
  const merged = mergeListingPage(existing, box, incoming);
  const removedIds = new Set<string>();
  const letters = merged.letters.filter((letter) => {
    if (letter.box !== box || merged.freshIds.has(letter.id)) return true;
    removedIds.add(letter.id);
    return false;
  });
  if (removedIds.size === 0 && merged.added === 0) {
    return { letters: [...existing], removedIds, resolvedIds: merged.resolvedIds };
  }
  return { letters, removedIds, resolvedIds: merged.resolvedIds };
}

/**
 * Wkleja incoming do existing po id. Aktualizacja nadpisuje pola,
 * ale niepusta tresc incoming wygrywa z pusta (nigdy odwrotnie).
 * Fala 41: runtime uzywa go WYLACZNIE do doplewania tresci/przeczytania
 * w rekordzie o znanym id (pager) - nigdy do wklejania wynikow listingu.
 */
export function upsertLetters(
  existing: readonly ArchiveLetter[],
  incoming: readonly ArchiveLetter[],
): UpsertResult {
  const map = new Map<string, ArchiveLetter>(existing.map((l) => [l.id, l]));
  let added = 0;
  let updated = 0;
  for (const inc of incoming) {
    const prev = map.get(inc.id);
    if (!prev) {
      map.set(inc.id, inc);
      added++;
      continue;
    }
    map.set(inc.id, {
      ...prev,
      ...inc,
      body: inc.body.length > 0 ? inc.body : prev.body,
    });
    updated++;
  }
  return { letters: [...map.values()].sort(byNewest), added, updated };
}

/**
 * Fizyczne usuniecie rekordow skrzynki nieobecnych na KOMPLETNYM
 * listingu (Fala 28 - zamiast flagi missingOnServer). Serwer nie
 * serwuje skasowanych listow, a blednie usuniety rekord odtworzy
 * kolejny listing (upsert) - nic wiecznie nie ginie. Zwraca baze
 * bez rekordow + zbior usunietych id (widok skrzynki czysci sie
 * na ich podstawie).
 */
export function purgeGoneLetters(
  existing: readonly ArchiveLetter[],
  box: MailBox,
  freshIds: ReadonlySet<string>,
): { letters: ArchiveLetter[]; removedIds: Set<string> } {
  const removedIds = new Set<string>();
  const letters = existing.filter((letter) => {
    if (letter.box !== box || freshIds.has(letter.id)) return true;
    removedIds.add(letter.id);
    return false;
  });
  if (removedIds.size === 0) return { letters: [...existing], removedIds };
  return { letters, removedIds };
}

/**
 * Wariant zakresowy (Fala 24e/28): usuwa tylko rekordy scisle nowsze
 * niz granica dnia (najstarszy dzien widzianej strony). Dzien
 * graniczny nietkniety - klamra paginacji mogla uciac go w polowie.
 */
export function purgeGoneLettersNewerThan(
  existing: readonly ArchiveLetter[],
  box: MailBox,
  freshIds: ReadonlySet<string>,
  boundaryDay: string,
): { letters: ArchiveLetter[]; removedIds: Set<string> } {
  const removedIds = new Set<string>();
  const letters = existing.filter((letter) => {
    if (letter.box !== box || freshIds.has(letter.id)) return true;
    if (letter.sortKey.slice(0, 10) <= boundaryDay) return true;
    removedIds.add(letter.id);
    return false;
  });
  if (removedIds.size === 0) return { letters: [...existing], removedIds };
  return { letters, removedIds };
}

/**
 * Reprezentant grupy blizniakow (Fala 18a): rekord z trescia wygrywa
 * (wiersz i otwarcie z cache), potem skrzynka kanoniczna (odebrane
 * przed nieprzeczytanymi - zombie po przeczytaniu nie rzadzi widokiem),
 * potem id (determinizm).
 */
function representativeOf(group: ArchiveLetter[]): ArchiveLetter {
  return [...group].sort(
    (a, b) =>
      Number(b.body.length > 0) - Number(a.body.length > 0) ||
      BOX_RANK[a.box] - BOX_RANK[b.box] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
}

/**
 * Widok archiwum (Fala 18a, zgloszenie 2026-10-20 pkt 1/3): ten sam
 * list widoczny w kilku skrzynkach (nieprzeczytany jest i tu, i tu)
 * pokazuje sie JEDEN raz - grupa po kluczu tresci. Fala 28: rekordow
 * nieobecnych na serwerze w bazie nie ma wcale (fizyczny purge), wiec
 * zywosc nie jest sprawdzana. Filtr skrzynki i tresci dziala po
 * CA LEJ grupie (reszta filtrow po reprezentancie - party/temat/daty
 * sa w grupie identyczne).
 */
const validArchiveDate = (value: string | undefined): string | undefined =>
  value !== undefined && fromISODate(value) !== null ? value : undefined;

export function filterVisibleArchive(
  letters: readonly ArchiveLetter[],
  filter: ArchiveFilter,
): ArchiveLetter[] {
  const odDaty = validArchiveDate(filter.odDaty);
  const doDaty = validArchiveDate(filter.doDaty);
  const groups = new Map<string, ArchiveLetter[]>();
  for (const l of letters) {
    const key = contentKeyOf(l);
    const arr = groups.get(key);
    if (arr) arr.push(l);
    else groups.set(key, [l]);
  }
  const out: ArchiveLetter[] = [];
  for (const group of groups.values()) {
    if (filter.skrzynka !== undefined && !group.some((l) => l.box === filter.skrzynka)) continue;
    if (
      filter.tresc !== undefined &&
      !group.some((l) => norm(l.body.join('\n')).includes(norm(filter.tresc!)))
    )
      continue;
    const rep = representativeOf(group);
    if (filter.od !== undefined) {
      if (!SENDER_BOXES.has(rep.box)) continue;
      if (!norm(rep.party).includes(norm(filter.od))) continue;
    }
    if (filter.do !== undefined) {
      if (!RECIPIENT_BOXES.has(rep.box)) continue;
      if (!norm(rep.party).includes(norm(filter.do))) continue;
    }
    if (filter.osoba !== undefined && !norm(rep.party).includes(norm(filter.osoba))) continue;
    if (filter.temat !== undefined && !norm(rep.subject).includes(norm(filter.temat))) continue;
    if (odDaty !== undefined && rep.sortKey.slice(0, 10) < odDaty) continue;
    if (doDaty !== undefined && rep.sortKey.slice(0, 10) > doDaty) continue;
    out.push(rep);
  }
  return out.sort(byNewest);
}

const norm = (s: string) => s.toLowerCase();

/** Filtr lokalny archiwum (zakresy dat wlacznie, po sortKey). */
export function filterLetters(
  letters: readonly ArchiveLetter[],
  filter: ArchiveFilter,
): ArchiveLetter[] {
  const odDaty = validArchiveDate(filter.odDaty);
  const doDaty = validArchiveDate(filter.doDaty);
  return letters.filter((l) => {
    if (filter.od !== undefined) {
      if (!SENDER_BOXES.has(l.box)) return false;
      if (!norm(l.party).includes(norm(filter.od))) return false;
    }
    if (filter.do !== undefined) {
      if (!RECIPIENT_BOXES.has(l.box)) return false;
      if (!norm(l.party).includes(norm(filter.do))) return false;
    }
    if (filter.osoba !== undefined && !norm(l.party).includes(norm(filter.osoba))) return false;
    if (filter.skrzynka !== undefined && l.box !== filter.skrzynka) return false;
    if (filter.temat !== undefined && !norm(l.subject).includes(norm(filter.temat))) return false;
    if (filter.tresc !== undefined && !norm(l.body.join('\n')).includes(norm(filter.tresc))) return false;
    if (odDaty !== undefined && l.sortKey.slice(0, 10) < odDaty) return false;
    if (doDaty !== undefined && l.sortKey.slice(0, 10) > doDaty) return false;
    return true;
  });
}
