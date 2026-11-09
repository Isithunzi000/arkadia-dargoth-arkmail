import { formatListCount } from './deletion.js';

export interface OperationSummary {
  text: string;
  level: 'success' | 'warning';
}

/** Wspolny komunikat konca pobierania: sukces tylko bez porazek, brakow i pozostalych. */
export function buildDownloadSummary(result: {
  done: number;
  total: number;
  failed: number;
  missing: number;
  remaining?: number;
}): OperationSummary {
  const { done, total, failed, missing } = result;
  const remaining = result.remaining ?? Math.max(0, total - done - failed - missing);
  if (failed === 0 && missing === 0 && remaining === 0) {
    return {
      text: `Pobrano tresci do archiwum (${formatListCount(done)}).`,
      level: 'success',
    };
  }
  const parts = [`Pobrano: ${done} z ${total}.`];
  if (failed > 0) parts.push(`Nieudane: ${failed}.`);
  if (missing > 0) parts.push(`Nie ma juz w skrzynce: ${missing}.`);
  if (remaining > 0) parts.push(`Pozostale: ${remaining}.`);
  return { text: parts.join(' '), level: 'warning' };
}

/** Komunikat rozpoczetej obslugi ZIP; nie jest gwarancja zapisu na dysku. */
export function buildExportSummary(
  fileCount: number,
  skipped: number,
  incompleteHeaders = 0,
): OperationSummary {
  const gaps = incompleteHeaders > 0
    ? ` Niepelne historyczne naglowki: ${incompleteHeaders}.`
    : '';
  return {
    text:
      `Zapisano pliki TXT do ZIP. Liczba plikow: ${fileCount}. ` +
      `Pominiete bez tresci: ${skipped}.${gaps}`,
    level: incompleteHeaders > 0 ? 'warning' : 'success',
  };
}
