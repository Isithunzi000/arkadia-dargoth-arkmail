/**
 * Render UI ArkMail (cienka powloka DOM nad MailUiStore).
 * Testy na happy-dom: zakladki, pasek operacji, listy, klik w list,
 * formularz compose, badge w etykiecie zakladki, tryb wide,
 * lokalny filtr archiwum (bez utraty fokusu - filtr poza store).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

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

function arch(over: Partial<ArchiveLetter> = {}): ArchiveLetter {
  return {
    id: 'a1',
    box: 'odebrane',
    number: 3,
    party: 'Foo',
    subject: 'Perly',
    dateRaw: null,
    sortKey: '2025-12-23 00:11:12',
    read: true,
    body: [],
    ...over,
  };
}

function mount(store: MailUiStore, handlers: Partial<MailUiHandlers> = {}) {
  const container = document.createElement('div');
  const calls: { name: string; args: unknown[] }[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push({ name, args });
  const off = mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: rec('open'),
    onSendCompose: rec('send'),
    onCloseLetter: rec('close'),
    onRefreshBox: rec('refresh'),
    onLoadOlder: rec('older'),
    ...handlers,
  });
  return { container, calls, off };
}

const click = (el: unknown) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(new window.Event('click'));

test('render: piec zakladek z polskimi etykietami', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const tabs = [...container.querySelectorAll('.arkmail-tab')];
  assert.deepEqual(
    tabs.map((t) => t.getAttribute('data-tab')),
    ['listy', 'list', 'napisz', 'kontakty', 'archiwum'],
  );
  assert.deepEqual(
    tabs.map((t) => t.textContent),
    ['Listy', 'List', 'Napisz list', 'Kontakty', 'Archiwum'],
  );
  assert.equal(container.querySelector('.arkmail-tab-active')?.getAttribute('data-tab'), 'listy');
  off();
});

test('render: klik zakladki zmienia stan, aktywna ma klase', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  const napisz = container.querySelector('[data-tab="napisz"]')!;
  click(napisz);
  assert.equal(s.state.tab, 'napisz');
  assert.equal(container.querySelector('.arkmail-tab-active')?.getAttribute('data-tab'), 'napisz');
  off();
});

test('render: pasek operacji tylko gdy busy', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  assert.equal(container.querySelector('.arkmail-busy'), null);
  s.setBusy('Czytam list 3...');
  assert.ok(container.querySelector('.arkmail-busy')?.textContent?.includes('Czytam list 3'));
  s.setBusy(null);
  assert.equal(container.querySelector('.arkmail-busy'), null);
  off();
});

test('render: lista listow, nieprzeczytany wyrozniony, klik otwiera', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [entry(), entry({ number: 2, isRead: true, subject: 'Stary' })],
  });
  const rows = container.querySelectorAll('.arkmail-entry');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].classList.contains('arkmail-unread'));
  assert.ok(!rows[1].classList.contains('arkmail-unread'));
  assert.ok(rows[0].textContent?.includes('Perly'));
  assert.ok(rows[0].textContent?.includes('Foo'));
  click(rows[0]);
  assert.deepEqual(calls, [{ name: 'open', args: ['odebrane', 3] }]);
  off();
});

test('render: badge w etykiecie zakladki Listy', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  s.applyMailbox('nieprzeczytane', {
    kind: 'lista',
    header: { box: 'nieprzeczytane', truncated: false },
    entries: [entry(), entry({ number: 2 })],
  });
  assert.equal(container.querySelector('[data-tab="listy"]')?.textContent, 'Listy (2)');
  off();
});

test('render: formularz compose zbiera pola i linie tresci', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  const { container, calls, off } = mount(s);
  (container.querySelector('[data-field="adresat"]') as unknown as HTMLInputElement).value = 'Garply';
  (container.querySelector('[data-field="temat"]') as unknown as HTMLInputElement).value = 'Perly';
  (container.querySelector('[data-field="dw"]') as unknown as HTMLInputElement).value = 'Foo';
  (container.querySelector('[data-field="tresc"]') as unknown as HTMLTextAreaElement).value = 'linia1\nlinia2';
  click(container.querySelector('.arkmail-send')!);
  assert.deepEqual(calls, [
    { name: 'send', args: [{ adresat: 'Garply', temat: 'Perly', dw: 'Foo', linie: ['linia1', 'linia2'] }] },
  ]);
  off();
});

test('render: wide ustawia klase podzialu na roocie', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  assert.ok(!container.querySelector('.arkmail-root')!.classList.contains('arkmail-wide'));
  s.setWide(true);
  assert.ok(container.querySelector('.arkmail-root')!.classList.contains('arkmail-wide'));
  off();
});

test('render: filtr archiwum po temacie - lokalny, bez store', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setArchive([arch(), arch({ id: 'b2', subject: 'Rachunek', number: 4 })]);
  const { container, off } = mount(s);
  assert.equal(container.querySelectorAll('.arkmail-arch-entry').length, 2);
  const input = container.querySelector('[data-filter="temat"]') as unknown as HTMLInputElement;
  input.value = 'rach';
  input.dispatchEvent(new window.Event('input') as unknown as Event);
  const rows = container.querySelectorAll('.arkmail-arch-entry');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].textContent?.includes('Rachunek'));
  assert.equal(input.value, 'rach', 'input nie jest nadpisywany przy filtrze');
  off();
});

test('render: przycisk Wczytaj starsze gdy listing uciety', () => {
  const s = new MailUiStore();
  const { container, calls, off } = mount(s);
  s.applyMailbox('wyslane', {
    kind: 'lista',
    header: { box: 'wyslane', truncated: true },
    entries: [entry()],
  });
  s.setActiveBox('wyslane');
  const btn = container.querySelector('.arkmail-older');
  assert.ok(btn, 'przycisk widoczny przy truncated');
  click(btn!);
  assert.deepEqual(calls, [{ name: 'older', args: ['wyslane'] }]);
  off();
});
