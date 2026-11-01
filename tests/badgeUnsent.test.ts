/**
 * Badge z liczba niewyslanych + fail-fast na listing innej skrzynki (Fala 14d).
 *
 * Problem (zgloszenie 2026-10-19, pkt 6): klawisz stopki pokazywal "(50)".
 * Przyczyna: mailbox.fetch akceptowal KAZDY naglowek listingu i KAZDY
 * komunikat pustej skrzynki bez sprawdzania skrzynki - przy desynchronizacji
 * listing odebranych (50 wpisow) ladowal sie jako "nieprzeczytane" i badge
 * liczyl 50. GMCP Mail.State daje tylko booleany, wiec licznik musi byc
 * z listingow - ale z listingow WLASCIWYCH skrzynek.
 *
 * Kontrakt:
 *  - store trzyma badgeUnsent (liczba wpisow niewyslanych z listingu);
 *  - etykieta zakladki Listy i stopki: "(u)" albo "(u/n)" (u=nieprzeczytane,
 *    n=niewyslane); podswietlenie stopki gdy cokolwiek > 0;
 *  - mailbox.fetch ODRZUCA naglowek/komunikat innej skrzynki (fail-fast
 *    zamiast cichego przyjecia cudzego listingu).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { MockTransport } from '../src/arkmail/core/session/transport';
import { MailboxSession } from '../src/arkmail/core/session/mailbox';
import { MailUiStore } from '../src/arkmail/ui/store';
import * as storeMod from '../src/arkmail/ui/store';
import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import { startHarness, stopHarness, loadTruncatedBox, click } from './harness';

const OPTS = { timeoutMs: 500 };

let seq = 0;
const entry = (subject: string): MailboxEntry => {
  seq += 1;
  return {
    number: seq,
    isRead: false,
    subject,
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
  };
};

const badgeUnsent = (s: MailUiStore): number =>
  (s.state as { badgeUnsent?: number }).badgeUnsent ?? -1;

/** formatBadgeSuffix przez rzutowanie: test pada, gdy helpera nie ma. */
const fmt = (u: number, n: number): string | undefined =>
  (storeMod as unknown as { formatBadgeSuffix?: (a: number, b: number) => string })
    .formatBadgeSuffix?.(u, n);

test('badge: niewyslane liczone do badgeUnsent, bez wplywu na badge', () => {
  const s = new MailUiStore();
  s.applyMailbox('niewyslane', {
    kind: 'lista',
    header: { box: 'niewyslane', truncated: false },
    entries: [entry('a'), entry('b')],
  });
  assert.equal(badgeUnsent(s), 2);
  assert.equal(s.state.badge, 0);
});

test('badge: pusta skrzynka niewyslanych zeruje badgeUnsent', () => {
  const s = new MailUiStore();
  s.applyMailbox('niewyslane', {
    kind: 'lista',
    header: { box: 'niewyslane', truncated: false },
    entries: [entry('a')],
  });
  assert.equal(badgeUnsent(s), 1);
  s.applyMailbox('niewyslane', { kind: 'pusta', box: 'niewyslane', reason: 'puste' });
  assert.equal(badgeUnsent(s), 0);
});

test('badge: formatBadgeSuffix - (u) albo (u/n), pusty gdy zero', () => {
  assert.equal(fmt(0, 0), '');
  assert.equal(fmt(2, 0), ' (2)');
  assert.equal(fmt(2, 3), ' (2/3)');
  assert.equal(fmt(0, 3), ' (0/3)');
});

test('render: zakladka Listy z licznikiem (u/n)', () => {
  const window = new Window();
  const container = window.document.createElement('div');
  const noop = () => {};
  const s = new MailUiStore();
  const off = mountMailUi(container as unknown as HTMLElement, s, {
    onOpenLetter: noop,
    onSendCompose: noop,
    onCloseLetter: noop,
    onRefreshBox: noop,
    onLoadOlder: noop,
    onLoadAll: noop,
    onSearch: noop,
    onClearSearch: noop,
    onDeleteLetter: noop,
    onForwardLetter: noop,
  } as unknown as MailUiHandlers);
  s.applyMailbox('nieprzeczytane', {
    kind: 'lista',
    header: { box: 'nieprzeczytane', truncated: false },
    entries: [entry('a'), entry('b')],
  });
  s.applyMailbox('niewyslane', {
    kind: 'lista',
    header: { box: 'niewyslane', truncated: false },
    entries: [entry('c'), entry('d'), entry('e')],
  });
  assert.equal(container.querySelector('[data-tab="listy"]')?.textContent, 'Listy (2/3)');
  off();
});

test('mailbox: naglowek INNEJ skrzynki odrzuca fetch (fail-fast)', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('nieprzeczytane');
  assert.deepEqual(t.sent, ['listy nieprzeczytane']);
  void t.replay([
    { text: 'Listy wyslane (prezentowane jest pierwsze 50):', cls: '' },
  ]);
  await assert.rejects(op, /wyslane podczas fetch nieprzeczytane/);
});

test('mailbox: pusta INNA skrzynka odrzuca fetch (fail-fast)', async () => {
  const t = new MockTransport();
  const s = new MailboxSession(t, OPTS);
  const op = s.fetch('wyslane');
  void t.replay([{ text: 'Nie masz zadnych nieprzeczytanych listow.', cls: '' }]);
  await assert.rejects(op, /nieprzeczytane podczas fetch wyslane/);
});

test('harness: stopka pokazuje (u/n) i podswietlenie dla niewyslanych', async () => {
  const h = await startHarness();
  try {
    await loadTruncatedBox(h);
    click(h, '[data-box="niewyslane"]');
    await h.waitFor(() => h.f.sent.includes('listy niewyslane'), 'komenda listy niewyslane');
    h.f.fire('Listy niewyslane:', 'mail');
    h.f.fire(' 2. Temat: pierwszy', 'mail');
    h.f.fire('Odbiorca: Baz                         Wt, 24 VIII 1999, 10:00:00', 'mail');
    h.f.fire(' 1. Temat: drugi', 'mail');
    h.f.fire('Odbiorcy: Corge, Garply                 Wt, 24 VIII 1999, 11:00:00', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji niewyslanych');
    await h.waitFor(
      () => h.f.footerUpdates.some((u) => u.label === 'ArkMail (0/2)'),
      'stopka ArkMail (0/2)',
    );
    assert.ok(
      h.f.footerStates.some((st) => st.highlighted === true),
      'podswietlenie stopki przy niewyslanych',
    );
  } finally {
    await stopHarness();
  }
});
