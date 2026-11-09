/**
 * Sekcja 16, krok 2: tozsamosc sesji i przynaleznosc odpowiedzi.
 * Wszystkie dane protokolowe sa syntetyczne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MockTransport, type ProtoLine } from '../src/arkmail/core/session/transport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { PagerSession } from '../src/arkmail/core/session/pager';
import {
  startHarness,
  stopHarness,
  loadTruncatedBox,
  click,
  waitRt,
  notifyText,
  type Harness,
} from './harness';

const OPTS = { timeoutMs: 500, idleMs: 30 };
const PAGER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';

interface SessionScope {
  readonly id: number;
  readonly generation: number;
  readonly active: boolean;
  subscribe(cb: (line: ProtoLine) => void): () => void;
  close(): void;
}

interface ScopedTransport {
  openSession?: () => SessionScope;
  setOnline?: (online: boolean) => void;
}

function replayLetter(t: MockTransport, number: number): ProtoLine[] {
  return [
    { cls: 'mail', text: `List : ${number}` },
    { cls: 'mail', text: 'Od   : Corge' },
    { cls: 'mail', text: 'Temat: syntetyczny' },
    { cls: 'mail', text: 'Data : Wt, 24 VIII 1999, 00:11:12' },
    { cls: 'mail', text: '' },
    { cls: 'mail', text: 'Syntetyczna tresc.' },
    { cls: 'mail', text: PAGER_PROMPT.replace('aktualny: 1', `aktualny: ${number}`) },
    { cls: 'prompt', text: '> ' },
  ];
}

function archiveStepText(h: Harness): string {
  return Array.from(
    h.content.querySelectorAll('.arkmail-archive-step') as unknown as Iterable<{
      textContent?: string;
    }>,
  ).map((step) => String(step.textContent ?? '')).join('\n');
}

test('transport: sesje maja odrebne identyfikatory, a reconnect zamyka stara generacje', async () => {
  const t = new MockTransport();
  const scoped = t as unknown as ScopedTransport;
  const open = scoped.openSession?.bind(t);
  assert.ok(open, 'transport udostepnia rejestracje sesji');
  const first = open();
  const firstSeen: string[] = [];
  first.subscribe((line) => firstSeen.push(line.text));
  await t.replay([{ cls: 'mail', text: 'pierwsza' }]);
  assert.deepEqual(firstSeen, ['pierwsza']);
  assert.equal(first.active, true);
  first.close();
  assert.equal(first.active, false);

  const second = open();
  assert.ok(second.id > first.id, 'kazda rejestracja ma nowy identyfikator');
  assert.equal(second.generation, first.generation);
  const secondSeen: string[] = [];
  second.subscribe((line) => secondSeen.push(line.text));
  assert.ok(scoped.setOnline, 'transport umozliwia zmiane generacji polaczenia');
  scoped.setOnline(false);
  scoped.setOnline(true);
  assert.equal(second.active, false, 'reconnect logicznie zamyka stara sesje');
  assert.throws(() => open(), /operacja anulowana/);
  await t.replay([{ cls: 'prompt', text: '> ' }]);

  const third = open();
  assert.ok(third.generation > second.generation, 'nowa sesja ma nowa generacje polaczenia');
  await t.replay([{ cls: 'mail', text: 'po reconnectcie' }]);
  assert.deepEqual(firstSeen, ['pierwsza']);
  assert.deepEqual(secondSeen, [], 'stary subskrybent nie dostaje nowych linii');
  third.close();
});

test('mailbox: stara odpowiedz w nowej sesji jest niejednoznaczna', async () => {
  const t = new MockTransport();
  let cancel: () => void = () => {};
  const mailbox = new MailboxSession(t, {
    ...OPTS,
    onCancel: (cb) => {
      cancel = cb;
      return () => {};
    },
  });
  const oldOperation = assert.rejects(mailbox.fetch('odebrane'), /operacja anulowana/);
  cancel();
  await oldOperation;

  const currentOperation = assert.rejects(
    mailbox.fetch('wyslane'),
    /niejednoznaczna_odpowiedz/,
  );
  await t.replay([
    { cls: 'mail', text: 'Listy odebrane (prezentowane jest pierwsze 50):' },
    { cls: 'prompt', text: '> ' },
  ]);
  await currentOperation;
});

test('pager: List : N inny niz zadany odrzuca odpowiedz jako niejednoznaczna', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const operation = assert.rejects(pager.readLetter(2), /niejednoznaczna_odpowiedz/);
  await t.replay(replayLetter(t, 1));
  await operation;
  assert.equal(t.sent.at(-1), 'q', 'cudzy pager zostaje bezpiecznie zamkniety');
});

test('pager: niezgodny aktualny numer w prompcie jest niejednoznaczny', async () => {
  const t = new MockTransport();
  const pager = new PagerSession(t, OPTS);
  const operation = assert.rejects(pager.readLetter(2), /niejednoznaczna_odpowiedz/);
  const lines = replayLetter(t, 2).map((line) =>
    line.text.includes('(aktualny:') ? { ...line, text: PAGER_PROMPT } : line,
  );
  await t.replay(lines);
  await operation;
  assert.equal(t.sent.at(-1), 'q');
});

test('pager: pozna odpowiedz starej sesji nie konczy pomyslnie nowego odczytu', async () => {
  const t = new MockTransport();
  let cancel: () => void = () => {};
  const pager = new PagerSession(t, {
    ...OPTS,
    onCancel: (cb) => {
      cancel = cb;
      return () => {};
    },
  });
  const oldOperation = assert.rejects(pager.readLetter(1), /operacja anulowana/);
  cancel();
  await oldOperation;

  const currentOperation = assert.rejects(
    pager.readLetter(2),
    /niejednoznaczna_odpowiedz/,
  );
  await t.replay(replayLetter(t, 1));
  await currentOperation;
  assert.ok(!t.sent.includes('przeczytaj list 1') || t.sent.filter((s) => s === 'przeczytaj list 1').length === 1);
});

test('archiwum: niezgodny numer daje niejednoznaczna_odpowiedz i brak zapisu', async () => {
  const h = await startHarness();
  const { f } = h;
  try {
    await loadTruncatedBox(h);
    click(h, '[data-tab="archiwum"]');
    const download = h.content.querySelector('.arkmail-arch-download') as unknown as {
      dispatchEvent(e: unknown): void;
    };
    download.dispatchEvent(new h.window.Event('click'));
    download.dispatchEvent(new h.window.Event('click'));
    await waitRt(() => f.sent.includes('listy odebrane przed 25 VIII 1999'), 're-kotwica');
    f.fire('Listy odebrane (prezentowane jest pierwsze 50):', 'mail');
    f.fire(' 3. *R* Temat: najstarszy', 'mail');
    f.fire('Nadawca: Foo                        Nd, 22 VIII 1999, 01:15:04', 'mail');
    f.fire(' 2. *R* Temat: srodkowy', 'mail');
    f.fire('Nadawca: Foo                        Pn, 23 VIII 1999, 02:20:05', 'mail');
    f.fire(' 1. *R* Temat: najnowszy', 'mail');
    f.fire('Nadawca: Corge                       Wt, 24 VIII 1999, 00:11:12', 'mail');
    f.fire('> ', 'prompt');
    await waitRt(() => f.sent.includes('przeczytaj list 1'), 'zadany odczyt');
    for (const line of replayLetter(new MockTransport(), 2)) f.fire(line.text, line.cls);

    await waitRt(() => {
      const busy = h.content.querySelector('.arkmail-busy') as unknown as {
        textContent?: string;
      } | null;
      return busy?.textContent?.includes('(1/3)') === true;
    }, 'wynik pierwszego rekordu');
    const cancel = h.content.querySelector('.arkmail-arch-download') as unknown as {
      dispatchEvent(e: unknown): void;
    };
    cancel.dispatchEvent(new h.window.Event('click'));
    await waitRt(() => notifyText(f, 'Przerwano pobieranie'), 'zatrzymanie pozostalych rekordow');

    const diagnostics = await import('../src/arkmail/core/archiveDownload.js');
    const events = diagnostics.readArchiveDownloadDiagnostics();
    assert.equal(events[0]?.result, 'niejednoznaczna_odpowiedz');
    assert.equal(events[0]?.stage, 'odczyt');
    assert.ok(archiveStepText(h).includes('liczba listow z trescia 0'), 'cudza tresc nie trafila do Archiwum');
    assert.ok(!f.sent.includes('przeczytaj list 2'), 'przerwanie blokuje kolejny odczyt');
  } finally {
    await stopHarness();
  }
});
