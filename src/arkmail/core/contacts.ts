/**
 * Scalanie bazy kontaktow ArkMail (czysty core, zero DOM/PluginApi).
 *
 * Zrodla (w kolejnosci wiarygodnosci nazwy kanonicznej):
 * - people: baza znanych osob klienta (mianownik + opis + guild),
 * - korespondencja: nadawcy/odbiorcy z listingow i listow (mianownik),
 * - aliasy: aliasy pocztowe zdefiniowane w grze (cel = mianownik).
 *
 * Powiadomienie "Masz nowa poczte od X" swiadomie NIE jest zrodlem:
 * imie przychodzi w dopelniaczu i nie da sie go wiarygodnie odmienic
 * wstecz - powiadomienie tylko wyzwala odswiezenie listingow.
 *
 * Dopasowanie miedzy zrodlami: case-insensitive po imieniu.
 */

import type { MailBox } from './protocol/types.js';
import type { MailboxEntry } from './session/mailbox.js';
import type { ArchiveLetter } from './archive.js';
import { occurrenceCount } from './archive.js';

export type ContactSource = 'people' | 'korespondencja' | 'alias';

export interface Contact {
  /** Kanoniczne imie (z people/korespondencji - pierwsze wygrywa). */
  name: string;
  sources: ContactSource[];
  description?: string;
  guild?: string;
  /** Alias pocztowy wskazujacy na te osobe (jesli zdefiniowany w grze). */
  mailAlias?: string;
  lettersReceived: number;
  lettersSent: number;
  lastContactRaw?: string;
  /** Klucz yyyymmddHHMMSS ostatniego kontaktu (z MailDate) - poprawne porownanie. */
  lastContactKey?: number;
}

/**
 * Dzieli strone listu na osobne osoby. Listingi lacza odbiorcow
 * przecinkiem ('Odbiorcy: Fred, Grault', 'Odbiorcy: Plugh, Baz, Bar'
 * - logi 2026-04/08), naglowki listow spojnikiem ' i '. Imiona postaci
 * w Arkadii sa jednowyrazowe, wiec oba separatory sa bezpieczne.
 * Dedup w obrebie jednej strony, kolejnosc zachowana.
 */
const CONTACT_NAME_RE = /^[A-Za-z]+$/;
const WEEKDAYS = new Set([
  'n', 'nd', 'nie', 'niedziela',
  'pn', 'pon', 'poniedzialek',
  'wt', 'wto', 'wtorek',
  'sr', 'sro', 'sroda',
  'cz', 'czw', 'czwartek',
  'pt', 'pi', 'piatek',
  'so', 'sob', 'sobota',
]);

export function splitParty(party: string): string[] {
  const out: string[] = [];
  for (const part of party.split(/, | i /)) {
    const name = part.trim();
    if (!CONTACT_NAME_RE.test(name) || WEEKDAYS.has(name.toLowerCase())) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Kierunek korespondencji po skrzynce: listy OD osoby vs DO osoby. */
const directionOf = (box: MailBox): 'in' | 'out' =>
  box === 'odebrane' || box === 'nieprzeczytane' ? 'in' : 'out';

/** Znormalizowany wpis korespondencji (wspolny dla listingow i archiwum). */
interface LetterLike {
  direction: 'in' | 'out';
  party: string;
  subject: string;
  forwarded: boolean;
  dateRaw?: string | null;
  dateKey?: number;
  /** Fala 41: skrzynka pochodzenia - granica dedupu licznika. */
  box: MailBox;
  /** Fala 35: liczba wystapien (archiwum legacy); brak = 1. */
  count?: number;
}

/**
 * Wspolny rdzen liczenia: ten sam list widac w kilku skrzynkach
 * (nieprzeczytany jest i w odebranych, i w nieprzeczytanych) - liczymy
 * go RAZ (Fala 9c). Klucz bez numeru (serwer renumeruje);
 * kierunek+osoba+temat+forwarded+data = tozsamosc. Wspolny list do
 * kilku osob liczy sie kazdej z nich osobno. Wpisy bez strony listu
 * (party === '') sa pomijane.
 */
function korespondencjaFromLetters(
  letters: readonly LetterLike[],
): ContactInput['korespondencja'] {
  // Fala 41: kazdy listingowany list to osobna korespondencja. Dedup
  // licznika: w obrebie TEJ SAMEJ skrzynki identyczne wpisy sumuja sie
  // (blizniaki = dwa listy), a replika miedzy skrzynkami (nieprzeczytany
  // w "nieprzeczytane" i "odebrane") liczy MAX - jeden fizyczny list.
  const byDedupKey = new Map<string, { name: string; direction: 'in' | 'out'; dateRaw?: string; dateKey?: number; perBox: Map<MailBox, number> }>();
  for (const l of letters) {
    if (!l.party) continue;
    for (const name of splitParty(l.party)) {
      const dedupKey = [
        l.direction,
        name.toLowerCase(),
        l.subject,
        l.forwarded ? 'f' : '',
        l.dateRaw ?? '',
      ].join('|');
      const n = l.count ?? 1;
      let entry = byDedupKey.get(dedupKey);
      if (!entry) {
        entry = {
          name,
          direction: l.direction,
          dateRaw: l.dateRaw ?? undefined,
          dateKey: l.dateKey,
          perBox: new Map(),
        };
        byDedupKey.set(dedupKey, entry);
      }
      // W obrebie skrzynki: suma wystapien (rekordy osobne licza
      // kazde z osobna); legacy pole occurrences wnosi swoja liczbe.
      entry.perBox.set(l.box, (entry.perBox.get(l.box) ?? 0) + n);
      if (entry.dateKey === undefined && l.dateKey !== undefined) entry.dateKey = l.dateKey;
    }
  }
  return [...byDedupKey.values()].map((entry) => ({
    name: entry.name,
    direction: entry.direction,
    dateRaw: entry.dateRaw,
    dateKey: entry.dateKey,
    // Miedzy skrzynkami MAX - replika to ten sam fizyczny list.
    count: Math.max(...entry.perBox.values()),
  }));
}

/** Listings wpis -> znormalizowany LetterLike (dateKey z MailDate). */
function entryToLetterLike(box: MailBox, e: MailboxEntry): LetterLike {
  // Klucz yyyymmddHHMMSS: czas rozbija remisy tego samego dnia
  // (logi: dwa listy 31 X 1999 o 02:49:49 i 03:03:00).
  const dateKey = e.date
    ? (e.date.year * 10000 + e.date.month * 100 + e.date.day) * 1000000 +
      Number(e.date.time.replace(/:/g, ''))
    : undefined;
  return {
    direction: directionOf(box),
    party: e.party,
    subject: e.subject,
    forwarded: e.forwarded,
    dateRaw: e.date?.raw,
    dateKey,
    box,
  };
}

/** Rekord archiwum -> znormalizowany LetterLike (dateKey z sortKey). */
function archiveToLetterLike(l: ArchiveLetter): LetterLike {
  // sortKey 'YYYY-MM-DD HH:MM:SS' -> yyyymmddHHMMSS; same zera = brak daty.
  const digits = Number(l.sortKey.replace(/\D/g, ''));
  return {
    direction: directionOf(l.box),
    party: l.party,
    subject: l.subject,
    forwarded: l.forwarded === true,
    dateRaw: l.dateRaw,
    dateKey: digits > 0 ? digits : undefined,
    box: l.box,
  };
}

/**
 * Kontakty z zaladowanych listingow (korespondencja) + baza people
 * klienta. Wpisy bez strony listu (party === '') sa pomijane.
 */
export function contactsFromBoxes(
  boxes: Partial<Record<MailBox, { entries: MailboxEntry[] }>>,
  people: ContactInput['people'],
): Contact[] {
  const letters: LetterLike[] = [];
  for (const [box, view] of Object.entries(boxes)) {
    // Fala 18b: szkice (niewyslane) to nie wyslana korespondencja.
    if (box === 'niewyslane') continue;
    for (const e of view?.entries ?? []) {
      letters.push(entryToLetterLike(box as MailBox, e));
    }
  }
  return mergeContacts({
    people,
    korespondencja: korespondencjaFromLetters(letters),
    aliasy: [],
  });
}

/**
 * Kontakty z ARCHIWUM (Fala 14a): licznik stabilny - archiwum kumuluje
 * kazdy pobrany listing i przetrwa refresh oraz restart (storage),
 * w przeciwienstwie do widokow skrzynek (domyslnie pierwsze 50 wpisow).
 * Rekordy sprzed Fali 14a nie maja pola forwarded - traktowane jak false.
 * Fala 28: listow nieobecnych na serwerze w bazie nie ma wcale
 * (fizyczny purge), wiec zywosc nie jest sprawdzana.
 */
export function contactsFromArchive(letters: readonly ArchiveLetter[]): Contact[] {
  return mergeContacts({
    people: [],
    // Fala 18b: szkice (niewyslane) to nie wyslana korespondencja.
    korespondencja: korespondencjaFromLetters(
      letters
        .filter((l) => l.box !== 'niewyslane')
        // Fala 35: rekord wnosi liczbe wystapien (dedup ponizej sumuje).
        .map((l) => ({ ...archiveToLetterLike(l), count: occurrenceCount(l) })),
    ),
    aliasy: [],
  });
}

export interface ContactInput {
  people: Array<{ name: string; description?: string; guild?: string }>;
  korespondencja: Array<{
    name: string;
    direction: 'in' | 'out';
    dateRaw?: string;
    dateKey?: number;
    /** Fala 35: liczba wystapien (dedup korespondencji sumuje); brak = 1. */
    count?: number;
  }>;
  aliasy: Array<{ name: string; targets: string[] }>;
}

const SOURCE_ORDER: ContactSource[] = ['people', 'korespondencja', 'alias'];

export function mergeContacts(input: ContactInput): Contact[] {
  const byKey = new Map<string, Contact>();

  const get = (name: string): Contact => {
    const key = name.toLowerCase();
    let c = byKey.get(key);
    if (!c) {
      c = { name, sources: [], lettersReceived: 0, lettersSent: 0 };
      byKey.set(key, c);
    }
    return c;
  };
  const addSource = (c: Contact, s: ContactSource) => {
    if (!c.sources.includes(s)) c.sources.push(s);
  };

  for (const p of input.people) {
    const c = get(p.name);
    c.name = p.name; // people ma najwierniejsza forme
    addSource(c, 'people');
    if (p.description) c.description = p.description;
    if (p.guild) c.guild = p.guild;
  }
  for (const k of input.korespondencja) {
    const c = get(k.name);
    addSource(c, 'korespondencja');
    // Fala 35: wystapienia sumuja sie (blizniaki = tyle listow ile ich
    // wylistowal serwer); wpisy bez pola licza sie jak dotad jako 1.
    const n = k.count ?? 1;
    if (k.direction === 'in') c.lettersReceived += n;
    else c.lettersSent += n;
    if (k.dateKey !== undefined) {
      // Klucz yyyymmddHHMMSS z MailDate: poprawne porownanie chronologiczne.
      // Surowe stringi roznia sie dniem tygodnia i miesiacem rzymskim,
      // wiec porownanie leksykalne myli (np. 'So, 25 IV' > 'N, 26 IV').
      if (c.lastContactKey === undefined || k.dateKey > c.lastContactKey) {
        c.lastContactKey = k.dateKey;
        if (k.dateRaw) c.lastContactRaw = k.dateRaw;
      }
    } else if (k.dateRaw && c.lastContactKey === undefined) {
      // Wpis bez sparsowanej daty: surowe porownanie tylko dopoki kontakt
      // nie ma jeszcze klucza (klucz zawsze wygrywa z leksykalnym).
      if (!c.lastContactRaw || k.dateRaw > c.lastContactRaw) {
        c.lastContactRaw = k.dateRaw;
      }
    }
  }
  for (const a of input.aliasy) {
    for (const target of a.targets) {
      const c = get(target);
      addSource(c, 'alias');
      if (!c.mailAlias) c.mailAlias = a.name;
    }
  }

  const out = [...byKey.values()];
  for (const c of out) {
    c.sources.sort((x, y) => SOURCE_ORDER.indexOf(x) - SOURCE_ORDER.indexOf(y));
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return out;
}

export type ContactSort = 'nazwa' | 'liczba' | 'ostatni';

/**
 * Widok kontaktow dla UI: filtr (nazwa lub alias, case-insensitive)
 * i sortowanie. Wejscia nie mutuje (kopia); 'nazwa' = alfabetycznie pl,
 * 'liczba' = suma listow malejaco, 'ostatni' = klucz daty malejaco
 * (kontakty bez daty na koncu). Remisy rozstrzyga nazwa.
 */
export function viewContacts(
  contacts: Contact[],
  opts: { filter?: string; sort?: ContactSort } = {},
): Contact[] {
  const f = (opts.filter ?? '').trim().toLowerCase();
  const filtered =
    f === ''
      ? [...contacts]
      : contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(f) ||
            (c.mailAlias !== undefined && c.mailAlias.toLowerCase().includes(f)),
        );
  const byName = (a: Contact, b: Contact): number => a.name.localeCompare(b.name, 'pl');
  switch (opts.sort ?? 'nazwa') {
    case 'liczba':
      filtered.sort(
        (a, b) =>
          b.lettersReceived + b.lettersSent - (a.lettersReceived + a.lettersSent) ||
          byName(a, b),
      );
      break;
    case 'ostatni':
      filtered.sort(
        (a, b) => (b.lastContactKey ?? -1) - (a.lastContactKey ?? -1) || byName(a, b),
      );
      break;
    default:
      filtered.sort(byName);
  }
  return filtered;
}
