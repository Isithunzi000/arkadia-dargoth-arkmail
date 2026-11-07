import { formatListCount } from './deletion.js';

export interface OperationSummary {
  text: string;
  level: 'success' | 'warning';
}

/** Wspolny komunikat konca pobierania: sukces tylko bez porazek i brakow. */
export function buildDownloadSummary(result: {
  done: number;
  total: number;
  failed: number;
  missing: number;
}): OperationSummary {
  const { done, total, failed, missing } = result;
  if (failed === 0 && missing === 0) {
    return {
      text: `Pobrano tresci do archiwum (${formatListCount(done)}).`,
      level: 'success',
    };
  }
  const parts = [`Pobrano: ${done} z ${total}.`];
  if (failed > 0) parts.push(`Nieudane: ${failed}.`);
  if (missing > 0) parts.push(`Nie ma juz w skrzynce: ${missing}.`);
  return { text: parts.join(' '), level: 'warning' };
}

/** Komunikat rozpoczetej obslugi ZIP; nie jest gwarancja zapisu na dysku. */
export function buildExportSummary(fileCount: number, skipped: number): OperationSummary {
  return {
    text:
      `Zapisano pliki TXT do ZIP. Liczba plikow: ${fileCount}. ` +
      `Pominiete bez tresci: ${skipped}.`,
    level: 'success',
  };
}
