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

/**
 * Kontakty z zaladowanych listingow (korespondencja) + baza people
 * klienta. Kierunek po skrzynce: odebrane/nieprzeczytane = 'in'.
 * Wpisy bez strony listu (party === '') sa pomijane.
 */
export function contactsFromBoxes(
  boxes: Partial<Record<MailBox, { entries: MailboxEntry[] }>>,
  people: ContactInput['people'],
): Contact[] {
  const korespondencja: ContactInput['korespondencja'] = [];
  for (const [box, view] of Object.entries(boxes)) {
    const direction = box === 'odebrane' || box === 'nieprzeczytane' ? 'in' : 'out';
    for (const e of view?.entries ?? []) {
      if (!e.party) continue;
      // Klucz yyyymmddHHMMSS: czas rozbija remisy tego samego dnia
      // (logi: dwa listy 19 IV 2026 o 02:49:49 i 03:03:00).
      const dateKey = e.date
        ? (e.date.year * 10000 + e.date.month * 100 + e.date.day) * 1000000 +
          Number(e.date.time.replace(/:/g, ''))
        : undefined;
      // Wspolny list do kilku osob liczy sie kazdej z nich osobno.
      for (const name of splitParty(e.party)) {
        korespondencja.push({ name, direction, dateRaw: e.date?.raw, dateKey });
      }
    }
  }
  return mergeContacts({ people, przedstawieni: [], korespondencja, aliasy: [] });
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
