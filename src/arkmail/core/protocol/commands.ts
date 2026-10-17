/**
 * Budowanie komend protokolu pocztowego (warstwa odwrotna do parsera).
 * Formaty zweryfikowane na prawdziwych logach gry, m.in. log sesji
 * 2026-10-17: serwer odrzuca mala litere miesiaca rzymskiego komunikatem
 * "Data zostala podana w zlym formacie. Przykladowy format to: 13 X 2007."
 * -> miesiac rzymski w komendzie paginacji piszemy WIELKA litera.
 */

import type { MailBox, MailDate } from './types.js';

const ROMAN_MONTHS = [
  'I', 'II', 'III', 'IV', 'V', 'VI',
  'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
];

/** Komenda listing starszych listow: "listy <skrzynka> przed <d> <M> <y>". */
export function olderListingCommand(box: MailBox, date: MailDate): string {
  const roman = ROMAN_MONTHS[date.month - 1];
  if (!roman) throw new RangeError(`nieprawidlowy miesiac: ${date.month}`);
  return `listy ${box} przed ${date.day} ${roman} ${date.year}`;
}
