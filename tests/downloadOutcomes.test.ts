/**
 * Sekcja 16, krok 1: jednoznaczny wynik kazdego rekordu pobierania.
 * Dane protokolowe sa w calosci syntetyczne. Diagnostyka moze zawierac
 * wylacznie pseudonim rekordu, etap, kategorie i liczniki techniczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { upsertLetters, type ArchiveLetter } from '../src/arkmail/core/archive';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

interface SummaryModule {
  buildDownloadSummary(result: {
    done: number;
    total: number;
    failed: number;
    missing: number;
    remaining?: number;
  }): { text: string; level: 'success' | 'warning' };
}

async function summaryModule(): Promise<SummaryModule> {
  const path = '../src/arkmail/ui/operationSummary.js';
  return (await import(path)) as SummaryModule;
}

interface DiagnosticModule {
  makeArchiveDownloadDiagnostic(input: {
    operationId: number;
    generation: number;
    recordAlias: string;
    outcome: { kind: string; stage: string };
    consecutiveErrors: number;
  }): Record<string, unknown>;
  readArchiveDownloadDiagnostics(): Array<Record<string, unknown>>;
  clearArchiveDownloadDiagnostics(): void;
}

async function diagnosticModule(): Promise<DiagnosticModule> {
  const path = '../src/arkmail/core/archiveDownload.js';
  return (await import(path)) as DiagnosticModule;
}

const downloadBtn = (h: Harness): { textContent: string; dispatchEvent(e: unknown): void } => {
  const button = h.content.querySelector('.arkmail-arch-download') as unknown as {
    textContent: string;
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(button, 'przycisk pobierania istnieje');
  return button;
};

const clickDownload = (h: Harness): void =>
  downloadBtn(h).dispatchEvent(new h.window.Event('click'));

async function startDownload(h: Harness): Promise<void> {
  const { clearArchiveDownloadDiagnostics } = await diagnosticModule();
  clearArchiveDownloadDiagnostics();
  await loadTruncatedBox(h);
  click(h, '[data-tab="archiwum"]');
  clickDownload(h);
  clickDownload(h);
  await waitRt(
    () => h.f.sent.includes('listy odebrane przed 25 VIII 1999'),
    'pierwsza re-kotwica',
  );
}

function replayListing3(h: Harness): void {
  const { f } = h;
  f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
  f.fire(' 3. *R* Temat: najstarszy', 'mail');
  f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
  f.fire(' 2. *R* Temat: srodkowy', 'mail');
  f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
  f.fire(' 1. *R* Temat: najnowszy', 'mail');
  f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
  f.fire('> ', 'prompt');
}

function replayLetter(h: Harness, numer: number, subject: string, body: string[]): void {
  const { f } = h;
  f.fire(`List : ${numer}`, 'mail');
  f.fire('Od   : Corge', 'mail');
  f.fire(`Temat: ${subject}`, 'mail');
  f.fire('Data : Wt, 24 VIII 1999, 00:11:12', 'mail');
  if (body.length > 0) {
    f.fire('', 'mail');
    for (const line of body) f.fire(line, 'mail');
  }
  f.fire(`[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: ${numer}) -- `, 'mail');
  f.fire('> ', 'prompt');
}

async function diagnostics(): Promise<Array<Record<string, unknown>>> {
  const { readArchiveDownloadDiagnostics } = await diagnosticModule();
  return readArchiveDownloadDiagnostics();
}

function archiveStepText(h: Harness): string {
  const steps = Array.from(
    h.content.querySelectorAll('.arkmail-archive-step') as unknown as Iterable<{
      textContent?: string;
    }>,
  );
  return steps.map((step) => String(step.textContent ?? '')).join('\n');
}

test('pobieranie: podsumowanie rozdziela pobrane, nieudane, znikniete i pozostale', async () => {
  const { buildDownloadSummary } = await summaryModule();
  assert.deepEqual(
    buildDownloadSummary({ done: 4, total: 8, failed: 1, missing: 1, remaining: 2 }),
    {
      text: 'Pobrano: 4 z 8. Nieudane: 1. Nie ma juz w skrzynce: 1. Pozostale: 2.',
      level: 'warning',
    },
  );
});

test('pobieranie: kazdy koncowy stan zachowuje kategorie i etap bez danych listu', async () => {
  const { makeArchiveDownloadDiagnostic } = await diagnosticModule();
  const outcomes = [
    { kind: 'pobrano', stage: 'zapis' },
    { kind: 'nie_ma_w_skrzynce', stage: 'kotwiczenie' },
    { kind: 'blad_kotwiczenia', stage: 'kotwiczenie' },
    { kind: 'blad_odczytu', stage: 'odczyt' },
    { kind: 'niejednoznaczna_odpowiedz', stage: 'odczyt' },
    { kind: 'pusta_tresc', stage: 'odczyt' },
    { kind: 'blad_zapisu', stage: 'zapis' },
    { kind: 'anulowano', stage: 'odczyt' },
  ];
  for (const [index, outcome] of outcomes.entries()) {
    const diagnostic = makeArchiveDownloadDiagnostic({
      operationId: 7,
      generation: 3,
      recordAlias: `rekord-${index + 1}`,
      outcome,
      consecutiveErrors: index,
    });
    assert.deepEqual(diagnostic, {
      operationId: 7,
      generation: 3,
      recordAlias: `rekord-${index + 1}`,
      result: outcome.kind,
      stage: outcome.stage,
      consecutiveErrors: index,
    });
    assert.deepEqual(Object.keys(diagnostic).sort(), [
      'consecutiveErrors',
      'generation',
      'operationId',
      'recordAlias',
      'result',
      'stage',
    ]);
  }
});

test('pobieranie: body = [] jest pusta_tresc, nieudanym rekordem i nadal kandydatem', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await startDownload(h);
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'odczyt z pusta trescia');
    replayLetter(h, 1, 'najnowszy', []);

    await waitRt(() => f.sent.includes('listy odebrane przed 24 VIII 1999'), 'druga re-kotwica');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'drugi odczyt');
    replayLetter(h, 2, 'srodkowy', ['Syntetyczna tresc drugiego.']);

    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'trzecia re-kotwica');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'trzeci odczyt');
    replayLetter(h, 3, 'najstarszy', ['Syntetyczna tresc trzeciego.']);

    await waitRt(() => notifyText(f, 'Pobrano: 2 z 3. Nieudane: 1.'), 'podsumowanie');
    assert.ok(!notifyText(f, 'Pobrano tresci do archiwum (3 listy).'), 'pusta tresc nie jest sukcesem');
    await waitRt(() => archiveStepText(h).includes('Do pobrania: 1.'), 'rekord pozostal kandydatem');
    assert.ok(archiveStepText(h).includes('liczba listow z trescia 2'), 'licznik pobranych wynika z Archiwum');

    const events = await diagnostics();
    assert.equal(events.length, 3, 'jeden wynik koncowy na rekord');
    assert.deepEqual(events.map((event) => event.result), ['pusta_tresc', 'pobrano', 'pobrano']);
    assert.equal(events[0]?.stage, 'odczyt');
    assert.deepEqual(events.map((event) => event.recordAlias), ['rekord-1', 'rekord-2', 'rekord-3']);
    assert.doesNotMatch(
      JSON.stringify(events),
      /najnowszy|srodkowy|najstarszy|Corge|Syntetyczna tresc/,
      'diagnostyka nie zawiera tematow, osob ani tresci',
    );
  } finally {
    await stopHarness();
  }
});

test('pobieranie: jeden blad przy pelnym pasku zostawia Do pobrania: 1 i ma diagnostyke etapu', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await startDownload(h);
    f.fire('Data zostala podana w zlym formacie.', 'mail');

    await waitRt(() => f.sent.includes('listy odebrane przed 24 VIII 1999'), 'druga re-kotwica');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 2'), 'drugi odczyt');
    replayLetter(h, 2, 'srodkowy', ['Syntetyczna tresc drugiego.']);

    await waitRt(() => f.sent.includes('listy odebrane przed 23 VIII 1999'), 'trzecia re-kotwica');
    replayListing3(h);
    await waitRt(() => f.sent.includes('przeczytaj list 3'), 'trzeci odczyt');
    replayLetter(h, 3, 'najstarszy', ['Syntetyczna tresc trzeciego.']);

    await waitRt(() => notifyText(f, 'Pobrano: 2 z 3. Nieudane: 1.'), 'jeden nieudany przy pelnym zakresie');
    await waitRt(() => archiveStepText(h).includes('Do pobrania: 1.'), 'rzeczywisty stan Archiwum');
    const events = await diagnostics();
    assert.deepEqual(events.map((event) => event.result), [
      'blad_kotwiczenia',
      'pobrano',
      'pobrano',
    ]);
    assert.deepEqual(events.map((event) => event.stage), ['kotwiczenie', 'zapis', 'zapis']);
  } finally {
    await stopHarness();
  }
});

test('pobieranie: anulowanie kotwiczenia nie jest normalnym zakonczeniem i raportuje pozostale', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await startDownload(h);
    clickDownload(h);
    replayListing3(h);

    await waitRt(() => notifyText(f, 'Przerwano pobieranie'), 'osobny komunikat przerwania');
    assert.ok(notifyText(f, 'Pobrano: 0 z 3. Pozostale: 3.'), 'podsumowanie zawiera pozostale rekordy');
    assert.ok(!notifyText(f, 'Pobrano tresci do archiwum'), 'anulowanie nie jest pelnym sukcesem');
    assert.ok(!f.sent.includes('przeczytaj list 1'), 'anulowana kotwica nie otwiera listu');
    const events = await diagnostics();
    assert.equal(events.length, 1, 'jeden anulowany rekord');
    assert.equal(events[0]?.result, 'anulowano');
    assert.equal(events[0]?.stage, 'kotwiczenie');
  } finally {
    await stopHarness();
  }
});

test('pobieranie: pusta odpowiedz nie nadpisuje istniejacej tresci podczas upsertu', () => {
  const existing = {
    id: 'syntetyczny-rekord',
    box: 'odebrane',
    number: 1,
    party: 'Foo',
    subject: 'Syntetyczny temat',
    dateRaw: 'Wt, 24 VIII 1999, 00:11:12',
    sortKey: '1999-08-24 00:11:12',
    read: false,
    body: ['Zachowana syntetyczna tresc.'],
  } satisfies ArchiveLetter;
  const merged = upsertLetters([existing], [{ ...existing, read: true, body: [] }]);
  assert.deepEqual(merged.letters[0]?.body, ['Zachowana syntetyczna tresc.']);
});
