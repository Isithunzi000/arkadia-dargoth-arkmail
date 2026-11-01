/**
 * Kropka nieprzeczytania tylko w skrzynkach przychodzacych (Fala 14c).
 *
 * Problem (zgloszenie 2026-10-19, log sesji 1.7.0, pkty 4 i 5): listingi
 * wyslanych i niewyslanych NIE maja znacznika *R* (serwer go tam nie
 * drukuje - parser.ts LISTING_ENTRY_RE traktuje brak *R* jako
 * isRead=false), wiec kazdy wiersz tych skrzynek dostawal niebieska
 * kropke "nieprzeczytany" - w skrzynce, w ktorej ten stan nie ma sensu
 * (to nasze wlasne listy).
 *
 * Kontrakt: klasa arkmail-unread TYLKO dla nieprzeczytanych wpisow w
 * skrzynkach 'odebrane' i 'nieprzeczytane'; w 'wyslane' i 'niewyslane'
 * kropka nigdy (niezaleznie od isRead).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { MailBox } from '../src/arkmail/core/protocol/types';
import { startHarness, stopHarness, loadTruncatedBox, click } from './harness';

const window = new Window();
const document = window.document;

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 3,
    isRead: false,
    subject: 'Perly',
    forwarded: false,
    party: 'Foo',
    partyKind: 'nadawca',
    date: null,
    ...over,
  };
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  const noop = () => {};
  const off = mountMailUi(container as unknown as HTMLElement, store, {
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
  return { container, off };
}

/** Jedna skrzynka z jednym NIEPRZECZYTANYM wpisem; zwraca klase wiersza. */
function rowClass(box: MailBox): string {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.setActiveBox(box);
  s.applyMailbox(box, {
    kind: 'lista',
    header: { box, truncated: false },
    entries: [entry()],
  });
  const row = container.querySelector('.arkmail-entry');
  const cls = String((row as { className?: string } | null)?.className ?? '');
  off();
  return cls;
}

test('kropka: odebrane - nieprzeczytany ma arkmail-unread', () => {
  assert.ok(rowClass('odebrane').includes('arkmail-unread'));
});

test('kropka: nieprzeczytane - nieprzeczytany ma arkmail-unread', () => {
  assert.ok(rowClass('nieprzeczytane').includes('arkmail-unread'));
});

test('kropka: wyslane - brak *R* NIE daje kropki', () => {
  assert.ok(!rowClass('wyslane').includes('arkmail-unread'));
});

test('kropka: niewyslane - brak *R* NIE daje kropki', () => {
  assert.ok(!rowClass('niewyslane').includes('arkmail-unread'));
});

test('harness: listing wyslanych bez *R* nie dostaje niebieskich kropek', async () => {
  const h = await startHarness();
  try {
    await loadTruncatedBox(h);
    click(h, '[data-box="wyslane"]');
    await h.waitFor(() => h.f.sent.includes('listy wyslane'), 'komenda listy wyslane');
    h.f.fire('Listy wyslane (prezentowane jest pierwsze 50):', 'mail');
    h.f.fire(' 2. Temat: do Baza', 'mail');
    h.f.fire('Odbiorca: Baz                         Wt, 24 VIII 1999, 10:00:00', 'mail');
    h.f.fire(' 1. Temat: do Corge', 'mail');
    h.f.fire('Odbiorca: Corge                      Wt, 24 VIII 1999, 11:00:00', 'mail');
    h.f.fire('> ', 'prompt');
    await h.waitFor(() => !h.content.querySelector('.arkmail-busy'), 'koniec sesji wyslanych');
    await h.waitFor(
      () => h.content.querySelectorAll('.arkmail-entry').length === 2,
      'dwa wiersze wyslanych',
    );
    const rows = h.content.querySelectorAll('.arkmail-entry') as { className: string }[];
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.ok(!r.className.includes('arkmail-unread'), 'brak kropki w wyslanych');
    }
  } finally {
    await stopHarness();
  }
});
