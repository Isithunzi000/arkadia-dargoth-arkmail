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

export const SEARCH_DATE_ERROR = 'Podaj prawidlowa date w formacie RRRR-MM-DD.';
const SEARCH_RANGE_ERROR = 'Od dnia pozniej niz Do dnia.';

function isValidDateYMD(date: DateYMD): boolean {
  if (!Number.isInteger(date.day) || !Number.isInteger(date.month) || !Number.isInteger(date.year)) {
    return false;
  }
  if (date.year < 1 || date.month < 1 || date.month > 12 || date.day < 1) return false;
  const leap = date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return date.day <= monthDays[date.month - 1];
}

function assertValidDateYMD(date: DateYMD): void {
  if (!isValidDateYMD(date)) throw new RangeError(SEARCH_DATE_ERROR);
}

function compareDates(a: DateYMD, b: DateYMD): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function hasPreviousDay(date: DateYMD): boolean {
  return date.year > 1 || date.month > 1 || date.day > 1;
}

/** Komenda listing starszych listow: "listy <skrzynka> przed <d> <M> <y>". */
export function olderListingCommand(box: MailBox, date: DateYMD): string {
  assertValidDateYMD(date);
  const roman = ROMAN_MONTHS[date.month - 1];
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
  assertValidDateYMD(date);
  const leap =
    date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const max = monthDays[date.month - 1];
  if (date.day < max) return { day: date.day + 1, month: date.month, year: date.year };
  if (date.month < 12) return { day: 1, month: date.month + 1, year: date.year };
  return { day: 1, month: 1, year: date.year + 1 };
}

/**
 * Poprzedni dzien (kalendarz gregorianski). Dolna granica szukajki:
 * serwer traktuje "po <data>" jako WYLACZNE dzienno-granularne (jak
 * "przed" - potwierdzone w grze 2026-10-23), wiec dla wlacznej daty
 * poczatkowej w UI wysylamy dzien PRZED nia. Walidacja jak w nextDay.
 */
export function prevDay(date: DateYMD): DateYMD {
  assertValidDateYMD(date);
  if (!hasPreviousDay(date)) throw new RangeError(SEARCH_DATE_ERROR);
  const leap =
    date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (date.day > 1) return { day: date.day - 1, month: date.month, year: date.year };
  if (date.month > 1) {
    return { day: monthDays[date.month - 2], month: date.month - 1, year: date.year };
  }
  // 1 stycznia -> 31 grudnia roku poprzedniego (grudzien ma zawsze 31).
  return { day: 31, month: 12, year: date.year - 1 };
}

// --- Szukanie serwerowe (Fala 8g, skladnia ?listy z helpu w grze) ------------

/**
 * Zapytanie szukania z UI. Daty sa WLACZNE (tak mysli uzytkownik);
 * budowniczy komendy przelicza je na granice serwera.
 */
export interface ListingSearch {
  /** Nadawca (odebrane/nieprzeczytane) albo adresat (wyslane/niewyslane). */
  osoba?: string;
  odDaty?: DateYMD;
  doDaty?: DateYMD;
  temat?: string;
  tresc?: string;
}

/** Surowe pola formularza przed zamiana dat ISO na DateYMD. */
export interface ListingSearchDraft {
  osoba: string;
  temat: string;
  tresc: string;
  odDaty: string;
  doDaty: string;
}

type SearchTextFields = Pick<ListingSearch, 'osoba' | 'temat' | 'tresc'>;

function validateSearchText(query: SearchTextFields): string | null {
  if (query.osoba && !/^[a-zA-Z]+$/.test(query.osoba)) {
    return 'Osoba: tylko litery a-zA-Z.';
  }
  if (query.temat && /[;#]/.test(query.temat)) {
    return 'Temat nie moze zawierac znakow ; ani #.';
  }
  if (query.tresc && /[;#]/.test(query.tresc)) {
    return 'Tresc nie moze zawierac znakow ; ani #.';
  }
  return null;
}

/** Wspolna walidacja handlera i ostatniej bramki przed komenda. */
export function validateListingSearch(query: ListingSearch): string | null {
  const textError = validateSearchText(query);
  if (textError) return textError;
  if (query.odDaty && (!isValidDateYMD(query.odDaty) || !hasPreviousDay(query.odDaty))) {
    return SEARCH_DATE_ERROR;
  }
  if (query.doDaty && !isValidDateYMD(query.doDaty)) return SEARCH_DATE_ERROR;
  if (query.odDaty && query.doDaty && compareDates(query.odDaty, query.doDaty) > 0) {
    return SEARCH_RANGE_ERROR;
  }
  return null;
}

/** Walidacja formularza bez cichego pomijania blednych dat ISO. */
export function validateSearchDraft(draft: ListingSearchDraft): string | null {
  const textError = validateSearchText(draft);
  if (textError) return textError;
  const odDaty = draft.odDaty === '' ? null : fromISODate(draft.odDaty);
  const doDaty = draft.doDaty === '' ? null : fromISODate(draft.doDaty);
  if ((draft.odDaty !== '' && !odDaty) || (draft.doDaty !== '' && !doDaty)) {
    return SEARCH_DATE_ERROR;
  }
  if (odDaty && !hasPreviousDay(odDaty)) return SEARCH_DATE_ERROR;
  if (odDaty && doDaty && compareDates(odDaty, doDaty) > 0) return SEARCH_RANGE_ERROR;
  return null;
}

const SENDER_BOXES: ReadonlySet<MailBox> = new Set(['odebrane', 'nieprzeczytane']);

const datePart = (d: DateYMD): string => `${d.day} ${ROMAN_MONTHS[d.month - 1]} ${d.year}`;

/**
 * Komenda "listy" z filtrami serwera. Kolejnosc: osoba -> daty ->
 * tresc -> temat. "o temacie" to na serwerze CHCIWY OGON (wartosc =
 * reszta linii), wiec musi byc OSTATNIM argumentem; "o tresci" i daty
 * sa tokenizowane i lacza sie dowolnie (potwierdzone w grze
 * 2026-10-23: temat->tresc dawal pusty wynik, tresc->temat dziala).
 * OBIE granice dat sa na serwerze dzienno-granularne i WYLACZNE
 * (potwierdzone w grze: "przed" 2026-10-22, "po" 2026-10-23), wiec dla
 * wlacznego zakresu w UI wysylamy "po dzien wczesniej" i "przed dzien
 * pozniej" (patrz docs/PROTOCOL.md).
 */
export function searchListingCommand(box: MailBox, q: ListingSearch): string {
  const validationError = validateListingSearch(q);
  if (validationError) throw new RangeError(validationError);
  const parts = [`listy ${box}`];
  if (q.osoba) {
    const osoba = q.osoba.toLowerCase();
    parts.push(SENDER_BOXES.has(box) ? `od ${osoba}` : `do ${osoba}`);
  }
  if (q.odDaty) parts.push(`po ${datePart(prevDay(q.odDaty))}`);
  if (q.doDaty) parts.push(`przed ${datePart(nextDay(q.doDaty))}`);
  if (q.tresc) parts.push(`o tresci ${q.tresc}`);
  if (q.temat) parts.push(`o temacie ${q.temat}`);
  return parts.join(' ');
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Pole input type="date" ("YYYY-MM-DD") -> DateYMD; null gdy smieci
 *  (walidacja kalendarza gregorianskiego jak na serwerze). */
export function fromISODate(iso: string): DateYMD | null {
  const m = iso.match(ISO_RE);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  try {
    // nextDay rzuca RangeError dla dat spoza kalendarza (np. 30 II).
    nextDay(date);
  } catch {
    return null;
  }
  return date;
}

const isoOf = (d: DateYMD): string =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** Opis zapytania do bannera wynikow (czytelny, po polsku). */
export function searchDescription(box: MailBox, q: ListingSearch): string {
  const parts: string[] = [box];
  if (q.osoba) parts.push(`${SENDER_BOXES.has(box) ? 'nadawca' : 'adresat'}: ${q.osoba}`);
  if (q.odDaty) parts.push(`od dnia: ${isoOf(q.odDaty)}`);
  if (q.doDaty) parts.push(`do dnia: ${isoOf(q.doDaty)}`);
  if (q.temat) parts.push(`temat: "${q.temat}"`);
  if (q.tresc) parts.push(`tresc: "${q.tresc}"`);
  return parts.join(', ');
}
