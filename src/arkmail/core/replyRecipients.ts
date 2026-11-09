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

/**
 * Zwraca kanoniczne pola albo null, gdy po regulach nie ma odbiorcy.
 * Nie zmienia zwyklej odpowiedzi, cytowania ani recznego wpisu.
 */
export function buildReplyAllPrefill(
  letter: ReplyAllLetter,
  currentCharacter: string | null,
  known: ReadonlySet<string>,
): ReplyAllPrefill | null {
  const current = currentCharacter?.trim().toLowerCase() || null;
  const primary: string[] = [];
  const carbon: string[] = [];
  const seen = new Set<string>();
  const add = (header: string | null, destination: string[]): void => {
    for (const name of parseReplyHeader(header ?? '', known)) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (key === current) continue;
      destination.push(name);
    }
  };

  const received = letter.box === 'odebrane' || letter.box === 'nieprzeczytane';
  if (received) add(letter.from, primary);
  add(letter.to, primary);
  add(letter.cc, carbon);

  if (primary.length === 0 && carbon.length > 0) {
    primary.push(...carbon);
    carbon.length = 0;
  }
  if (primary.length === 0) return null;
  return { adresat: primary.join(', '), dw: carbon.join(', ') };
}
