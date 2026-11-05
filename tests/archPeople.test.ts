/**
 * Fala UI-2 krok 4: indeks osob zebranych z listow jako zwijany panel
 * w zakladce Archiwum ("Osoby z listow"). Zastepuje sub-pigulke Osoby
 * w Kontaktach (usunieta w tym kroku). Panel: naglowek z licznikiem,
 * filtr + sort (jak dawniej), wiersz osoby z licznikami, przyciskami
 * kierunku (skok do archiwum) i nowym przyciskiem "Do ksiazki"
 * (dopisanie do ksiazki adresowej przez onSavePeople). Skok z osoby
 * rozwija panel (kontekst osoby widoczny przy przefiltrowanej liscie)
 * i przewija widok do listy listow (zgloszenie 2026-11-05, A2).
 * Zgloszenie 2026-11-05 (A1): panel domyslnie ZWINIETY - lista listow
 * ma byc od razu na widoku; rozwiniecie = klik w naglowek, a rozwineta
 * lista osob scrolluje sie wlasnym kontenerem (max-height + overflow).
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
const toggle = (container: unknown): unknown => q(container, '[data-arch-people-toggle]');

// --- panel ------------------------------------------------------------------

test('archiwum: panel Osoby z listow domyslnie zwiniety, toggle rozwija liste', () => {
  // Zgloszenie 2026-11-05 (A1): domyslnie zwiniety - lista listow od
  // razu na widoku; rozwineta lista osob ma wlasny kontener scrolla.
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({}), contact({ name: 'Foo', lettersReceived: 1, lettersSent: 0 })]);
  const { container } = mount(s);
  assert.ok(panel(container), 'panel istnieje');
  assert.match(text(panel(container)), /Osoby z listow \(2\)/, 'naglowek z licznikiem');
  assert.equal(
    qa(container, '[data-arch-people] .arkmail-contact').length,
    0,
    'domyslnie zwiniety - bez wierszy',
  );
  click(toggle(container));
  const names = qa(container, '[data-arch-people] .arkmail-contact-name').map(text);
  assert.deepEqual(names, ['Corge', 'Foo'], 'osoby z listami w kolejnosci po rozwinieciu');
  assert.ok(
    q(container, '.arkmail-arch-people-list'),
    'rozwineta lista osob z wlasna klasa kontenera scrolla',
  );
});

test('archiwum: panel domyslnie zwiniety, toggle rozwija i zwija', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const { container } = mount(s);
  assert.equal(qa(container, '[data-arch-people] .arkmail-contact').length, 0, 'zwiniety');
  click(toggle(container));
  assert.equal(qa(container, '[data-arch-people] .arkmail-contact').length, 1, 'rozwiniety');
  assert.ok(panel(container), 'naglowek zostaje po zwinieciu');
  click(toggle(container));
  assert.equal(qa(container, '[data-arch-people] .arkmail-contact').length, 0, 'z powrotem zwiniety');
});

test('archiwum: filtr panelu dziala na liscie osob', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({}), contact({ name: 'Foo', lettersReceived: 1, lettersSent: 0 })]);
  const { container } = mount(s);
  click(toggle(container));
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
  click(toggle(container));
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
  click(toggle(container));
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
  click(toggle(container));
  click(q(container, '[data-arch-add-book]'));
  const btn = q(container, '[data-arch-add-book]') as unknown as {
    getAttribute(n: string): string | null;
  };
  assert.equal(btn.getAttribute('disabled'), '1', 'repaint widzi swieza ksiazke');
});

// --- skok i panel ------------------------------------------------------------

test('archiwum: skok z osoby filtruje liste listow, panel zostaje rozwiniety', () => {
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const { container } = mount(s);
  // Skok z wiersza osoby: zostajemy w archiwum, filtr osoby dostaje
  // imie, panel NIE zwinie sie przy skoku (jumpTo ustawia
  // archPeopleOpen = true - zabezpieczenie na wypadek skoku z
  // zrodla przy zwinietych wierszach, np. przyszle przyciski w
  // kroku 5). Zwiniety panel nie pokazuje wierszy, wiec najpierw
  // rozwijamy go toggle'm.
  click(toggle(container));
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
    qa(container, '[data-arch-people] .arkmail-contact').length,
    1,
    'panel rozwiniety po skoku',
  );
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
  const p = panel(container) as { querySelector(s: string): unknown };
  assert.ok(!p.querySelector('.arkmail-index-all'), 'panel osob bez klawisza indeksacji');
});

test('archiwum: toggle osob ze znakiem stanu rozwiniencia', () => {
  // Zgloszenie 2026-11-05: jak w grupach - "v" rozwiniety, ">" zwiniety.
  // A1: domyslnie zwiniety (">").
  const s = new MailUiStore({ tab: 'archiwum' });
  s.setContacts([contact({})]);
  const { container } = mount(s);
  assert.match(text(toggle(container)), /^> Osoby z listow \(1\)$/, 'domyslnie zwiniety: >');
  click(toggle(container));
  assert.match(
    text(q(container, '[data-arch-people-toggle]')),
    /^v Osoby z listow \(1\)$/,
    'po kliku rozwiniety: v',
  );
});
