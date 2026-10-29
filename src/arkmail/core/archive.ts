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
  /** Stabilny identyfikator: FNV-1a(box|number|party|subject|dateRaw). */
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
   * List zniknal z serwera (Fala 17c, zgloszenie pkt 3): re-kotwica
   * nie znalazla go na swiezym listingu podczas pobierania tresci.
   * Petla pobierania takie rekordy POMIJA (bez znacznika kazdy restart
   * mielil zombie-wpisy do timeoutu). Upsert z listingu znacznik
   * czysci - list wrocil na serwer.
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
function fnv1a(input: string): string {
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

export function letterId(
  box: MailBox,
  party: string,
  subject: string,
  forwarded: boolean,
  dateRaw: string | null,
): string {
  // Numer NIE wchodzi w ID: serwer renumeruje wpisy na stronach "Wybrane
  // listy" (1..N selekcji), wiec ten sam list ma rozne numery zaleznie
  // od strony/listingu. Flaga forwarded rozroznia forward oryginalu
  // wyslany w tej samej sekundzie (log 2026-10-18).
  return fnv1a([box, party, subject, forwarded ? 'f' : '', dateRaw ?? ''].join('|'));
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

/** List z listingu -> rekord archiwum (tresc pusta, dokleja ja pager). */
export function fromMailboxEntry(box: MailBox, entry: MailboxEntry): ArchiveLetter {
  const dateRaw = entry.date?.raw ?? null;
  return {
    id: letterId(box, entry.party, entry.subject, entry.forwarded, dateRaw),
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
    return { ...fromMailboxEntry(box, entry), read: true, body: letter.body };
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
  };
  if (group.every((letter) => letter.missingOnServer === true)) merged.missingOnServer = true;
  else delete merged.missingOnServer;
  return merged;
}

/**
 * Naprawia zapisane rekordy bez kasowania danych. Data pochodzi kolejno
 * z dateRaw, konca osoby albo poprawnego sortKey. Duplikaty po nowym
 * identyfikatorze lacza sie deterministycznie.
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
      id: letterId(letter.box, party, letter.subject, letter.forwarded === true, dateRaw),
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
 * Wkleja incoming do existing po id. Aktualizacja nadpisuje pola,
 * ale niepusta tresc incoming wygrywa z pusta (nigdy odwrotnie).
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
      // Fala 17c: powrot listu do listingu czysci znacznik znikniecia
      // (incoming z listingu nigdy go nie niesie, wiec undefined
      // wygrywa; znacznik ustawia wylacznie petla pobierania tresci).
      missingOnServer: inc.missingOnServer === true ? true : undefined,
    });
    updated++;
  }
  return { letters: [...map.values()].sort(byNewest), added, updated };
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
 * pokazuje sie JEDEN raz - grupa po kluczu tresci; rekordy oznaczone
 * jako znikniete z serwera sa ukryte (grupa zyje, poki ma zywego
 * blizniaka). Filtr skrzynki i tresci dziala po CA LEJ grupie (reszta
 * filtrow po reprezentancie - party/temat/daty sa w grupie identyczne).
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
    if (l.missingOnServer === true) continue;
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
