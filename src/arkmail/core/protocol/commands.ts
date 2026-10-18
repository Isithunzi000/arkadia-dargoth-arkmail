/**
 * Budowanie komend protokolu pocztowego (warstwa odwrotna do parsera).
 * Formaty zweryfikowane na prawdziwych logach gry, m.in. log sesji
 * 2026-10-17: serwer odrzuca mala litere miesiaca rzymskiego komunikatem
 * "Data zostala podana w zlym formacie. Przykladowy format to: 13 X 2007."
 * -> miesiac rzymski w komendzie paginacji piszemy WIELKA litera.
 */

import type { MailBox, MailDate } from './types.js';

/** Data kalendarzowa (dzien/miesiac/rok) - wystarczy do komend z data. */
export type DateYMD = Pick<MailDate, 'day' | 'month' | 'year'>;

const ROMAN_MONTHS = [
  'I', 'II', 'III', 'IV', 'V', 'VI',
  'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
];

/** Komenda listing starszych listow: "listy <skrzynka> przed <d> <M> <y>". */
export function olderListingCommand(box: MailBox, date: DateYMD): string {
  const roman = ROMAN_MONTHS[date.month - 1];
  if (!roman) throw new RangeError(`nieprawidlowy miesiac: ${date.month}`);
  return `listy ${box} przed ${date.day} ${roman} ${date.year}`;
}

/**
 * Nastepny dzien (kalendarz gregorianski). Kotwica paginacji: serwer
 * traktuje "przed <data>" z granulacja dnia i wyklucza caly dzien
 * graniczny, wiec prosimy o dzien PO najstarszym widocznym liscie
 * (nakladanie zamiast dziur; duplikaty zdejmuje dedup). Serwer waliduje
 * kalendarz (log 2026-10-18: "przed 30 II 2026" odrzucone), wiec data
 * musi byc prawdziwa.
 */
export function nextDay(date: DateYMD): DateYMD {
  const leap =
    date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const max = monthDays[date.month - 1];
  if (!max || date.day < 1 || date.day > max) {
    throw new RangeError(`nieprawidlowa data: ${date.day}.${date.month}.${date.year}`);
  }
  if (date.day < max) return { day: date.day + 1, month: date.month, year: date.year };
  if (date.month < 12) return { day: 1, month: date.month + 1, year: date.year };
  return { day: 1, month: 1, year: date.year + 1 };
}
