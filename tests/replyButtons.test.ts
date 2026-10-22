/**
 * Odpowiedz / Odpowiedz wszystkim z widoku listu (Fala 15a).
 *
 * Przyciski na poczatku paska operacji otwartego listu przenosza do
 * zakladki Napisz z wypelnionym adresem:
 *  - skrzynki odebrane/nieprzeczytane -> adresat = nadawca (Od);
 *  - skrzynki wyslane/niewyslane -> adresat = odbiorca (Do), a gdy list
 *    szedl tylko na DW (puste Do) -> adresat = DW;
 *  - "Odpowiedz wszystkim" doklada oryginalne DW do pola DW; brak DW
 *    -> dziala jak zwykle "Odpowiedz";
 *  - temat i tresc zostaja puste (uzupelnia gracz), zero cytowania;
 *  - Fala 28c: trzeci przycisk "Odpowiedz z cytowaniem" (spec na dole).
 *
 * To czysta operacja UI (prefill composeDraft + przelaczenie zakladki)
 * - nie wysyla zadnych komend do serwera i nie wymaga wpisu-zrodla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi, type MailUiHandlers } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { MailboxEntry } from '../src/arkmail/core/session/mailbox';
import type { MailBox } from '../src/arkmail/core/protocol/types';

const window = new Window();
const document = window.document;

function entry(over: Partial<MailboxEntry> = {}): MailboxEntry {
  return {
    number: 3,
    isRead: true,
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
    onLoadAll: rec('all'),
    onSearch: rec('search'),
    onClearSearch: rec('clear-search'),
    onDeleteLetter: rec('del'),
    onForwardLetter: rec('fwd'),
  } as unknown as MailUiHandlers);
  return { container, calls, off };
}

const clickEl = (el: unknown) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(
    new window.Event('click') as unknown as Event,
  );

function openLetter(
  s: MailUiStore,
  box: MailBox,
  letter: { from: string; to: string; cc: string | null },
): void {
  s.openLetter(
    box,
    {
      number: 3,
      from: letter.from,
      subject: 'Perly',
      to: letter.to,
      cc: letter.cc,
      date: null,
      body: ['czesc'],
    },
    entry(),
  );
}

const field = (container: unknown, name: string): string =>
  ((container as { querySelector(s: string): unknown }).querySelector(
    `[data-field="${name}"]`,
  ) as { value: string } | null)?.value ?? '(brak pola)';

test('ui: przyciski odpowiedzi pierwsze w pasku operacji listu', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetter(s, 'odebrane', { from: 'Foo', to: 'Gracz', cc: null });
  const ops = container.querySelector('.arkmail-letter-ops')!;
  const kids = Array.from(ops.children);
  assert.equal(
    (kids[0] as { textContent: string }).textContent,
    'Odpowiedz',
    'pierwszy przycisk to Odpowiedz',
  );
  assert.equal(
    (kids[1] as { textContent: string }).textContent,
    'Odpowiedz wszystkim',
    'drugi przycisk to Odpowiedz wszystkim',
  );
  // Fala 28c: trzeci przycisk to Odpowiedz z cytowaniem.
  assert.equal(
    (kids[2] as { textContent: string }).textContent,
    'Odpowiedz z cytowaniem',
    'trzeci przycisk to Odpowiedz z cytowaniem',
  );
  assert.ok(
    (kids[3] as { classList: { contains(c: string): boolean } }).classList.contains('arkmail-del'),
    'Usun dopiero po przyciskach odpowiedzi',
  );
  off();
});

test('ui: Odpowiedz z odebranych wypelnia nadawce i przelacza na Napisz', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetter(s, 'odebrane', { from: 'Foo', to: 'Gracz', cc: 'Qux' });
  clickEl(container.querySelector('.arkmail-reply')!);
  assert.equal(s.state.tab, 'napisz', 'przelaczono na zakladke Napisz');
  assert.equal(field(container, 'adresat'), 'Foo', 'adresat = nadawca');
  assert.equal(field(container, 'temat'), '', 'temat pusty');
  assert.equal(field(container, 'dw'), '', 'zwykle Odpowiedz nie wpisuje DW');
  assert.equal(field(container, 'tresc'), '', 'tresc pusta (zero cytowania)');
  off();
});

test('ui: Odpowiedz wszystkim doklada oryginalne DW', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetter(s, 'nieprzeczytane', { from: 'Foo', to: 'Gracz', cc: 'Qux' });
  clickEl(container.querySelector('.arkmail-reply-all')!);
  assert.equal(s.state.tab, 'napisz');
  assert.equal(field(container, 'adresat'), 'Foo', 'adresat = nadawca');
  assert.equal(field(container, 'dw'), 'Qux', 'DW = oryginalne DW');
  off();
});

test('ui: Odpowiedz wszystkim bez DW dziala jak zwykle Odpowiedz', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetter(s, 'odebrane', { from: 'Foo', to: 'Gracz', cc: null });
  clickEl(container.querySelector('.arkmail-reply-all')!);
  assert.equal(s.state.tab, 'napisz');
  assert.equal(field(container, 'adresat'), 'Foo');
  assert.equal(field(container, 'dw'), '', 'brak DW -> pole DW puste');
  off();
});

test('ui: Odpowiedz z wyslanych wypelnia odbiorce (puste Do -> DW)', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetter(s, 'wyslane', { from: 'Gracz', to: 'Foo', cc: 'Qux' });
  clickEl(container.querySelector('.arkmail-reply')!);
  assert.equal(field(container, 'adresat'), 'Foo', 'adresat = odbiorca');
  assert.equal(field(container, 'dw'), '', 'zwykle Odpowiedz nie wpisuje DW');
  s.setTab('list'); // powrot do listu (klik reply przelacza na Napisz)
  clickEl(container.querySelector('.arkmail-reply-all')!);
  assert.equal(field(container, 'adresat'), 'Foo');
  assert.equal(field(container, 'dw'), 'Qux', 'reply-all doklada DW');
  off();

  // List wyslany tylko na DW (puste Do): adresat = DW.
  const s2 = new MailUiStore();
  const { container: c2, off: off2 } = mount(s2);
  openLetter(s2, 'wyslane', { from: 'Gracz', to: '', cc: 'Qux' });
  clickEl(c2.querySelector('.arkmail-reply')!);
  assert.equal(field(c2, 'adresat'), 'Qux', 'puste Do -> adresat = DW');
  off2();
});

// --- Fala 28c: Odpowiedz z cytowaniem ---------------------------------------
// Spec (decyzja 2026-10-22): prefill adresata (jak zwykle Odpowiedz),
// temat = "Odp: <oryginalny temat>" DOSLOWNIE (temat "--" zostaje "--"),
// tresc = dwie puste linie, "---", oryginalna tresc, "---". Przy liscie
// bez tresci przycisk nieaktywny (nie ma czego cytowac).

function openLetterFull(
  s: MailUiStore,
  box: MailBox,
  letter: { from: string; to: string; cc: string | null; subject: string; body: string[] },
): void {
  s.openLetter(
    box,
    {
      number: 3,
      from: letter.from,
      subject: letter.subject,
      to: letter.to,
      cc: letter.cc,
      date: null,
      body: letter.body,
    },
    entry(),
  );
}

test('ui: Odpowiedz z cytowaniem wypelnia adresata, temat z Odp: i cytat w tresci', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetterFull(s, 'odebrane', {
    from: 'Foo',
    to: '',
    cc: null,
    subject: 'Perly',
    body: ['linia pierwsza', 'linia druga'],
  });
  const btn = container.querySelector('.arkmail-reply-quote') as
    | { textContent: string; dispatchEvent(e: unknown): void }
    | null;
  assert.ok(btn, 'przycisk cytowania istnieje');
  assert.equal(btn.textContent, 'Odpowiedz z cytowaniem');
  clickEl(btn);
  assert.equal(field(container, 'adresat'), 'Foo', 'adresat = nadawca');
  assert.equal(field(container, 'dw'), '', 'cytowanie nie wpisuje DW');
  assert.equal(field(container, 'temat'), 'Odp: Perly', 'temat z prefiksem Odp:');
  assert.equal(
    field(container, 'tresc'),
    '\n\n---\nlinia pierwsza\nlinia druga\n---',
    'dwie puste linie, ---, oryginal, ---',
  );
  off();
});

test('ui: Odpowiedz z cytowaniem przenosi temat "--" doslownie', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetterFull(s, 'odebrane', {
    from: 'Foo',
    to: '',
    cc: null,
    subject: '--',
    body: ['czesc'],
  });
  clickEl(container.querySelector('.arkmail-reply-quote'));
  assert.equal(field(container, 'temat'), 'Odp: --', 'zero czyszczenia tematu');
  off();
});

test('ui: Odpowiedz z cytowaniem z wyslanych bierze odbiorce jako adresata', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetterFull(s, 'wyslane', {
    from: 'Ja',
    to: 'Bar',
    cc: 'Baz',
    subject: 'Raport',
    body: ['tresc'],
  });
  clickEl(container.querySelector('.arkmail-reply-quote'));
  assert.equal(field(container, 'adresat'), 'Bar', 'adresat = Do z wyslanych');
  assert.equal(field(container, 'dw'), '', 'cytowanie nie wpisuje DW');
  assert.equal(field(container, 'temat'), 'Odp: Raport');
  off();
});

test('ui: Odpowiedz z cytowaniem nieaktywne przy liscie bez tresci', () => {
  const s = new MailUiStore();
  const { container, off } = mount(s);
  openLetterFull(s, 'odebrane', {
    from: 'Foo',
    to: '',
    cc: null,
    subject: 'Perly',
    body: [],
  });
  const btn = container.querySelector('.arkmail-reply-quote') as
    | { hasAttribute(n: string): boolean }
    | null;
  assert.ok(btn, 'przycisk istnieje');
  assert.ok(btn.hasAttribute('disabled'), 'bez tresci nie ma czego cytowac');
  off();
});

