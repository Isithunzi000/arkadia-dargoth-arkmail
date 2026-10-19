/**
 * Wyroznienie nieprzeczytanych + trwaly akcent skrzynek (Fala 16f).
 *
 * Zgloszenia 2026-10-19:
 *  - pkt 8: "nowe wiadomosci nie widze ktore przeczytane a ktore nie" -
 *    nieprzeczytany wiersz ma miec niebieska kropke, pogrubienie I
 *    jasniejsze tlo; po odczyciu (odswiezenie daje *R*) wiersz wraca
 *    do normalnego;
 *  - pkt 5: "jakos zaznaczone ze cos jest w niewyslanych... kolorowa
 *    obwodka" - skrzynki Nieprzeczytane/Niewyslane z licznikiem > 0
 *    maja trwala obwodke w kolorze akcentu (#4a7de0).
 *
 * Kropka i pogrubienie istnieja od Fali 14c (tylko skrzynki
 * przychodzace - wyslane/niewyslane nie maja znacznika *R*).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { STYLES } from '../src/arkmail/ui/styles';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';

const window = new Window();
const document = window.document;

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

const entry = (n: number, isRead: boolean, subject: string): MailboxEntry => ({
  number: n,
  isRead,
  subject,
  forwarded: false,
  party: 'Foo',
  partyKind: 'nadawca',
  date: null,
});

const classes = (el: unknown): string =>
  String((el as { className?: string } | null)?.className ?? '');

test('ui: nieprzeczytany wiersz ma klase unread, przeczytany nie', () => {
  const s = new MailUiStore({
    tab: 'listy',
    activeBox: 'odebrane',
    boxes: {
      odebrane: {
        entries: [entry(1, false, 'Swiezy'), entry(2, true, 'Stary')],
        truncated: false,
        empty: null,
      },
    },
  });
  const { container, off } = mount(s);
  const rows = container.querySelectorAll('.arkmail-entry') as unknown as unknown[];
  // Wyswietlanie od najnowszego: pierwszy wiersz = entry(2) przeczytany.
  assert.ok(!classes(rows[0]).includes('arkmail-unread'), 'przeczytany bez klasy');
  assert.ok(classes(rows[1]).includes('arkmail-unread'), 'nieprzeczytany z klasa');
  off();
});

test('ui: regresja 14c - w skrzynce wyslanych brak znacznika unread', () => {
  const s = new MailUiStore({
    tab: 'listy',
    activeBox: 'wyslane',
    boxes: {
      wyslane: { entries: [entry(1, false, 'Wyslany')], truncated: false, empty: null },
    },
  });
  const { container, off } = mount(s);
  const row = container.querySelector('.arkmail-entry');
  assert.ok(!classes(row).includes('arkmail-unread'), 'wyslane bez klasy unread');
  off();
});

test('ui: skrzynki z licznikiem > 0 maja trwaly akcent (obwodka)', () => {
  const s = new MailUiStore({ badge: 2, badgeUnsent: 1 });
  const { container, off } = mount(s);
  assert.ok(
    classes(container.querySelector('[data-box="nieprzeczytane"]')).includes(
      'arkmail-box-attention',
    ),
    'nieprzeczytane z obwodka',
  );
  assert.ok(
    classes(container.querySelector('[data-box="niewyslane"]')).includes(
      'arkmail-box-attention',
    ),
    'niewyslane z obwodka',
  );
  assert.ok(
    !classes(container.querySelector('[data-box="odebrane"]')).includes(
      'arkmail-box-attention',
    ),
    'odebrane bez obwodki',
  );
  off();

  const s0 = new MailUiStore({ badge: 0, badgeUnsent: 0 });
  const m0 = mount(s0);
  assert.ok(
    !classes(m0.container.querySelector('[data-box="nieprzeczytane"]')).includes(
      'arkmail-box-attention',
    ),
    'zero nieprzeczytanych = bez obwodki',
  );
  assert.ok(
    !classes(m0.container.querySelector('[data-box="niewyslane"]')).includes(
      'arkmail-box-attention',
    ),
    'zero niewyslanych = bez obwodki',
  );
  m0.off();
});

test('style: nieprzeczytany wiersz ma jasniejsze tlo (hex)', () => {
  const m = STYLES.match(/\.arkmail-unread\s*\{([^}]*)\}/);
  assert.ok(m, 'regula .arkmail-unread istnieje');
  assert.match(m[1], /background:\s*#[0-9a-fA-F]{3,8}\b/, 'jawne jasniejsze tlo wiersza');
});

test('style: akcent skrzynki to obwodka w kolorze #4a7de0', () => {
  const m = STYLES.match(/\.arkmail-box-attention\s*\{([^}]*)\}/);
  assert.ok(m, 'regula .arkmail-box-attention istnieje');
  assert.match(m[1], /border-color:\s*#4a7de0\b/, 'obwodka ACCENT');
});
