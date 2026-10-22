/**
 * Czyszczenie pol filtrow razem z wynikami (Fala 16g).
 *
 * Zgloszenie 2026-10-19 pkt 11: "jak sie wyczysci filtr to pola
 * tekstowe filtrow tez powinny sie czyscic". Stan sprzed: banner
 * "Wyczysc" w trybie wynikow szukania zamykal wyniki, ale frazy
 * zostawaly w polach szukajki (searchDraft); archiwum nie mialo
 * zadnego czyszczenia filtrow.
 *
 * Kontrakt:
 *  - "Wyczysc" w bannerze wynikow kasuje pola szukajki (draft + DOM),
 *    poza zamknieciem trybu wynikow;
 *  - archiwum ma przycisk "Wyczysc filtry" zerujacy wszystkie pola
 *    filtra (tekstowe i skrzynke) i pokazujacy pelna liste.
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

const click = (el: unknown) =>
  (el as { dispatchEvent(e: unknown): void }).dispatchEvent(new window.Event('click'));

const setInput = (container: unknown, selector: string, v: string): void => {
  const el = (container as { querySelector(s: string): unknown }).querySelector(selector) as {
    value: string;
    dispatchEvent(e: unknown): void;
  } | null;
  assert.ok(el, `pole ${selector} istnieje`);
  el.value = v;
  el.dispatchEvent(new window.Event('input'));
};

const inputVal = (container: unknown, selector: string): string =>
  String(
    ((container as { querySelector(s: string): unknown }).querySelector(selector) as {
      value: string;
    } | null)?.value ?? '<brak>',
  );

const entry = (n: number): MailboxEntry => ({
  number: n,
  isRead: true,
  subject: `T${n}`,
  forwarded: false,
  party: 'Foo',
  partyKind: 'nadawca',
  date: null,
});

test('szukajka: Wyczysc w bannerze kasuje tez pola formularza', () => {
  const s = new MailUiStore({
    tab: 'listy',
    activeBox: 'odebrane',
    search: { box: 'odebrane', label: 'temat: "Perly"' },
    boxes: { odebrane: { entries: [entry(1)], truncated: false, empty: null } },
  });
  const { container, calls, off } = mount(s);
  setInput(container, '[data-search="osoba"]', 'Foo');
  setInput(container, '[data-search="temat"]', 'Perly');
  setInput(container, '[data-search="tresc"]', 'zloto');

  const clear = container.querySelector('.arkmail-search-clear');
  assert.ok(clear, 'przycisk Wyczysc istnieje');
  click(clear);

  assert.equal(calls.filter((c) => c.name === 'clear-search').length, 1, 'tryb wynikow zamkniety');
  assert.equal(inputVal(container, '[data-search="osoba"]'), '', 'pole osoby puste');
  assert.equal(inputVal(container, '[data-search="temat"]'), '', 'pole tematu puste');
  assert.equal(inputVal(container, '[data-search="tresc"]'), '', 'pole tresci puste (Fala 28a)');

  // Draft tez pusty - rerender nie przywraca fraz.
  s.setTab('kontakty');
  s.setTab('listy');
  assert.equal(inputVal(container, '[data-search="osoba"]'), '', 'draft osoby pusty po rerenderze');
  assert.equal(inputVal(container, '[data-search="temat"]'), '', 'draft tematu pusty po rerenderze');
  assert.equal(inputVal(container, '[data-search="tresc"]'), '', 'draft tresci pusty po rerenderze');
  off();
});

test('archiwum: Wyczysc filtry zeruje wszystkie pola i pokazuje pelna liste', () => {
  const letters: ArchiveLetter[] = [
    { id: 'a', box: 'odebrane', number: 1, party: 'Foo', subject: 'Perly', dateRaw: '', sortKey: '0000-00-00 00:00:00', read: true, body: ['x'] },
    { id: 'b', box: 'wyslane', number: 2, party: 'Garply', subject: 'Karteczka', dateRaw: '', sortKey: '0000-00-00 00:00:00', read: true, body: [] },
  ];
  const s = new MailUiStore({ tab: 'archiwum', archive: letters });
  const { container, off } = mount(s);

  const clear = container.querySelector('.arkmail-arch-clear');
  assert.ok(clear, 'przycisk Wyczysc filtry istnieje');
  assert.equal(clear?.textContent, 'Wyczysc filtry');

  setInput(container, '[data-filter="osoba"]', 'Foo');
  setInput(container, '[data-filter="temat"]', 'Perly');
  setInput(container, '[data-filter="tresc"]', 'x');
  const skr = container.querySelector('[data-filter="skrzynka"]') as unknown as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  skr.value = 'odebrane';
  skr.dispatchEvent(new window.Event('change'));
  assert.equal(
    (container.querySelectorAll('.arkmail-arch-entry') as unknown as unknown[]).length,
    1,
    'filtry zwezily liste',
  );

  click(clear);
  for (const f of ['osoba', 'temat', 'tresc', 'odDaty', 'doDaty', 'skrzynka']) {
    assert.equal(inputVal(container, `[data-filter="${f}"]`), '', `filtr ${f} pusty`);
  }
  assert.equal(
    (container.querySelectorAll('.arkmail-arch-entry') as unknown as unknown[]).length,
    2,
    'pelna lista po wyczyszczeniu',
  );

  // Filtr tez pusty po rerenderze (repaint nie przywraca wartosci).
  s.setTab('listy');
  s.setTab('archiwum');
  assert.equal(
    (container.querySelectorAll('.arkmail-arch-entry') as unknown as unknown[]).length,
    2,
    'pelna lista po rerenderze',
  );
  off();
});
