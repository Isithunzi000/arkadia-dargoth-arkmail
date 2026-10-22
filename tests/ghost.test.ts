/**
 * Ghost-podpowiedzi (Fala 9g): wyszarzona podpowiedz za kursorem,
 * strzalka w prawo wpisuje calosc (wzorzec z klienta Dargoth,
 * src/web/commandInput - jeden wariant, bez przelacznikow).
 *
 * Zrodla: pola osobowe -> kontakty (najswiezsze kontakty najpierw)
 * i aliasy; pola tematu -> znane tematy z archiwum (najnowsze najpierw).
 * Dopasowanie prefiksowe bez wielkosci liter; akceptacja wstawia
 * kanoniczna forme kandydata.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';
import type { ArchiveLetter } from '../src/arkmail/core/archive';

const window = new Window();
const document = window.document;

const contact = (name: string, lastContactKey?: number, mailAlias?: string): Contact => ({
  name,
  sources: ['korespondencja'],
  lettersReceived: 1,
  lettersSent: 0,
  ...(lastContactKey !== undefined ? { lastContactKey } : {}),
  ...(mailAlias ? { mailAlias } : {}),
});

const arch = (subject: string, sortKey: string): ArchiveLetter => ({
  id: `a-${sortKey}`,
  box: 'odebrane',
  number: 1,
  party: 'Foo',
  subject,
  dateRaw: null,
  sortKey,
  read: true,
  body: [],
});

function mount(store: MailUiStore, overrides?: { onSearch?: (box: unknown, q: unknown) => void }) {
  const container = document.createElement('div');
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {},
    onSendCompose: () => {},
    onCloseLetter: () => {},
    onRefreshBox: () => {},
    onLoadOlder: () => {},
    onLoadAll: () => {},
    onSearch: overrides?.onSearch ?? (() => {}),
    onClearSearch: () => {},
    onDeleteLetter: () => {},
    onForwardLetter: () => {},
  });
  return container;
}

const input = (container: unknown, selector: string): HTMLInputElement =>
  (container as { querySelector(s: string): unknown }).querySelector(selector) as HTMLInputElement;

const type = (el: HTMLInputElement, value: string): void => {
  el.value = value;
  el.selectionStart = value.length;
  el.selectionEnd = value.length;
  el.dispatchEvent(new window.Event('input') as unknown as Event);
};

const key = (el: HTMLInputElement, k: string): void => {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, cancelable: true }) as unknown as Event);
};

const ghostRest = (container: unknown, sel: string): string => {
  const wrap = input(container, sel).closest('.arkmail-ghost-wrap');
  const rest = wrap?.querySelector('.arkmail-ghost-rest') as { textContent?: string } | null;
  const ghost = wrap?.querySelector('.arkmail-ghost') as { style?: { display: string } } | null;
  if (!ghost || ghost.style?.display === 'none') return '';
  return rest?.textContent ?? '';
};

test('ghost: pole adresata podpowiada kontakt, strzalka w prawo wpisuje kanonicznie', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Bar', 100), contact('Corge', 200), contact('Grault', 50)]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'cor');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), 'ge');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'Corge');
  // Po akceptacji ducha nie ma (pelne trafienie).
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '');
});

test('ghost: najswiezszy kontakt wygrywa; alias tez podpowiada', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Bar', 300, 'poltorak'), contact('Baz', 100)]);
  const c = mount(s);
  // 'b' -> Bar (swiezsza), nie Baz.
  type(input(c, '[data-field="adresat"]'), 'b');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), 'ar');
  // alias jako kandydat
  type(input(c, '[data-field="dw"]'), 'pol');
  assert.equal(ghostRest(c, '[data-field="dw"]'), 'torak');
  key(input(c, '[data-field="dw"]'), 'ArrowRight');
  assert.equal(input(c, '[data-field="dw"]').value, 'poltorak');
});

test('ghost: brak kandydata i pelne trafienie = brak ducha; blur chowa', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Bar', 100)]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  type(el, 'zzz');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '');
  type(el, 'Bar');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '');
  type(el, 'Ba');
  assert.equal(ghostRest(c, '[data-field="adresat"]'), 'r');
  el.dispatchEvent(new window.Event('blur') as unknown as Event);
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '');
});

test('ghost: kursor nie na koncu = brak podpowiedzi', () => {
  const s = new MailUiStore({ tab: 'napisz' });
  s.setContacts([contact('Bar', 100)]);
  const c = mount(s);
  const el = input(c, '[data-field="adresat"]');
  el.value = 'Ba';
  el.selectionStart = 0;
  el.selectionEnd = 0;
  el.dispatchEvent(new window.Event('input') as unknown as Event);
  assert.equal(ghostRest(c, '[data-field="adresat"]'), '');
});

test('ghost: pole tematu szukajki podpowiada tematy z archiwum', () => {
  const s = new MailUiStore();
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      { number: 1, isRead: true, subject: 'X', forwarded: false, party: 'A', partyKind: 'nadawca', date: null },
    ],
  });
  s.setArchive([
    arch('Perly z morza', '2026-05-01 00:00:00'),
    arch('perly', '2026-04-01 00:00:00'),
    arch('Inny temat', '2026-03-01 00:00:00'),
  ]);
  const c = mount(s);
  const el = input(c, '[data-search="temat"]');
  type(el, 'per');
  // Najnowszy pasujacy temat wygrywa; suffix dokleja sie do wpisanego.
  assert.equal(ghostRest(c, '[data-search="temat"]'), 'ly z morza');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'Perly z morza');
});

test('ghost: akceptacja strzalka synchronizuje draft szukajki (Fala 26a)', () => {
  // Zgloszenie 2026-10-22: wpisane 'cor' + strzalka w prawo wpisywala
  // kanoniczne 'Corge' do POLA, ale bez dispatchu 'input' draft zostawal
  // przy prefiksie - pierwszy rerender przywracal 'cor' do pola, a
  // banner wynikow mowil 'Corge'.
  const s = new MailUiStore();
  s.setContacts([contact('Corge', 200)]);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      { number: 1, isRead: true, subject: 'X', forwarded: false, party: 'A', partyKind: 'nadawca', date: null },
    ],
  });
  const c = mount(s);
  const el = input(c, '[data-search="osoba"]');
  type(el, 'cor');
  assert.equal(ghostRest(c, '[data-search="osoba"]'), 'ge');
  key(el, 'ArrowRight');
  assert.equal(el.value, 'Corge', 'akceptacja wpisuje kanoniczna forme');
  // Dowolna zmiana store = pelny rerender (draft odtwarza pola).
  s.setNotifyEnabled(!s.state.notifyEnabled);
  const el2 = input(c, '[data-search="osoba"]');
  assert.equal(el2.value, 'Corge', 'po rerenderze pole zachowuje zaakceptowana fraze');
});

test('szukajka: Enter w polu osoby = Szukaj (Fala 26a)', () => {
  // Zgloszenie 2026-10-22: Enter w polu szukajki nie mial zadnego
  // handlera ("klikam enter i nic"). Enter = klik Szukaj na dowolnym
  // polu; puste zapytanie nie strzela (jak przycisk).
  const searches: unknown[] = [];
  const s = new MailUiStore();
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      { number: 1, isRead: true, subject: 'X', forwarded: false, party: 'A', partyKind: 'nadawca', date: null },
    ],
  });
  const c = mount(s, { onSearch: (box, q) => searches.push([box, q]) });
  // Enter na pustych polach nie strzela (strażnik jak w Szukaj).
  key(input(c, '[data-search="osoba"]'), 'Enter');
  assert.deepEqual(searches, [], 'puste zapytanie nie strzela');
  // Enter z wpisana osoba odpala to samo szukanie co przycisk.
  type(input(c, '[data-search="osoba"]'), 'cor');
  key(input(c, '[data-search="osoba"]'), 'Enter');
  assert.deepEqual(searches, [['odebrane', { osoba: 'cor' }]], 'Enter = Szukaj');
  // Enter dziala tez z pola tematu.
  type(input(c, '[data-search="temat"]'), 'paczka');
  key(input(c, '[data-search="temat"]'), 'Enter');
  assert.deepEqual(searches[1], ['odebrane', { osoba: 'cor', temat: 'paczka' }], 'Enter z pola tematu');
});

test('ghost: pole osoby w szukajce i Przekaz w widoku listu', () => {
  const s = new MailUiStore();
  s.setContacts([contact('Corge', 200)]);
  s.applyMailbox('odebrane', {
    kind: 'lista',
    header: { box: 'odebrane', truncated: false },
    entries: [
      { number: 1, isRead: true, subject: 'X', forwarded: false, party: 'A', partyKind: 'nadawca', date: null },
    ],
  });
  const c = mount(s);
  type(input(c, '[data-search="osoba"]'), 'cor');
  assert.equal(ghostRest(c, '[data-search="osoba"]'), 'ge');

  const s2 = new MailUiStore({ tab: 'list' });
  s2.setContacts([contact('Corge', 200)]);
  s2.openLetter('odebrane', {
    number: 1, from: 'A', subject: 'X', to: 'B', cc: null, date: null, body: ['t'],
  });
  const c2 = mount(s2);
  type(input(c2, '[data-field="forward"]'), 'cor');
  assert.equal(ghostRest(c2, '[data-field="forward"]'), 'ge');
});
