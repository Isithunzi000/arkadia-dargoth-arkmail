/**
 * Fala UI-2 krok 4: indeks osob zebranych z listow w zakladce Archiwum
 * ("Osoby z listow"). Wydanie 1.30.1 (zgloszenie 6): osoby i listy to
 * osobne widoki przełaczane chipsami (jak sub-pigulki Kontaktow) -
 * domyslnie "Archiwum listow", panel osob pod chipem "Osoby z listow".
 * Panel: filtr + sort, wiersz osoby z licznikami, przyciskami kierunku
 * (skok do archiwum) i przyciskiem "Do ksiazki" (dopisanie przez
 * onSavePeople). Skok z osoby wraca na chips listy (filtr osoby stoi na
 * liscie) i przewija widok do listy listow (zgloszenie 2026-11-05, A2).
 * Lista osob scrolluje sie wlasnym kontenerem (max-height + overflow).
 * Imiona syntetyczne (Foo/Bar/Corge - dozwolone przez guardy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { Contact } from '../src/arkmail/core/contacts';

const window = new Window();
const document = window.document;

interface Calls {
  saves: string[][];
}

function mount(store: MailUiStore) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const calls: Calls = { saves: [] };
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
    onSavePeople: (people) => {
      calls.saves.push([...people]);
      store.setPeople(people);
    },
  });
  return { container, calls };
}

const q = (container: unknown, selector: string): unknown =>
  (container as { querySelector(s: string): unknown }).querySelector(selector);

const qa = (container: unknown, selector: string): unknown[] =>
  Array.from(
    (container as { querySelectorAll(s: string): Iterable<unknown> }).querySelectorAll(selector),
  );

const text = (el: unknown): string => (el as { textContent?: string })?.textContent ?? '';

const click = (el: unknown): void => (el as { click(): void }).click();

const contact = (over: Partial<Contact>): Contact => ({
  name: 'Corge',
  sources: ['korespondencja'],
  lettersReceived: 2,
  lettersSent: 1,
  ...over,
});

const panel = (container: unknown): unknown => q(container, '[data-arch-people]');
// Wydanie 1.30.1 (zgloszenie 6): panel osob mieszka pod chipem.
const clickChip = (container: unknown, label: string): void => {
  for (const pill of qa(container, '.arkmail-subpill')) {
    if (text(pill) === label) {
      click(pill);
      return;
    }
  }
  throw new Error(`brak chipsu: ${label}`);
};

// --- panel ------------------------------------------------------------------

test('archiwum: panel Osoby z listow pod chipem, chips przełącza widok', () => {
  // Wydanie 1.30.1 (zgloszenie 6): osoby i listy jako osobne widoki
  // (chipsy jak w Kontaktach) - domyslnie "Archiwum listow"; chips
  // "Osoby z listow" pokazuje panel. Lista osob ma wlasny kontener
  // scrolla (zgloszenie 2026-11-05, A1).
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({}), contact({ name: 'Foo', lettersReceived: 1, lettersSent: 0 })]);
  const { container } = mount(s);
  assert.equal(panel(container), null, 'domyslnie widok listow - bez panelu');
  assert.ok(q(container, '.arkmail-arch-list'), 'lista listow od razu na widoku');
  clickChip(container, 'Osoby z listow');
  assert.ok(panel(container), 'panel istnieje po kliku w chips');
  const names = qa(container, '[data-arch-people] .arkmail-contact-name').map(text);
  assert.deepEqual(names, ['Corge', 'Foo'], 'osoby z listami po przełączeniu');
  assert.ok(
    q(container, '.arkmail-arch-people-list'),
    'lista osob z wlasna klasa kontenera scrolla',
  );
});

test('archiwum: chips Osoby z listow przełącza w obie strony', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const { container } = mount(s);
  assert.equal(qa(container, '[data-arch-people] .arkmail-contact').length, 0, 'widok listow');
  clickChip(container, 'Osoby z listow');
  assert.equal(qa(container, '[data-arch-people] .arkmail-contact').length, 1, 'widok osob');
  assert.equal(q(container, '.arkmail-arch-list'), null, 'lista listow nie malowana');
  clickChip(container, 'Archiwum listow');
  assert.equal(qa(container, '[data-arch-people] .arkmail-contact').length, 0, 'z powrotem listy');
  assert.ok(q(container, '.arkmail-arch-list'), 'lista listow z powrotem na widoku');
});

test('archiwum: filtr panelu dziala na liscie osob', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({}), contact({ name: 'Foo', lettersReceived: 1, lettersSent: 0 })]);
  const { container } = mount(s);
  clickChip(container, 'Osoby z listow');
  const input = q(container, '[data-arch-people] [data-filter="kontakty"]') as {
    value: string;
    dispatchEvent(e: unknown): void;
  };
  input.value = 'foo';
  input.dispatchEvent(new window.Event('input') as unknown as Event);
  const names = qa(container, '[data-arch-people] .arkmail-contact-name').map(text);
  assert.deepEqual(names, ['Foo'], 'tylko pasujaca osoba');
});

// --- Do ksiazki --------------------------------------------------------------

test('archiwum: Do ksiazki dopisuje osobe przez onSavePeople', () => {
  const s = new MailUiStore({ tab: 'archiwum', people: ['Fred'] });
  s.setContacts([contact({})]);
  const { container, calls } = mount(s);
  clickChip(container, 'Osoby z listow');
  const btn = q(container, '[data-arch-add-book]');
  assert.ok(btn, 'przycisk Do ksiazki w wierszu');
  assert.equal(
    (btn as { getAttribute(n: string): string | null }).getAttribute('title'),
    'Dopisuje Corge do ksiazki adresowej.',
    'tooltip aktywnego przycisku',
  );
  click(btn);
  assert.deepEqual(calls.saves, [['Fred', 'Corge']], 'dopisanie na koniec ksiazki');
});

test('archiwum: Do ksiazki wylaczone, gdy osoba juz w ksiazce (bez wzgledu na wielkosc liter)', () => {
  const s = new MailUiStore({ tab: 'archiwum', people: ['corge'] });
  s.setContacts([contact({})]);
  const { container, calls } = mount(s);
  clickChip(container, 'Osoby z listow');
  const btn = q(container, '[data-arch-add-book]') as unknown as {
    getAttribute(n: string): string | null;
    click(): void;
  };
  assert.equal(btn.getAttribute('disabled'), '1', 'wylaczone dla osoby z ksiazki');
  assert.equal(
    btn.getAttribute('title'),
    'Juz w ksiazce.',
    'tooltip wylaczonego przycisku',
  );
  click(btn);
  assert.equal(calls.saves.length, 0, 'wylaczony przycisk nie zapisuje');
});

test('archiwum: po dopisaniu do ksiazki przycisk sie wylacza (repaint)', () => {
  const s = new MailUiStore({ tab: 'archiwum', people: [] });
  s.setContacts([contact({})]);
  const { container } = mount(s);
  clickChip(container, 'Osoby z listow');
  click(q(container, '[data-arch-add-book]'));
  const btn = q(container, '[data-arch-add-book]') as unknown as {
    getAttribute(n: string): string | null;
  };
  assert.equal(btn.getAttribute('disabled'), '1', 'repaint widzi swieza ksiazke');
});

// --- skok i panel ------------------------------------------------------------

test('archiwum: skok z osoby filtruje liste listow i wraca na chips listy', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const { container } = mount(s);
  // Wydanie 1.30.1 (zgloszenie 6): skok z osoby przełącza chips na
  // "Archiwum listow" - osoby i listy nie stoja jedno nad drugim.
  clickChip(container, 'Osoby z listow');
  // Zgloszenie 2026-11-05 (A2): po skoku widok przewija sie do listy
  // listow - panel osob nie wymusza dlugiego recznego scrolla.
  const scrolled: unknown[] = [];
  const proto = window.Element.prototype as unknown as { scrollIntoView(): void };
  const origScroll = proto.scrollIntoView;
  proto.scrollIntoView = function (this: unknown) {
    scrolled.push(this);
  };
  try {
    click(q(container, '[data-arch-people] .arkmail-contact-name'));
  } finally {
    proto.scrollIntoView = origScroll;
  }
  assert.ok(
    scrolled.some(
      (el) => (el as { className?: string }).className === 'arkmail-arch-list',
    ),
    'skok przewija widok do listy listow',
  );
  assert.equal(s.state.tab, 'archiwum', 'zostajemy w archiwum');
  assert.equal(
    text(qa(container, '.arkmail-subpill.is-active')[0]),
    'Archiwum listow',
    'chips listy aktywny po skoku',
  );
  assert.ok(q(container, '.arkmail-arch-list'), 'lista listow na widoku po skoku');
  const osoba = q(container, '[data-pane-key="archiwum"] [data-filter="osoba"]') as {
    value: string;
  };
  assert.equal(osoba.value, 'Corge', 'filtr osoby ustawiony przez skok');
});

test('archiwum: panel osob bez duplikatu klawisza indeksacji (zostaje krok 1)', () => {
  // Zgloszenie 2026-11-05: jeden klawisz "Indeksuj wszystkie skrzynki"
  // wystarczy - ten z kroku 1. Dolny duplikat z panelu osob znika.
  const s = new MailUiStore({ tab: 'archiwum' });
  const { container } = mount(s);
  const all = qa(container, '.arkmail-index-all');
  assert.equal(all.length, 1, 'dokladnie jeden klawisz indeksacji w zakladce');
  clickChip(container, 'Osoby z listow');
  const p = panel(container) as { querySelector(s: string): unknown };
  assert.ok(!p.querySelector('.arkmail-index-all'), 'panel osob bez klawisza indeksacji');
});
