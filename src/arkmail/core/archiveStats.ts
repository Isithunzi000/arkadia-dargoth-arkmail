/**
 * Agregaty licznikowe archiwum (Fala 28) - JEDNA miara "total" dla
 * stopki indeksacji, paska archiwum i komunikatow. Czysty core,
 * zero DOM/I/O, deterministyczny.
 *
 * Zasady (zgodne z paskiem Fala 31d):
 *  - deduplikacja blizniakow: ten sam list widoczny w kilku skrzynkach
 *    (nieprzeczytany jest i tu, i tu) liczony RAZ - klucz contentKeyOf;
 *  - Fala 28: rekordow nieobecnych na serwerze w bazie nie ma wcale
 *    (fizyczny purge przy gone-markingu), wiec zywosc nie jest tu
 *    sprawdzana - kazdy rekord jest zywy;
 *  - per-skrzynka liczy grupe w KAZDEJ skrzynce, w ktorej ma zywy
 *    rekord (suma czesci celowo moze byc wieksza niz total).
 */

import type { ArchiveLetter } from './archive.js';
import { contentKeyOf } from './archive.js';
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

/** Total: liczba roznych listow w bazie (blizniaki liczone raz). */
export function totalLive(letters: readonly ArchiveLetter[]): number {
  return liveArchiveGroups(letters).length;
}

/** Per-skrzynka: kazda skrzynka z zywym rekordem grupy dostaje +1. */
export function perBoxCounts(letters: readonly ArchiveLetter[]): Map<MailBox, number> {
  const counts = new Map<MailBox, number>();
  for (const group of liveArchiveGroups(letters)) {
    const counted = new Set<MailBox>();
    for (const letter of group) {
      if (counted.has(letter.box)) continue;
      counted.add(letter.box);
      counts.set(letter.box, (counts.get(letter.box) ?? 0) + 1);
    }
  }
  return counts;
}
