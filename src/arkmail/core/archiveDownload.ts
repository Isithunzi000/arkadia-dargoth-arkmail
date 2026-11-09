/**
 * Wyniki pobierania tresci per rekord i ich zanonimizowana diagnostyka.
 * Modul nie przenosi metadanych ani tresci listow do zdarzen technicznych.
 */

export type ArchiveDownloadResultKind =
  | 'pobrano'
  | 'nie_ma_w_skrzynce'
  | 'blad_kotwiczenia'
  | 'blad_odczytu'
  | 'niejednoznaczna_odpowiedz'
  | 'pusta_tresc'
  | 'blad_zapisu'
  | 'anulowano';

export type ArchiveDownloadStage = 'kotwiczenie' | 'odczyt' | 'zapis';

export interface ArchiveDownloadOutcome<
  K extends ArchiveDownloadResultKind = ArchiveDownloadResultKind,
  S extends ArchiveDownloadStage = ArchiveDownloadStage,
> {
  kind: K;
  stage: S;
}

export type FetchBodyResult =
  | (ArchiveDownloadOutcome<'pobrano', 'zapis'> & { body: string[] })
  | ArchiveDownloadOutcome<'nie_ma_w_skrzynce', 'kotwiczenie'>
  | ArchiveDownloadOutcome<'blad_kotwiczenia', 'kotwiczenie'>
  | ArchiveDownloadOutcome<'blad_odczytu', 'odczyt'>
  | ArchiveDownloadOutcome<'niejednoznaczna_odpowiedz', 'odczyt'>
  | ArchiveDownloadOutcome<'pusta_tresc', 'odczyt'>
  | ArchiveDownloadOutcome<'blad_zapisu', 'zapis'>
  | ArchiveDownloadOutcome<'anulowano'>;

export interface ArchiveDownloadDiagnostic {
  operationId: number;
  generation: number;
  recordAlias: string;
  result: ArchiveDownloadResultKind;
  stage: ArchiveDownloadStage;
  consecutiveErrors: number;
}

/** Jedyny dozwolony ksztalt zdarzenia: pseudonimy i wartosci techniczne. */
export function makeArchiveDownloadDiagnostic(input: {
  operationId: number;
  generation: number;
  recordAlias: string;
  outcome: ArchiveDownloadOutcome;
  consecutiveErrors: number;
}): ArchiveDownloadDiagnostic {
  return {
    operationId: input.operationId,
    generation: input.generation,
    recordAlias: input.recordAlias,
    result: input.outcome.kind,
    stage: input.outcome.stage,
    consecutiveErrors: input.consecutiveErrors,
  };
}

const DIAGNOSTIC_LIMIT = 500;
const diagnostics: ArchiveDownloadDiagnostic[] = [];

/** Zachowuje wynik techniczny bez identyfikatora i danych samego listu. */
export function recordArchiveDownloadDiagnostic(input: {
  operationId: number;
  generation: number;
  recordAlias: string;
  outcome: ArchiveDownloadOutcome;
  consecutiveErrors: number;
}): ArchiveDownloadDiagnostic {
  const diagnostic = makeArchiveDownloadDiagnostic(input);
  diagnostics.push(diagnostic);
  if (diagnostics.length > DIAGNOSTIC_LIMIT) diagnostics.shift();
  return diagnostic;
}

/** Migawka dla diagnostyki; pozniejsze zmiany rejestru jej nie zmieniaja. */
export function readArchiveDownloadDiagnostics(): ArchiveDownloadDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic }));
}

export function clearArchiveDownloadDiagnostics(): void {
  diagnostics.length = 0;
}
