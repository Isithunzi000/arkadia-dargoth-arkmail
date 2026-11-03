/**
 * Fala UI-1 (zgloszenie 2026-11-03, sugestia 3 z Discorda): scrollowanie
 * skrzynki ma obejmowac TYLKO liste listow - przełacznik skrzynek,
 * operacje i szukajka zostaja na stale widoczne (kontrakt nowego
 * ukladu: naglowek poza kontenerem scrolla, klucz migawki scrolla na
 * kontenerze listy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const window = new Window();
const document = window.document;

function entry(n: number): MailboxEntry {
  return {
    number: n,
    isRead: true,
    subject: `Temat ${n}`,
    forwarded: false,
    party: 'Fred',
    partyKind: 'nadawca',
    date: null,
  };
}

function mount() {
  const container = document.createElement('div');
  const store = new MailUiStore();
  store.setActiveBox('odebrane');
  store.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(1), entry(2), entry(3)],
  });
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
  });
  return { container, store };
}

type El = {
  className?: string;
  textContent: string | null;
  children: El[];
  parentNode: El | null;
  getAttribute(n: string): string | null;
};

const isInside = (root: El, node: El): boolean => {
  for (let p = node.parentNode; p; p = p.parentNode) if (p === root) return true;
  return false;
};

test('scroll: przełacznik skrzynek i operacje POZA kontenerem scrolla', () => {
  const { container: c } = mount();
  const scroll = (c as { querySelector(s: string): unknown }).querySelector(
    '[data-pane-key="listy:odebrane"]',
  ) as unknown as El;
  assert.ok(scroll, 'kontener listy z kluczem migawki istnieje');
  assert.match(scroll.className ?? '', /arkmail-list-scroll/, 'kontener ma klase list-scroll');
  const q = (s: string) =>
    (c as { querySelector(s: string): unknown }).querySelector(s) as unknown as El | null;
  const boxes = q('.arkmail-boxes');
  const ops = q('.arkmail-box-ops');
  assert.ok(boxes, 'pigułki skrzynek istnieja');
  assert.ok(ops, 'operacje skrzynki istnieja');
  assert.ok(!isInside(scroll, boxes!), 'pigułki NIE wewnatrz scrolla');
  assert.ok(!isInside(scroll, ops!), 'operacje NIE wewnatrz scrolla');
  const searchRow = q('.arkmail-search-row');
  assert.ok(searchRow && !isInside(scroll, searchRow), 'szukajka NIE wewnatrz scrolla');
  const rows = q('.arkmail-entry');
  assert.ok(rows && isInside(scroll, rows), 'wiersze listow WEWNATRZ scrolla');
});

test('scroll: pozycja scrolla zachowana przy rerenderze (migawka na kontenerze)', () => {
  const { container: c, store } = mount();
  const q = (s: string) =>
    (c as { querySelector(s: string): unknown }).querySelector(s) as unknown as El | null;
  const scroll = q('[data-pane-key="listy:odebrane"]') as unknown as { scrollTop: number };
  scroll.scrollTop = 42;
  // Benigny rerender: flash nie zmienia struktury, musi odtworzyc scroll.
  store.setUnsentFlash(true);
  const po = q('[data-pane-key="listy:odebrane"]') as unknown as { scrollTop: number };
  assert.equal(po.scrollTop, 42, 'scrollTop nie skacze po rerenderze');
});
