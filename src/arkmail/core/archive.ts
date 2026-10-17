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
import type { MailboxEntry } from './session/mailbox.js';

export interface ArchiveLetter {
  /** Stabilny identyfikator: FNV-1a(box|number|party|subject|dateRaw). */
  id: string;
  box: MailBox;
  number: number;
  /** Druga strona listu: nadawca (odebrane) lub odbiorcy (wyslane). */
  party: string;
  subject: string;
  dateRaw: string | null;
  /** Klucz sortowania "YYYY-MM-DD HH:MM:SS" ('0000-...' gdy brak daty). */
  sortKey: string;
  read: boolean;
  body: string[];
}

export interface ArchiveFilter {
  /** Nadawca (skrzynki odebrane/nieprzeczytane), podciag bez wielkosci. */
  od?: string;
  /** Odbiorca (skrzynki wyslane/niewyslane), podciag bez wielkosci. */
  do?: string;
  temat?: string;
  tresc?: string;
  /** "YYYY-MM-DD", wlacznie. */
  odDaty?: string;
  doDaty?: string;
}

const SENDER_BOXES: ReadonlySet<MailBox> = new Set(['odebrane', 'nieprzeczytane']);
const RECIPIENT_BOXES: ReadonlySet<MailBox> = new Set(['wyslane', 'niewyslane']);

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
  number: number,
  party: string,
  subject: string,
  dateRaw: string | null,
): string {
  return fnv1a([box, number, party, subject, dateRaw ?? ''].join('|'));
}

/** List z listingu -> rekord archiwum (tresc pusta, dokleja ja pager). */
export function fromMailboxEntry(box: MailBox, entry: MailboxEntry): ArchiveLetter {
  const dateRaw = entry.date?.raw ?? null;
  return {
    id: letterId(box, entry.number, entry.party, entry.subject, dateRaw),
    box,
    number: entry.number,
    party: entry.party,
    subject: entry.subject,
    dateRaw,
    sortKey: sortKeyOf(entry.date),
    read: entry.isRead,
    body: [],
  };
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
    });
    updated++;
  }
  return { letters: [...map.values()].sort(byNewest), added, updated };
}

const norm = (s: string) => s.toLowerCase();

/** Filtr lokalny archiwum (zakresy dat wlacznie, po sortKey). */
export function filterLetters(
  letters: readonly ArchiveLetter[],
  filter: ArchiveFilter,
): ArchiveLetter[] {
  return letters.filter((l) => {
    if (filter.od !== undefined) {
      if (!SENDER_BOXES.has(l.box)) return false;
      if (!norm(l.party).includes(norm(filter.od))) return false;
    }
    if (filter.do !== undefined) {
      if (!RECIPIENT_BOXES.has(l.box)) return false;
      if (!norm(l.party).includes(norm(filter.do))) return false;
    }
    if (filter.temat !== undefined && !norm(l.subject).includes(norm(filter.temat))) return false;
    if (filter.tresc !== undefined && !norm(l.body.join('\n')).includes(norm(filter.tresc))) return false;
    if (filter.odDaty !== undefined && l.sortKey.slice(0, 10) < filter.odDaty) return false;
    if (filter.doDaty !== undefined && l.sortKey.slice(0, 10) > filter.doDaty) return false;
    return true;
  });
}
