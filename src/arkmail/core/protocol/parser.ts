/**
 * Parser protokolu poczty Arkadii - czyste funkcje nad liniami gry.
 * Bez stanu, bez DOM, bez PluginApi. Regexy zweryfikowane bajt w bajt
 * z logami gry (tests/fixtures/) i z kodem klienta (poczta.ts, MIT).
 */

import type {
  ComposePrompt,
  ComposeResult,
  EditorEcho,
  EmptyListing,
  LetterHeaderLine,
  ListingEntry,
  ListingHeader,
  MailAliasDef,
  MailBox,
  MailDate,
  MailError,
  MailNotification,
  PagerPrompt,
} from './types.js';

export type { ProtoLine } from './types.js';
export type { MailBox } from './types.js';

// Klient dokleja prefix "[ POCZTA ] " do linii "Masz nowa poczte..."
// (newMail.ts) - logi zapisuja tekst PO triggerach. Tolerujemy go.
const CLIENT_PREFIX_RE = /^\s*\[ POCZTA \]\s+/;

export function stripClientPrefix(text: string): string {
  return text.replace(CLIENT_PREFIX_RE, '').trimStart();
}

// --- daty ------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
  VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
};

const DATE_RE = /^([A-Za-z]+), (\d{1,2}) (XII|XI|IX|VIII|VII|VI|IV|V|III|II|I|X) (\d{4}), (\d{2}:\d{2}:\d{2})$/;

export function parseMailDate(raw: string): MailDate | null {
  const m = raw.match(DATE_RE);
  if (!m) return null;
  return {
    raw,
    weekday: m[1],
    day: Number(m[2]),
    month: MONTHS[m[3]],
    year: Number(m[4]),
    time: m[5],
  };
}

// --- listingi ----------------------------------------------------------------

const LISTING_HEADER_RE = /^Listy (nieprzeczytane|odebrane|wyslane|niewyslane)(?: \(([^)]*)\))?:$/;

export function parseListingHeader(text: string): ListingHeader | null {
  const m = text.match(LISTING_HEADER_RE);
  if (!m) return null;
  return {
    box: m[1] as MailBox,
    truncated: m[2] !== undefined && m[2].includes('pierwsze 50'),
  };
}

const LISTING_ENTRY_RE = /^\s*(\d+)\.\s+(?:(\*R\*)\s+)?Temat: (.+)$/;
const FORWARDED_SUFFIX = ' (forwardowany)';

export function parseListingEntry(text: string): ListingEntry | null {
  const m = text.match(LISTING_ENTRY_RE);
  if (!m) return null;
  let subject = m[3];
  let forwarded = false;
  if (subject.endsWith(FORWARDED_SUFFIX)) {
    forwarded = true;
    subject = subject.slice(0, -FORWARDED_SUFFIX.length);
  }
  return { number: Number(m[1]), isRead: m[2] === '*R*', subject, forwarded };
}

/** Linia "Nadawca: X   data" albo "Odbiorcy: X   data" na listingu. */
const LISTING_PARTY_RE = /^(Nadawca|Odbiorc[ay]): (.+?)(?:\s{2,}(.+))?$/;

export function parseListingParty(text: string): { kind: 'nadawca' | 'odbiorcy'; names: string; date: MailDate | null } | null {
  const m = text.match(LISTING_PARTY_RE);
  if (!m) return null;
  return {
    kind: m[1] === 'Nadawca' ? 'nadawca' : 'odbiorcy',
    names: m[2],
    date: m[3] ? parseMailDate(m[3]) : null,
  };
}

const EMPTY_LISTING_RE = /^Nie masz zadnych (nieprzeczytanych|odebranych|wyslanych|niewyslanych) listow\.$/;
const FILTERED_EMPTY_RE = /^Nie znaleziono zadnych takich (nieprzeczytanych|odebranych|wyslanych|niewyslanych) listow\.$/;

const BOX_FROM_GENITIVE: Record<string, MailBox> = {
  nieprzeczytanych: 'nieprzeczytane',
  odebranych: 'odebrane',
  wyslanych: 'wyslane',
  niewyslanych: 'niewyslane',
};

export function parseEmptyListing(text: string): EmptyListing | null {
  const puste = text.match(EMPTY_LISTING_RE);
  if (puste) return { box: BOX_FROM_GENITIVE[puste[1]], reason: 'puste' };
  const filtr = text.match(FILTERED_EMPTY_RE);
  if (filtr) return { box: BOX_FROM_GENITIVE[filtr[1]], reason: 'filtr' };
  return null;
}

// --- naglowki listu ----------------------------------------------------------

const LETTER_HEADER_RES: Array<{ re: RegExp; field: LetterHeaderLine['field'] }> = [
  { re: /^List\s*: ?(\d+)$/, field: 'numer' },
  { re: /^Od\s*: ?(.+)$/, field: 'od' },
  { re: /^Temat\s*: ?(.+)$/, field: 'temat' },
  { re: /^Do\s*: ?(.*)$/, field: 'do' },
  { re: /^DW\s*: ?(.+)$/, field: 'dw' },
  { re: /^Data\s*: ?(.+)$/, field: 'data' },
];

export function parseLetterHeaderLine(text: string): LetterHeaderLine | null {
  for (const { re, field } of LETTER_HEADER_RES) {
    const m = text.match(re);
    if (m) return { field, value: m[1] };
  }
  return null;
}

// --- pager --------------------------------------------------------------------

// Np. "[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 23) -- " (spacja na koncu).
const PAGER_PROMPT_RE = /^\[(\d+)-(\d+) [a-zA-Z.!?+<>\-]+\] \(aktualny: (\d+)\) --\s*$/;

export function isPagerPrompt(text: string): PagerPrompt | null {
  const m = text.match(PAGER_PROMPT_RE);
  if (!m) return null;
  return { lo: Number(m[1]), hi: Number(m[2]), current: Number(m[3]) };
}

// --- aliasy pocztowe ------------------------------------------------------------

const ALIASES_HEADER = 'Posiadasz nastepujace zdefiniowane aliasy pocztowe:';
const ALIAS_ENTRY_RE = /^\s*(\S+): (.+)$/;

/** Parsuje blok zaczynajacy sie naglowkiem aliasow (linie tabowane). */
export function parseAliasesBlock(lines: string[]): MailAliasDef[] {
  if (!lines.length || lines[0] !== ALIASES_HEADER) return [];
  const out: MailAliasDef[] = [];
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(ALIAS_ENTRY_RE);
    if (!m) break;
    out.push({ name: m[1], targets: m[2].split(',').map((s) => s.trim()).filter(Boolean) });
  }
  return out;
}

// --- powiadomienia ----------------------------------------------------------------

export function parseNotification(text: string): MailNotification | null {
  const t = stripClientPrefix(text);
  const nowa = t.match(/^Masz nowa poczte od ([A-Za-z]+)\.$/);
  if (nowa) return { kind: 'nowa-poczte', nadawca: nowa[1] };
  if (t === 'Goniec przyniosl nowa partie listow.') return { kind: 'goniec' };
  const wysylasz = t.match(/^Wysylasz ([A-Za-z]+) na poczte\.$/);
  if (wysylasz) return { kind: 'wysylasz', zwierze: wysylasz[1] };
  return null;
}

// --- bledy -------------------------------------------------------------------------

export function parseMailError(text: string): MailError | null {
  const zly = text.match(/^Zly numer listu: (\d+)\.$/);
  if (zly) return { kind: 'zly-numer', numer: Number(zly[1]) };
  // Subdialogi (Adresat:/DW:) doklejaja echo promptu przed komunikatem.
  const adresat = text.match(/^(?:Adresat: |DW: |Temat: )?Nie ma takiego adresata \(gracza, aliasu\): (.+)\.$/);
  if (adresat) return { kind: 'brak-adresata', adresat: adresat[1] };
  if (text === 'Zadne listy nie zostaly wybrane.') return { kind: 'brak-wyboru' };
  return null;
}

// --- compose / edytor -----------------------------------------------------------------

const COMPOSE_ECHO_RE = /^(?:(Adresat|Temat|DW): )+$/;

/** Echo promptow compose przy pipeliningu, np. "Adresat: Temat: DW: ". */
export function parseComposeEcho(text: string): ComposePrompt[] | null {
  if (!COMPOSE_ECHO_RE.test(text)) return null;
  const out: ComposePrompt[] = [];
  for (const m of text.matchAll(/(Adresat|Temat|DW): /g)) {
    out.push(m[1] === 'Adresat' ? 'adresat' : m[1] === 'Temat' ? 'temat' : 'dw');
  }
  return out.length ? out : null;
}

const EDITOR_ECHO_RE = /^(\s*\d+\])+/;
const RESULT_WYSLANY = 'List zostal pomyslnie wyslany.';
const RESULT_GOTOWY = 'List jest gotowy do wyslania.';

/** Echo numeracji linii edytora; moze konczyc sie komunikatem wyniku. */
export function parseEditorEcho(text: string): EditorEcho | null {
  const m = text.match(EDITOR_ECHO_RE);
  if (!m) return null;
  const numbers = [...m[0].matchAll(/(\d+)\]/g)].map((x) => Number(x[1]));
  const rest = text.slice(m[0].length);
  let result: EditorEcho['result'] = null;
  if (rest === RESULT_WYSLANY) result = 'wyslany';
  else if (rest === RESULT_GOTOWY) result = 'gotowy';
  else if (rest !== '') return null;
  return { consumed: Math.max(...numbers), result };
}

export function parseComposeResult(text: string): ComposeResult | null {
  if (text === RESULT_WYSLANY) return 'wyslany';
  if (text === RESULT_GOTOWY) return 'gotowy';
  return null;
}

// --- przedstawieni ----------------------------------------------------------------------

// "[28] Osoby, ktore zostaly ci ostatnio przedstawione, to A, B, C i D."
const PRZEDSTAWIENI_RE = /^\[\d+\] Osoby, ktore zostaly ci ostatnio przedstawione, to (.+)\.$/;

export function parsePrzedstawieni(text: string): string[] | null {
  const m = text.match(PRZEDSTAWIENI_RE);
  if (!m) return null;
  // "Foo, Quux, ..., Zonk i Waldo" - ostatni separator to " i ".
  const parts = m[1].split(', ');
  const last = parts.pop()!;
  const lastSplit = last.split(' i ');
  return [...parts, ...lastSplit].map((s) => s.trim()).filter(Boolean);
}
