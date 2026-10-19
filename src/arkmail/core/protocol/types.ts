/**
 * Typy protokolu poczty Arkadii (czysty TS - zero DOM, zero PluginApi).
 * Specyfikacja zrodlowa: docs/PROTOCOL.md; zachowanie przypiete golden
 * fixtures z prawdziwych logow gry (tests/fixtures/).
 */

/** Pojedyncza linia strumienia gry: tekst + klasa gmcp_msgs (jesli znana). */
export interface ProtoLine {
  cls: string;
  text: string;
}

export type MailBox = 'nieprzeczytane' | 'odebrane' | 'wyslane' | 'niewyslane';

/** Data z naglowka listingu/listu, np. "N, 21 XII 2025, 01:15:04". */
export interface MailDate {
  raw: string;
  weekday: string;
  day: number;
  month: number;
  year: number;
  time: string;
}

/** Wpis na listing skrzynki (linia "N. [*R*] Temat: ..."). */
export interface ListingEntry {
  number: number;
  /** *R* = przeczytany (na nieprzeczytanych wpisy go nie maja). */
  isRead: boolean;
  /** Temat bez suffiksu "(forwardowany)". */
  subject: string;
  /** Temat konczyl sie "(forwardowany)" - list forwardowany. */
  forwarded: boolean;
}

export interface ListingHeader {
  box: MailBox;
  /** Suffix "(prezentowane jest pierwsze 50)" - serwer ucina do 50. */
  truncated: boolean;
}

export interface EmptyListing {
  box: MailBox;
  /** 'puste': "Nie masz zadnych..."; 'filtr': "Nie znaleziono zadnych takich...". */
  reason: 'puste' | 'filtr';
}

export type LetterHeaderField = 'numer' | 'od' | 'temat' | 'do' | 'dw' | 'data';

export interface LetterHeaderLine {
  field: LetterHeaderField;
  value: string;
}

export interface PagerPrompt {
  lo: number;
  hi: number;
  current: number;
}

export interface MailAliasDef {
  name: string;
  targets: string[];
}

export type MailNotification =
  | { kind: 'nowa-poczte'; nadawca: string }
  | { kind: 'goniec' }
  | { kind: 'wysylasz'; zwierze: string }
  | { kind: 'powrot-zwierzecia'; zwierze: string };

export type MailError =
  | { kind: 'zly-numer'; numer: number }
  | { kind: 'brak-adresata'; adresat: string }
  | { kind: 'brak-wyboru' };

/** Echo promptow compose, np. "Adresat: Temat: DW: " przy pipeliningu. */
export type ComposePrompt = 'adresat' | 'temat' | 'dw';

/** Echo numeracji linii edytora, np. " 14]15]...List zostal pomyslnie wyslany." */
export interface EditorEcho {
  /** Najwyzszy zaakceptowany numer linii. */
  consumed: number;
  result: 'wyslany' | 'gotowy' | null;
}

/** Wynik compose: fizycznie wyslany (urzad) albo w kolejce niewyslanych. */
export type ComposeResult = 'wyslany' | 'gotowy';
