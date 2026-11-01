import type { MailboxEntry } from './session/mailbox.js';
import type { MailBox } from './protocol/types.js';
import { contentKeyOf, fromMailboxEntry, type ArchiveLetter } from './archive.js';

const entryKey = (entry: MailboxEntry): string =>
  [
    entry.party,
    entry.subject,
    entry.forwarded ? 'f' : '',
    entry.date?.raw ?? '',
  ].join('|');

const compressRange = (numbers: readonly number[]): string => {
  const parts: string[] = [];
  for (let i = 0; i < numbers.length; ) {
    const from = numbers[i]!;
    let to = from;
    while (i + 1 < numbers.length && numbers[i + 1] === to + 1) to = numbers[++i]!;
    parts.push(from === to ? String(from) : `${from}-${to}`);
    i++;
  }
  return parts.join(',');
};

/**
 * Odnajduje wybrane wpisy na swiezym wyniku. Kazda kopia listu zuzywa
 * jedno pasujace wystapienie, wiec duplikaty nie moga zaslonic zmiany.
 */
export function matchSelectionOnFreshListing(
  selected: readonly MailboxEntry[],
  fresh: readonly MailboxEntry[],
): { entries: MailboxEntry[]; numbers: number[]; range: string } | null {
  if (selected.length === 0) return null;
  const available = new Map<string, MailboxEntry[]>();
  for (const entry of fresh) {
    const key = entryKey(entry);
    const entries = available.get(key);
    if (entries) entries.push(entry);
    else available.set(key, [entry]);
  }
  const matched: MailboxEntry[] = [];
  for (const entry of selected) {
    const candidate = available.get(entryKey(entry))?.shift();
    if (!candidate) return null;
    matched.push(candidate);
  }
  matched.sort((a, b) => a.number - b.number);
  const numbers = matched.map((entry) => entry.number);
  return { entries: matched, numbers, range: compressRange(numbers) };
}


/**
 * Fizycznie usuwa lokalne rekordy skasowane na serwerze (Fala 28 -
 * wczesniej: flaga missingOnServer, rekord siedzial w bazie wiecznie
 * i totalne liczniki klamaly). Usuniecie calej tozsamosci wymaga
 * usuniecia wszystkich kopii widocznych na swiezym wyniku.
 */
export function applyConfirmedDeletions(
  archive: ArchiveLetter[],
  box: MailBox,
  fresh: readonly MailboxEntry[],
  confirmedNumbers: readonly number[],
): { letters: ArchiveLetter[]; changedIds: Set<string>; changedBoxes: Set<MailBox> } {
  const changedIds = new Set<string>();
  const changedBoxes = new Set<MailBox>();
  if (confirmedNumbers.length === 0) return { letters: archive, changedIds, changedBoxes };

  const confirmed = new Set(confirmedNumbers);
  const remaining = new Map<string, number>();
  for (const entry of fresh) {
    const key = entryKey(entry);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const removedContentKeys = new Set<string>();
  for (const entry of fresh) {
    if (!confirmed.has(entry.number)) continue;
    const key = entryKey(entry);
    const count = (remaining.get(key) ?? 1) - 1;
    remaining.set(key, count);
    if (count === 0) removedContentKeys.add(contentKeyOf(fromMailboxEntry(box, entry)));
  }
  if (removedContentKeys.size === 0) return { letters: archive, changedIds, changedBoxes };

  const incomingTwin = box === 'odebrane' || box === 'nieprzeczytane';
  const letters = archive.filter((letter) => {
    const samePhysicalLetter = letter.box === box ||
      (incomingTwin && (letter.box === 'odebrane' || letter.box === 'nieprzeczytane'));
    if (!samePhysicalLetter || !removedContentKeys.has(contentKeyOf(letter))) {
      return true;
    }
    changedIds.add(letter.id);
    changedBoxes.add(letter.box);
    return false;
  });
  if (changedIds.size === 0) return { letters: archive, changedIds, changedBoxes };
  return { letters, changedIds, changedBoxes };
}
