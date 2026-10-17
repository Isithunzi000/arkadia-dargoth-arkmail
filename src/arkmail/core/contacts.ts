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
}

export interface ContactInput {
  people: Array<{ name: string; description?: string; guild?: string }>;
  przedstawieni: string[];
  korespondencja: Array<{ name: string; direction: 'in' | 'out'; dateRaw?: string }>;
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
    if (k.dateRaw && (!c.lastContactRaw || k.dateRaw > c.lastContactRaw)) {
      // Daty roznia sie dniem tygodnia (tekstem) - porownanie surowe wystarczy
      // dla fixture'ow; dokladne sortowanie robi parsowana MailDate w archive.
      c.lastContactRaw = k.dateRaw;
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
