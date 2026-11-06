/**
 * Zgloszenie 2026-11-05 (Etap 10): klikalne wiersze dzialaja tez z
 * klawiatury (role=button, tabindex, Enter/Spacja), a fokus checkboxa
 * przetrwa pełny repaint (wartosc checked wraca razem z fokusem).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import { fromMailboxEntry, type ArchiveLetter } from '../src/arkmail/core/archive';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { MailBox } from '../src/arkmail/core/protocol/types';

const window = new Window();
const document = window.document;

interface Calls {
  opened: Array<[string, number]>;
  archiveOpened: number;
}

function mount(store: MailUiStore): { container: HTMLElement; calls: Calls } {
  const container = document.createElement('div');
  const calls: Calls = { opened: [], archiveOpened: 0 };
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: (box: MailBox, entry: MailboxEntry) => {
      calls.opened.push([box, entry.number]);
    },
    onOpenArchiveLetter: () => {
      calls.archiveOpened += 1;
    },
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: () => {},
    onClearSearch: () => {},
    onDeleteLetter: () => {},
  } as never);
  return { container: container as unknown as HTMLElement, calls };
}

const q = (root: unknown, selector: string): unknown =>
  (root as { querySelector(s: string): unknown }).querySelector(selector);
const qa = (root: unknown, selector: string): unknown[] =>
  Array.from((root as { querySelectorAll(s: string): unknown[] }).querySelectorAll(selector));
const click = (el: unknown): void => (el as { click(): void }).click();

const entry = (number: number): MailboxEntry => ({
  number,
  isRead: true,
  subject: `Temat ${number}`,
  forwarded: false,
  party: 'Fred',
  partyKind: 'nadawca',
  date: null,
});

function withBox(store: MailUiStore): MailUiStore {
  store.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(1), entry(2)],
  });
  return store;
}

const press = (el: unknown, key: string): void => {
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true }) as unknown as Event,
  );
};

test('klawiatura: wiersze listy otwieraja list Enterem i Spacja', () => {
  const store = withBox(new MailUiStore({ tab: 'listy' }));
  const { container, calls } = mount(store);

  const rows = qa(container, '.arkmail-entry');
  assert.equal(rows.length, 2, 'dwa wiersze listy');
  for (const row of rows) {
    assert.equal((row as { getAttribute(n: string): string | null }).getAttribute('role'), 'button', 'wiersz ma role button');
    assert.equal((row as { getAttribute(n: string): string | null }).getAttribute('tabindex'), '0', 'wiersz ma tabindex 0');
  }
  // Kolejnosc wierszy zalezy od sortowania listingu - wybieramy po data-number.
  const byNum = (n: number): unknown =>
    rows.find((r) => (r as { getAttribute(a: string): string | null }).getAttribute('data-number') === String(n));
  const row1 = byNum(1);
  const row2 = byNum(2);
  assert.ok(row1 && row2, 'oba wiersze po data-number');
  press(row1, 'Enter');
  assert.deepEqual(calls.opened, [['odebrane', 1]], 'Enter otwiera list 1');
  press(row2, ' ');
  assert.deepEqual(calls.opened, [['odebrane', 1], ['odebrane', 2]], 'Spacja otwiera list 2');
});

test('klawiatura: imie kontaktu w panelu Osoby przechodzi do archiwum Enterem', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  store.setContacts([
    { name: 'Fred', sources: ['korespondencja'], lettersReceived: 2, lettersSent: 0 },
  ]);
  const { container } = mount(store);
  // Panel osob domyslnie zwiniety - rozwijamy sub-pigulka.
  let pill: unknown = null;
  for (const p of qa(container, '.arkmail-subpill')) {
    if ((p as { textContent?: string }).textContent === 'Osoby z listow') pill = p;
  }
  assert.ok(pill, 'sub-pigulka Osoby z listow istnieje');
  click(pill);

  const name = q(container, '.arkmail-contact-name');
  assert.ok(name, 'imie kontaktu istnieje');
  assert.equal((name as { getAttribute(n: string): string | null }).getAttribute('role'), 'button', 'imie ma role button');
  assert.equal((name as { getAttribute(n: string): string | null }).getAttribute('tabindex'), '0', 'imie ma tabindex 0');
  press(name, 'Enter');
  assert.ok(q(container, '.arkmail-arch-list'), 'po Enterze widok przechodzi do listy listow archiwum');
});

test('klawiatura: wiersze archiwum otwieraja list Enterem', () => {
  const store = new MailUiStore({ tab: 'archiwum' });
  const letter: ArchiveLetter = {
    ...fromMailboxEntry('odebrane', entry(1)),
    body: ['Tresc'],
  };
  store.setArchive([letter]);
  const { container, calls } = mount(store);

  const rows = qa(container, '.arkmail-arch-entry');
  assert.equal(rows.length, 1, 'jeden wiersz archiwum');
  assert.equal((rows[0] as { getAttribute(n: string): string | null }).getAttribute('role'), 'button', 'wiersz archiwum ma role button');
  assert.equal((rows[0] as { getAttribute(n: string): string | null }).getAttribute('tabindex'), '0', 'wiersz archiwum ma tabindex 0');
  press(rows[0], 'Enter');
  assert.equal(calls.archiveOpened, 1, 'Enter otwiera list z archiwum');
});

test('klawiatura: fokus checkboxa wraca po repaint z zachowanym zaznaczeniem', async () => {
  const store = new MailUiStore({ tab: 'kontakty' });
  store.setPeople(['Fred', 'Grault']);
  const { container } = mount(store);
  // happy-dom ustawia activeElement tylko dla drzewa podpiętego do dokumentu.
  (document.body as unknown as { appendChild(n: unknown): void }).appendChild(container);
  // Sub-pigulka Ksiazka adresowa.
  for (const p of qa(container, '.arkmail-subpill')) {
    if ((p as { textContent?: string }).textContent === 'Ksiazka adresowa') click(p);
  }

  const check = q(container, '[data-book-check="Fred"]') as unknown as {
    focus(): void;
    checked: boolean;
    dispatchEvent(e: unknown): void;
  };
  assert.ok(check, 'checkbox Freda istnieje');
  check.focus();
  check.checked = true;
  check.dispatchEvent(new window.Event('change') as unknown as Event);
  // Repaint zaszedl synchronicznie w handlerze change (store.refresh).
  const active = document.activeElement as unknown as {
    getAttribute(n: string): string | null;
    checked: boolean;
  } | null;
  assert.equal(
    active?.getAttribute('data-book-check'),
    'Fred',
    'po repaint fokus wraca na checkbox Freda',
  );
  assert.equal(active?.checked, true, 'zaznaczenie checkboxa przetrwało repaint');
});
