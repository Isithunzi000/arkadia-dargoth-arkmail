/**
 * Agregaty licznikowe archiwum (Fala 28) - JEDNA miara "total" dla
 * stopki indeksacji, paska archiwum i komunikatow. Czysty core,
 * zero DOM/I/O, deterministyczny.
 *
 * Zasady (zgodne z paskiem Fala 31d):
 *  - deduplikacja miedzy skrzynkami: ten sam list w kilku skrzynkach
 *    liczony RAZ - MAX wystapien w grupie; wystapienia w obrebie
 *    skrzynki sumuja sie (Fala 35);
 *  - Fala 28: rekordow nieobecnych na serwerze w bazie nie ma wcale
 *    (fizyczny purge przy gone-markingu), wiec zywosc nie jest tu
 *    sprawdzana - kazdy rekord jest zywy;
 *  - per-skrzynka liczy grupe w KAZDEJ skrzynce, w ktorej ma zywy
 *    rekord (suma czesci celowo moze byc wieksza niz total).
 */

import type { ArchiveLetter } from './archive.js';
import { contentKeyOf, occurrenceCount } from './archive.js';
import type { MailBox } from './protocol/types.js';

/** Grupy blizniacze rekordow (klucz: contentKeyOf). */
export function liveArchiveGroups(letters: readonly ArchiveLetter[]): ArchiveLetter[][] {
  const groups = new Map<string, ArchiveLetter[]>();
  for (const letter of letters) {
    const key = contentKeyOf(letter);
    const group = groups.get(key);
    if (group) group.push(letter);
    else groups.set(key, [letter]);
  }
  return [...groups.values()];
}

/**
 * Total: liczba listow w bazie (Fala 35: suma wystapien). Grupa
 * miedzy skrzynkami (ten sam list w "nieprzeczytane" i "odebrane")
 * liczy MAX - fizyczny list wystepuje w kazdej skrzynce tyle samo
 * razy, a MAX broni tez przed nierowno naliczona skrzynka.
 */
export function totalLive(letters: readonly ArchiveLetter[]): number {
  let total = 0;
  for (const group of liveArchiveGroups(letters)) {
    total += Math.max(...group.map((letter) => occurrenceCount(letter)));
  }
  return total;
}

/**
 * Per-skrzynka: kazda skrzynka z zywym rekordem grupy dostaje
 * + liczbe wystapien rekordu (Fala 35).
 */
export function perBoxCounts(letters: readonly ArchiveLetter[]): Map<MailBox, number> {
  const counts = new Map<MailBox, number>();
  for (const group of liveArchiveGroups(letters)) {
    const counted = new Set<MailBox>();
    for (const letter of group) {
      if (counted.has(letter.box)) continue;
      counted.add(letter.box);
      counts.set(letter.box, (counts.get(letter.box) ?? 0) + occurrenceCount(letter));
    }
  }
  return counts;
}
