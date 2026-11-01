/**
 * Eksport listow do TXT (Fala 17g, zgloszenie 2026-10-19/20 pkt 7).
 *
 * Format jak na ekranie (renderList): temat, meta "Od: X | Do: Y |
 * [DW: Z |] data | skrzynka: B" (puste pola pomijane, jak w meta
 * widoku), pusta linia, tresc. Konce linii LF, kody ANSI zdjete,
 * plik konczy sie znakiem nowej linii. Nazwy plikow ASCII z slugow
 * (Arkadia i tak nie ma diakrytykow; slug chroni przed znakami
 * niebezpiecznymi dla systemu plikow).
 */

import type { ArchiveLetter } from './archive.js';
import { BOX_RANK, bodiesOf, contentKeyOf, occurrenceCount, withOccurrenceBodies } from './archive.js';
import { parseMailDate } from './protocol/parser.js';
import type { MailBox } from './protocol/types.js';

// Sekwencje ANSI (kolory klienta) nie naleza do tresci listu.
const ANSI_RE = /\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export interface LetterTxtInput {
  subject: string;
  from?: string;
  to?: string;
  cc?: string | null;
  date?: string | null;
  box: MailBox;
  body: string[];
}

/** Tresc TXT listu - uklad 1:1 z widokiem na ekranie + skrzynka. */
export function letterTxt(l: LetterTxtInput): string {
  const meta: string[] = [];
  if (l.from) meta.push(`Od: ${stripAnsi(l.from)}`);
  if (l.to) meta.push(`Do: ${stripAnsi(l.to)}`);
  if (l.cc) meta.push(`DW: ${stripAnsi(l.cc)}`);
  if (l.date) meta.push(stripAnsi(l.date));
  meta.push(`skrzynka: ${l.box}`);
  const lines = [stripAnsi(l.subject), meta.join(' | '), '', ...l.body.map(stripAnsi)];
  return lines.join('\n') + '\n';
}

const SENDER_BOXES: ReadonlySet<MailBox> = new Set(['odebrane', 'nieprzeczytane']);

/** Rekord archiwum -> TXT (strona listu po kierunku skrzynki). */
export function archiveLetterTxt(l: ArchiveLetter): string {
  const sender = SENDER_BOXES.has(l.box);
  return letterTxt({
    subject: l.subject,
    from: sender ? l.party : '',
    to: sender ? '' : l.party,
    date: l.dateRaw,
    box: l.box,
    body: l.body,
  });
}

/** Slug ASCII do nazwy pliku (fallback 'list' dla pustego). */
export function slugAscii(s: string, max = 40): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'list').slice(0, max);
}

const p2 = (n: number): string => String(n).padStart(2, '0');

/** <sortKey>_<strona>_<temat>.txt - sortKey z daty protokolu. */
export function txtFileName(party: string, subject: string, dateRaw: string | null): string {
  const d = dateRaw ? parseMailDate(dateRaw) : null;
  const stamp = d
    ? `${d.year}-${p2(d.month)}-${p2(d.day)}_${d.time.replace(/:/g, '-')}`
    : '0000-00-00_00-00-00';
  return `${stamp}_${slugAscii(party, 24)}_${slugAscii(subject, 40)}.txt`;
}

export interface ExportEntry {
  /** Sciezka w ZIP: <skrzynka>/<plik>.txt. */
  name: string;
  txt: string;
}

/**
 * Eksport calego archiwum: jeden plik per wystapienie (Fala 35d,
 * variant 2): N wylistowanych listow = N plikow, kazdy slot tresci
 * rekordu (body = wystapienie 1, extraBodies = 2..n) to osobny plik
 * z numerem porzadkowym _01.._NN w nazwie. Rekord z occurrences = 1
 * zachowuje dawna nazwe bez numeru. Slot bez tresci: pominiety i
 * liczony. Blizniaki nieprzeczytane/odebrane deduplikowane po kluczu
 * tresci (Fala 17c) - pliki laduja w folderze skrzynki kanonicznej.
 * Rekordy nieobecne na serwerze pomijane (Fala 18a).
 * Kolizje nazw dostaja suffiks -2, -3, ...
 * Wynik posortowany od najnowszych (deterministycznie).
 */
export function archiveExportEntries(letters: readonly ArchiveLetter[]): {
  entries: ExportEntry[];
  skipped: number;
} {
  const byKey = new Map<string, ArchiveLetter[]>();
  for (const l of letters) {
    const key = contentKeyOf(l);
    const group = byKey.get(key);
    if (group) group.push(l);
    else byKey.set(key, [l]);
  }
  const byCanonicalBox = (a: ArchiveLetter, b: ArchiveLetter): number =>
    BOX_RANK[a.box] - BOX_RANK[b.box] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const representatives = [...byKey.values()].map((group) => {
    const canonical = [...group].sort(byCanonicalBox)[0]!;
    // Kanoniczny rekord z kompletem slotow: jesli sam jest pusty,
    // pozyczamy sloty od blizniaczego rekordu z innej skrzynki.
    const withBodies = group
      .filter((letter) => bodiesOf(letter).some((s) => s.length > 0))
      .sort(byCanonicalBox)[0];
    return withBodies ? withOccurrenceBodies(canonical, bodiesOf(withBodies)) : canonical;
  });
  // Fala 35d: rozwiniecie per wystapienie - kazdy slot z trescia
  // to osobny plik z numerem porzadkowym.
  interface Expanded {
    letter: ArchiveLetter;
    body: string[];
    ordinal: number | null;
  }
  let skipped = 0;
  const expanded: Expanded[] = [];
  for (const letter of representatives) {
    const n = occurrenceCount(letter);
    const slots = bodiesOf(letter);
    if (n <= 1) {
      if (letter.body.length > 0) expanded.push({ letter, body: letter.body, ordinal: null });
      else skipped += 1;
      continue;
    }
    for (let i = 0; i < n; i++) {
      const slot = slots[i];
      if (slot && slot.length > 0) {
        expanded.push({ letter, body: slot, ordinal: i + 1 });
      } else {
        skipped += 1;
      }
    }
  }
  const sorted = [...expanded].sort((a, b) => {
    if (a.letter.sortKey !== b.letter.sortKey) return a.letter.sortKey < b.letter.sortKey ? 1 : -1;
    if (a.letter.id !== b.letter.id) return a.letter.id < b.letter.id ? -1 : 1;
    return (a.ordinal ?? 0) - (b.ordinal ?? 0);
  });
  const used = new Map<string, number>();
  const entries: ExportEntry[] = sorted.map(({ letter, body, ordinal }) => {
    let base = `${letter.box}/${txtFileName(letter.party, letter.subject, letter.dateRaw)}`;
    if (ordinal !== null) base = base.replace(/\.txt$/, `_${String(ordinal).padStart(2, '0')}.txt`);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const name = n === 1 ? base : base.replace(/\.txt$/, `-${n}.txt`);
    return { name, txt: archiveLetterTxt({ ...letter, body }) };
  });
  return { entries, skipped };
}
