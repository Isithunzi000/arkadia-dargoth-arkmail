/**
 * Budowanie komend protokolu pocztowego (warstwa odwrotna do parsera).
 * Formaty zweryfikowane na prawdziwych logach gry, m.in.:
 *   "listy wyslane przed 9 iii 2026"  (paginacja wstecz, miesiac rzymski,
 *   mala litera; serwer akceptuje tez wielkie i wariant z kropka).
 */

import type { MailBox, MailDate } from './types.js';

const ROMAN_MONTHS = [
  'i', 'ii', 'iii', 'iv', 'v', 'vi',
  'vii', 'viii', 'ix', 'x', 'xi', 'xii',
];

/** Komenda listing starszych listow: "listy <skrzynka> przed <d> <m> <y>". */
export function olderListingCommand(box: MailBox, date: MailDate): string {
  const roman = ROMAN_MONTHS[date.month - 1];
  if (!roman) throw new RangeError(`nieprawidlowy miesiac: ${date.month}`);
  return `listy ${box} przed ${date.day} ${roman} ${date.year}`;
}
