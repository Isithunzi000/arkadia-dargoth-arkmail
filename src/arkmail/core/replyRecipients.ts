/** Budowanie odbiorcow reply-all z jednej pelnej migawki LetterContent. */

import type { MailBox } from './protocol/types.js';
import type { LetterContent } from './session/pager.js';
import { splitRecipients } from './composeValidation.js';

export interface ReplyAllLetter extends LetterContent {
  box: MailBox;
}

export interface ReplyAllPrefill {
  adresat: string;
  dw: string;
}

export type ReplyAllScope = 'all' | 'to' | 'cc';

/** Zrodla znanych nazw wspolne dla reply-all i advisory wysylki. */
export const knownRecipientNames = (state: {
  contacts: { name: string; mailAlias?: string }[];
  people: string[];
  importedAliases: { name: string }[];
  groups: { members: string[] }[];
}): Set<string> => {
  const known = new Set<string>();
  const add = (name: string): void => {
    const key = name.trim().toLowerCase();
    if (key) known.add(key);
  };
  for (const contact of state.contacts) {
    add(contact.name);
    if (contact.mailAlias) add(contact.mailAlias);
  }
  for (const name of state.people) add(name);
  for (const alias of state.importedAliases) add(alias.name);
  for (const group of state.groups) for (const member of group.members) add(member);
  return known;
};

/**
 * Naglowkowy spojnik jest separatorem, nie czescia formularza. Znane
 * nazwy wielowyrazowe i aliasy rozpoznaje wspolny parser compose.
 */
export function parseReplyHeader(value: string, known: ReadonlySet<string>): string[] {
  return splitRecipients(value.replace(/\s+i\s+/gi, ','), known);
}

export type ReplyAllEmptyReason = 'no-recipients' | 'only-current-character';

export type ReplyAllResult =
  | { kind: 'prefill'; scope: ReplyAllScope; prefill: ReplyAllPrefill }
  | { kind: 'empty'; scope: ReplyAllScope; reason: ReplyAllEmptyReason };

/** Jedna tresc komunikatu dla zwyklego listu i Archiwum. */
export function replyAllEmptyMessage(scope: ReplyAllScope, reason: ReplyAllEmptyReason): string {
  if (scope === 'cc') {
    return reason === 'only-current-character'
      ? 'Nie mozna przygotowac odpowiedzi tylko do DW, poniewaz Twoja postac jest jedynym odbiorca DW i zostaje pominieta.'
      : 'List nie ma odbiorcow DW, wiec nie mozna przygotowac odpowiedzi tylko do DW.';
  }
  if (scope === 'to') {
    return reason === 'only-current-character'
      ? 'Nie mozna przygotowac odpowiedzi w zakresie Tylko DO, poniewaz Twoja postac jest jedyna osoba w tym zakresie i zostaje pominieta.'
      : 'Nie mozna przygotowac odpowiedzi w zakresie Tylko DO, poniewaz ten zakres nie zawiera adresatow.';
  }
  return reason === 'only-current-character'
    ? 'Nie mozna przygotowac odpowiedzi wszystkim, poniewaz Twoja postac jest jedynym adresem odpowiedzi i zostaje pominieta.'
    : 'Nie mozna przygotowac odpowiedzi wszystkim, poniewaz list nie zawiera adresatow odpowiedzi.';
}

/** Rozroznia brak adresatow od odrzucenia wylacznie aktualnej postaci. */
export function buildReplyAllResult(
  letter: ReplyAllLetter,
  currentCharacter: string | null,
  known: ReadonlySet<string>,
  scope: ReplyAllScope = 'all',
): ReplyAllResult {
  const current = currentCharacter?.trim().toLowerCase() || null;
  const empty = (onlyCurrent: boolean): ReplyAllResult => ({
    kind: 'empty',
    scope,
    reason: onlyCurrent ? 'only-current-character' : 'no-recipients',
  });
  if (scope === 'cc') {
    const carbon: string[] = [];
    const seen = new Set<string>();
    let onlyCurrent = false;
    for (const name of parseReplyHeader(letter.cc ?? '', known)) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      if (key === current) onlyCurrent = true;
      if (key === current || seen.has(key)) continue;
      seen.add(key);
      carbon.push(name);
    }
    if (carbon.length === 0) return empty(onlyCurrent);
    return { kind: 'prefill', scope, prefill: { adresat: carbon.join(', '), dw: '' } };
  }

  const primary: string[] = [];
  const carbon: string[] = [];
  const seen = new Set<string>();
  let currentPrimary = false;
  let currentCarbon = false;
  const add = (header: string | null, destination: string[]): void => {
    for (const name of parseReplyHeader(header ?? '', known)) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      if (key === current) {
        if (destination === primary) currentPrimary = true;
        else currentCarbon = true;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      if (key === current) continue;
      destination.push(name);
    }
  };

  const received = letter.box === 'odebrane' || letter.box === 'nieprzeczytane';
  if (received) add(letter.from, primary);
  add(letter.to, primary);
  add(letter.cc, carbon);

  if (scope === 'to') {
    if (primary.length === 0) return empty(currentPrimary);
    return { kind: 'prefill', scope, prefill: { adresat: primary.join(', '), dw: '' } };
  }
  if (primary.length === 0 && carbon.length > 0) {
    primary.push(...carbon);
    carbon.length = 0;
  }
  if (primary.length === 0) return empty(currentPrimary || currentCarbon);
  return { kind: 'prefill', scope, prefill: { adresat: primary.join(', '), dw: carbon.join(', ') } };
}

/** Poprzedni interfejs dla wywolan, ktore potrzebuja tylko gotowych pol. */
export function buildReplyAllPrefill(
  letter: ReplyAllLetter,
  currentCharacter: string | null,
  known: ReadonlySet<string>,
  scope: ReplyAllScope = 'all',
): ReplyAllPrefill | null {
  const result = buildReplyAllResult(letter, currentCharacter, known, scope);
  return result.kind === 'prefill' ? result.prefill : null;
}
