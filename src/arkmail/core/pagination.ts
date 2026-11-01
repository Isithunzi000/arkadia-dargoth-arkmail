import { nextDay, olderListingCommand } from './protocol/commands.js';
import type { MailBox } from './protocol/types.js';
import type { MailboxEntry, MailboxResult } from './session/mailbox.js';
import { fnv1a } from './archive.js';

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
  /**
   * Fala 35: liczba swiezych wierszy per klucz tresci w CAŁYM skanie
   * (wystapienia; sonda sciany nie doklada ponownie dnia granicznego).
   */
  freshCounts: Map<string, number>;
}

export interface PageScanOptions {
  box: MailBox;
  initialCommand?: string;
  singlePage?: boolean;
  cancelled: () => boolean;
  fetchPage: (command?: string) => Promise<MailboxResult>;
  wait: (ms: number) => Promise<void>;
  onPage: (
    result: Extract<MailboxResult, { kind: 'lista' }>,
    pages: number,
    /** Fala 35: swieze wiersze strony per klucz tresci (wynik listingu). */
    fresh: ReadonlyMap<string, number>,
  ) => PageVisit | Promise<PageVisit>;
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
  // Fala 35: liczba wierszy klucza widziana w skanie (wynik
  // listingu; wszystkie wystapienia klucza siedza na jednej stronie,
  // bo klucz jest jednodniowy). Ponowne pokazanie tych samych wierszy
  // (serwer odpowiada wolno / sonda sciany) nie zmienia liczby.
  const seenCounts = new Map<string, number>();
  const freshCounts = new Map<string, number>();
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
    gapDays: [...gapDays], skipWhy, freshCounts,
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

    // Fala 35: wystapienia = wiersze klucza na NAJSWIEZSZEJ stronie
    // go pokazujacej (wynik listingu, semantyka nadpisania). Blizniaki
    // licza sie wielokrotnie; ponowne pokazanie tych samych wierszy
    // (sonda sciany / serwer odpowiada wolno) przy tej samej liczbie nie doklada.
    const rowsPerKey = new Map<string, number>();
    for (const entry of result.entries) {
      // Fala 35: klucz zgodny z contentKeyOf archiwum (fnv1a) -
      // setOccurrences w indeksacji dopasowuje po tym samym hashu.
      const k = fnv1a(entryKey(entry));
      rowsPerKey.set(k, (rowsPerKey.get(k) ?? 0) + 1);
      const day = isoDay(entry);
      if (day !== null && (oldestSeenDay === null || day < oldestSeenDay)) oldestSeenDay = day;
    }
    const pageFresh = new Map<string, number>();
    let freshCount = 0;
    for (const [k, n] of rowsPerKey) {
      if ((seenCounts.get(k) ?? 0) !== n) {
        seenCounts.set(k, n);
        freshCounts.set(k, n);
        pageFresh.set(k, n);
        freshCount += n;
      }
    }
    all.push(...result.entries);

    if (probePending && probeDay !== null) {
      const excludedDay = probeDay;
      const reachedOlderDay = result.entries.some((entry) => {
        const day = isoDay(entry);
        return day !== null && day < excludedDay;
      });
      if (!reachedOlderDay) {
        return finish('incomplete', 'serwer chwilowo odpowiada wolno - sprobuj ponownie za chwile');
      }
      addGap(probeDay);
    }

    pages += 1;
    const visit = await options.onPage(result, pages, pageFresh);
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
      return finish('incomplete', 'serwer chwilowo odpowiada wolno - sprobuj ponownie za chwile');
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
