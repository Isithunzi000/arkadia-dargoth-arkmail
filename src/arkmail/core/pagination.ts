import { nextDay, olderListingCommand } from './protocol/commands.js';
import type { MailBox } from './protocol/types.js';
import type { MailboxEntry, MailboxResult } from './session/mailbox.js';

export const PAGE_PACE_MS = 400;
export const ANCHOR_RETRY_WAITS_MS = [2500, 4000, 4000];

export type PageScanEnd = 'complete' | 'partial' | 'clamped' | 'incomplete' | 'cancelled';

export interface PageVisit {
  addedToView?: number;
  archiveAdded?: number;
  stop?: boolean;
}

export interface PageScanResult {
  end: PageScanEnd;
  pages: number;
  addedToView: number;
  archiveAdded: number;
  all: MailboxEntry[];
  oldestSeenDay: string | null;
  gapDays: string[];
  skipWhy: string | null;
}

export interface PageScanOptions {
  box: MailBox;
  initialCommand?: string;
  singlePage?: boolean;
  cancelled: () => boolean;
  fetchPage: (command?: string) => Promise<MailboxResult>;
  wait: (ms: number) => Promise<void>;
  onPage: (result: Extract<MailboxResult, { kind: 'lista' }>, pages: number) => PageVisit | Promise<PageVisit>;
  onEmpty?: (result: Extract<MailboxResult, { kind: 'pusta' }>) => void;
  onBaseRefresh?: (result: MailboxResult) => void;
  onGap?: (day: string) => void;
}

export const entryKey = (entry: MailboxEntry): string =>
  [entry.party, entry.subject, entry.forwarded ? 'f' : '', entry.date?.raw ?? ''].join('|');

export function oldestEntry(entries: readonly MailboxEntry[]): MailboxEntry | null {
  let oldest: MailboxEntry | null = null;
  for (const entry of entries) {
    if (!entry.date) continue;
    if (!oldest || sortKey(entry) < sortKey(oldest)) oldest = entry;
  }
  return oldest;
}

const sortKey = (entry: MailboxEntry): string => {
  const d = entry.date!;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${p(d.month)}-${p(d.day)} ${d.time}`;
};

const isoDay = (entry: MailboxEntry): string | null => entry.date ? sortKey(entry).slice(0, 10) : null;

const oneDayOf = (entries: readonly MailboxEntry[]): string | null => {
  if (entries.length === 0) return null;
  const first = isoDay(entries[0]!);
  if (first === null) return null;
  return entries.every((entry) => isoDay(entry) === first) ? first : null;
};

const gapReason = (day: string): string =>
  `ponad 50 listow z dnia ${day} - serwer nie pokazuje reszty`;

/**
 * Wspolne pobieranie starszych stron. Powtorzenia strony najpierw sa
 * ponawiane, potem sprawdzane jest wykluczenie calego najstarszego dnia.
 * Gdy serwer nie pozwala dotrzec do czesci tego dnia, dzien zostaje
 * zapisany jako luka i wynik nigdy nie jest oznaczany jako kompletny.
 */
export async function scanMailboxPages(options: PageScanOptions): Promise<PageScanResult> {
  const { box } = options;
  const seen = new Set<string>();
  const all: MailboxEntry[] = [];
  const gapDays: string[] = [];
  let pages = 0;
  let addedToView = 0;
  let archiveAdded = 0;
  let oldestSeenDay: string | null = null;
  let anchorRetries = 0;
  let wallProbed = false;
  let probePending = false;
  let probeDay: string | null = null;
  let result = await options.fetchPage(options.initialCommand);

  const finish = (
    end: PageScanEnd,
    skipWhy: string | null = null,
  ): PageScanResult => ({
    end, pages, addedToView, archiveAdded, all, oldestSeenDay,
    gapDays: [...gapDays], skipWhy,
  });
  const addGap = (day: string): void => {
    if (gapDays.includes(day)) return;
    gapDays.push(day);
    gapDays.sort();
    options.onGap?.(day);
  };
  const incompleteWithGaps = (): PageScanResult =>
    finish('incomplete', gapDays.map(gapReason).join('; '));

  for (;;) {
    if (options.cancelled()) return finish('cancelled');
    if (result.kind !== 'lista') {
      options.onEmpty?.(result);
      if (probePending && probeDay !== null) addGap(probeDay);
      if (gapDays.length > 0) return incompleteWithGaps();
      return finish('complete');
    }

    const freshCount = result.entries.filter((entry) => !seen.has(entryKey(entry))).length;
    for (const entry of result.entries) {
      seen.add(entryKey(entry));
      const day = isoDay(entry);
      if (day !== null && (oldestSeenDay === null || day < oldestSeenDay)) oldestSeenDay = day;
    }
    all.push(...result.entries);

    if (probePending && probeDay !== null) {
      const excludedDay = probeDay;
      const reachedOlderDay = result.entries.some((entry) => {
        const day = isoDay(entry);
        return day !== null && day < excludedDay;
      });
      if (!reachedOlderDay) {
        return finish('incomplete', 'serwer chwilowo muli - sprobuj ponownie za chwile');
      }
      addGap(probeDay);
    }

    pages += 1;
    const visit = await options.onPage(result, pages);
    addedToView += visit.addedToView ?? 0;
    archiveAdded += visit.archiveAdded ?? 0;
    if (options.cancelled()) return finish('cancelled');

    if (!result.header.truncated) {
      if (gapDays.length > 0) return incompleteWithGaps();
      return finish('complete');
    }
    if (options.singlePage && freshCount > 0) {
      if (gapDays.length > 0) return incompleteWithGaps();
      return finish('partial');
    }

    if (freshCount === 0) {
      const oldestDuplicate = oldestEntry(all);
      if (!oldestDuplicate?.date) return finish('incomplete', 'brak daty w wpisach');
      const attempt = anchorRetries;
      if (attempt < ANCHOR_RETRY_WAITS_MS.length) {
        anchorRetries += 1;
        await options.wait(ANCHOR_RETRY_WAITS_MS[attempt]!);
        if (options.cancelled()) return finish('cancelled');
        const base = await options.fetchPage();
        options.onBaseRefresh?.(base);
        if (options.cancelled()) return finish('cancelled');
        result = await options.fetchPage(olderListingCommand(box, nextDay(oldestDuplicate.date)));
        continue;
      }
      if (!wallProbed) {
        wallProbed = true;
        probePending = true;
        probeDay = oneDayOf(result.entries);
        result = await options.fetchPage(olderListingCommand(box, oldestDuplicate.date));
        continue;
      }
      return finish('incomplete', 'serwer chwilowo muli - sprobuj ponownie za chwile');
    }

    anchorRetries = 0;
    wallProbed = false;
    probePending = false;
    probeDay = null;
    if (visit.stop) {
      if (gapDays.length > 0) return incompleteWithGaps();
      return finish('clamped');
    }
    const oldest = oldestEntry(all);
    if (!oldest?.date) return finish('incomplete', 'brak daty w wpisach');
    await options.wait(PAGE_PACE_MS);
    if (options.cancelled()) return finish('cancelled');
    result = await options.fetchPage(olderListingCommand(box, nextDay(oldest.date)));
  }
}
