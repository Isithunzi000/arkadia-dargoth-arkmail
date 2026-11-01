/**
 * Agregaty licznikowe archiwum (Fala 28) - JEDNA miara "total" dla
 * stopki indeksacji, paska archiwum i komunikatow. Czysty core,
 * zero DOM/I/O, deterministyczny.
 *
 * Zasady (zgodne z paskiem Fala 31d, przeliczone Fala 41):
 *  - kazdy listingowany wpis to osobny list: blizniaki w obrebie
 *    skrzynki licza sie kazdy z osobna;
 *  - deduplikacja MIEDZY skrzynkami: krotka replika (nieprzeczytany
 *    list w "nieprzeczytane" i "odebrane") liczona RAZ - MAX po
 *    skrzynkach w grupie klucza tresci;
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

/**
 * Total: liczba FIZYCZNYCH listow w bazie. Fala 41: kazdy listingowany
 * wpis to osobny list - blizniaki w TEJ SAMEJ skrzynce licza sie
 * kazdy z osobna. Wyjatkiem jest krotka replika miedzy skrzynkami
 * (ten sam nieprzeczytany list siedzi w "nieprzeczytane" i "odebrane"):
 * tam liczymy RAZ - MAX po skrzynkach w grupie klucza tresci.
 */
export function totalLive(letters: readonly ArchiveLetter[]): number {
  const byKey = new Map<string, Map<MailBox, number>>();
  for (const letter of letters) {
    const key = contentKeyOf(letter);
    let perBox = byKey.get(key);
    if (!perBox) {
      perBox = new Map();
      byKey.set(key, perBox);
    }
    perBox.set(letter.box, (perBox.get(letter.box) ?? 0) + 1);
  }
  let total = 0;
  for (const perBox of byKey.values()) {
    total += Math.max(...perBox.values());
  }
  return total;
}

/**
 * Per-skrzynka: kazdy rekord skrzynki to osobny list (Fala 41 -
 * blizniaki w skrzynce sumuja sie). Suma czesci moze byc wieksza niz
 * total (krotka replika miedzy skrzynkami liczy sie w kazdej z nich).
 */
export function perBoxCounts(letters: readonly ArchiveLetter[]): Map<MailBox, number> {
  const counts = new Map<MailBox, number>();
  for (const letter of letters) {
    counts.set(letter.box, (counts.get(letter.box) ?? 0) + 1);
  }
  return counts;
}
