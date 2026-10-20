/**
 * Scalanie bazy kontaktow ArkMail (czysty core, zero DOM/PluginApi).
 *
 * Zrodla (w kolejnosci wiarygodnosci nazwy kanonicznej):
 * - people: baza znanych osob klienta (mianownik + opis + guild),
 * - przedstawieni: scraping komendy "przedstawieni" (mianownik),
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

export type ContactSource = 'people' | 'przedstawieni' | 'korespondencja' | 'alias';

export interface Contact {
  /** Kanoniczne imie (z people/przedstawieni/korespondencji - pierwsze wygrywa). */
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
export function splitParty(party: string): string[] {
  const out: string[] = [];
  for (const part of party.split(/, | i /)) {
    const name = part.trim();
    if (name !== '' && !out.includes(name)) out.push(name);
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
  const korespondencja: ContactInput['korespondencja'] = [];
  const seen = new Set<string>();
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
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      korespondencja.push({ name, direction: l.direction, dateRaw: l.dateRaw ?? undefined, dateKey: l.dateKey });
    }
  }
  return korespondencja;
}

/** Listings wpis -> znormalizowany LetterLike (dateKey z MailDate). */
function entryToLetterLike(box: MailBox, e: MailboxEntry): LetterLike {
  // Klucz yyyymmddHHMMSS: czas rozbija remisy tego samego dnia
  // (logi: dwa listy 19 IV 2026 o 02:49:49 i 03:03:00).
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
    przedstawieni: [],
    korespondencja: korespondencjaFromLetters(letters),
    aliasy: [],
  });
}

/**
 * Kontakty z ARCHIWUM (Fala 14a): licznik stabilny - archiwum kumuluje
 * kazdy pobrany listing i przetrwa refresh oraz restart (storage),
 * w przeciwienstwie do widokow skrzynek (domyslnie pierwsze 50 wpisow).
 * Rekordy sprzed Fali 14a nie maja pola forwarded - traktowane jak false.
 */
export function contactsFromArchive(letters: readonly ArchiveLetter[]): Contact[] {
  return mergeContacts({
    people: [],
    przedstawieni: [],
    // Fala 18a: listy oznaczone jako znikniete z serwera nie licza sie
    // do kontaktow (kompletny listing raportuje pelna prawde).
    // Fala 18b: szkice (niewyslane) to nie wyslana korespondencja.
    korespondencja: korespondencjaFromLetters(
      letters
        .filter((l) => l.missingOnServer !== true && l.box !== 'niewyslane')
        .map(archiveToLetterLike),
    ),
    aliasy: [],
  });
}

export interface ContactInput {
  people: Array<{ name: string; description?: string; guild?: string }>;
  przedstawieni: string[];
  korespondencja: Array<{ name: string; direction: 'in' | 'out'; dateRaw?: string; dateKey?: number }>;
  aliasy: Array<{ name: string; targets: string[] }>;
}

const SOURCE_ORDER: ContactSource[] = ['people', 'przedstawieni', 'korespondencja', 'alias'];

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
  for (const name of input.przedstawieni) {
    const c = get(name);
    addSource(c, 'przedstawieni');
  }
  for (const k of input.korespondencja) {
    const c = get(k.name);
    addSource(c, 'korespondencja');
    if (k.direction === 'in') c.lettersReceived++;
    else c.lettersSent++;
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
