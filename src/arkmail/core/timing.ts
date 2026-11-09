/** Anulowalne pauzy, ich techniczna diagnostyka i probkowanie ETA. */

export interface CancellationFlag {
  cancelled: boolean;
  waiters?: Set<() => void>;
}

export interface WaitDiagnostic {
  stage: string;
  plannedMs: number;
  actualMs: number;
  outcome: 'wykonano' | 'anulowano';
}

const DIAGNOSTIC_LIMIT = 500;
const waitDiagnostics: WaitDiagnostic[] = [];

export function readWaitDiagnostics(): WaitDiagnostic[] {
  return waitDiagnostics.map((item) => ({ ...item }));
}

export function clearWaitDiagnostics(): void {
  waitDiagnostics.length = 0;
}

const recordWait = (stage: string, plannedMs: number, startedAt: number, outcome: WaitDiagnostic['outcome']): void => {
  waitDiagnostics.push({
    stage,
    plannedMs,
    actualMs: Math.max(0, Date.now() - startedAt),
    outcome,
  });
  if (waitDiagnostics.length > DIAGNOSTIC_LIMIT) waitDiagnostics.shift();
};

/** Anuluje flage i natychmiast zdejmuje timer kazdej oczekujacej pauzy. */
export function cancelFlag(flag: CancellationFlag): void {
  if (flag.cancelled) return;
  flag.cancelled = true;
  for (const wake of [...(flag.waiters ?? [])]) wake();
}

/**
 * Jedna pauza = jeden timer. Reconnect i anulowanie wywoluja ten sam
 * sprzatajacy koniec, wiec po opoznieniu nie ma serii nadrabiajacych timera.
 */
export function waitOrCancel(
  ms: number,
  flag: CancellationFlag,
  stage: string,
  onCancel?: (callback: () => void) => () => void,
): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let offCancel: (() => void) | null = null;
    const finish = (outcome: WaitDiagnostic['outcome']): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      offCancel?.();
      flag.waiters?.delete(wake);
      recordWait(stage, ms, startedAt, outcome);
      resolve();
    };
    const wake = (): void => finish('anulowano');
    flag.waiters ??= new Set();
    flag.waiters.add(wake);
    offCancel = onCancel?.(() => cancelFlag(flag)) ?? null;
    timer = setTimeout(() => finish('wykonano'), ms);
    if (flag.cancelled) wake();
  });
}

/** EMA czasu rzeczywiscie zakonczonych rekordow z jawnym resetem probki. */
export class DownloadEta {
  private emaMs: number | null = null;
  private lastAt: number;

  constructor(now: number) {
    this.lastAt = now;
  }

  reset(now: number): void {
    this.emaMs = null;
    this.lastAt = now;
  }

  sample(now: number, processed: number, total: number): number | null {
    const elapsed = Math.max(0, now - this.lastAt);
    this.lastAt = now;
    this.emaMs = this.emaMs === null ? elapsed : 0.3 * elapsed + 0.7 * this.emaMs;
    if (processed < 3) return null;
    return Math.max(1000, Math.round(this.emaMs * Math.max(0, total - processed)));
  }
}
